"""Reddit posts, anonymously.

Photos, galleries and GIFs come straight from the post's public JSON (one request). Videos
(v.redd.it, including video galleries) go through yt-dlp, which pairs Reddit's separate audio
track with the video. A post that only links to another supported platform resolves that link.

Reddit answers unauthenticated JSON from home and mobile networks but blocks most datacenter
addresses with an HTML "blocked" page, which maps to rate_limited.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Callable

from .. import __version__, net
from ..errors import ApiError
from ..media import Item, Resolved, Variant
from ..urls import platform_of_host
from . import ytdlp

# Reddit's API rules ask clients for a unique, descriptive User-Agent.
API_UA = f"python:savesama:{__version__} (personal media saver)"

_POST_ID = re.compile(r"/(?:(?:r|u|user)/[^/]+/)?comments/([A-Za-z0-9]+)")
_SHARE = re.compile(r"^/r/[^/]+/s/[A-Za-z0-9]+")
_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".gif", ".webp")

_BLOCKED = ("Reddit is blocking anonymous requests from this server's network. Try again later, "
            "or run the server on another network (home Wi-Fi or mobile data).")


def post_id(url: str) -> str | None:
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or "").lower()
    if host == "redd.it":
        pid = parts.path.strip("/").split("/")[0]
        return pid or None
    m = _POST_ID.search(parts.path)
    return m.group(1) if m else None


def _follow(url: str) -> str:
    """Share links (/r/<sub>/s/<token>) and v.redd.it links redirect to the post."""
    resp = net.request(url, ua=API_UA, follow_redirects=False)
    loc = resp.headers.get("Location") if resp.headers else None
    if loc:
        return urllib.parse.urljoin(url, loc)
    if 200 <= resp.status < 300 and post_id(resp.url):
        return resp.url
    raise ApiError("not_found", "Couldn't open that Reddit link.")


def fetch_post(pid: str) -> dict:
    resp = net.request(f"https://www.reddit.com/comments/{pid}/.json?raw_json=1", ua=API_UA,
                       headers={"Accept": "application/json"})
    return parse_listing(resp.text(), resp.status)


def parse_listing(body: str, status: int = 200) -> dict:
    """The post dict from a /comments/<id>/.json answer, or raise."""
    if status == 429:
        raise ApiError("rate_limited", "Reddit is rate-limiting this server. Try again in a minute.")
    try:
        data = json.loads(body)
    except ValueError:
        if status >= 500:
            raise ApiError("network", f"Reddit returned a server error ({status}).") from None
        raise ApiError("rate_limited", _BLOCKED) from None
    if isinstance(data, dict):
        reason = (data.get("reason") or "").lower()
        if reason in ("private", "quarantined", "gated") or data.get("error") == 403:
            raise ApiError("login_required", "This post is in a private, quarantined or age-gated "
                                             "community that needs an account. SaveSama never signs in.")
        if data.get("error") == 404 or status == 404:
            raise ApiError("not_found", "This Reddit post doesn't exist or was deleted.")
        raise ApiError("unavailable", "Reddit didn't return this post.")
    try:
        return data[0]["data"]["children"][0]["data"]
    except (IndexError, KeyError, TypeError):
        raise ApiError("not_found", "This Reddit post doesn't exist or was deleted.") from None


def _thumb(post: dict) -> str | None:
    images = (post.get("preview") or {}).get("images") or []
    if images:
        res = images[0].get("resolutions") or []
        pick = next((r for r in res if (r.get("width") or 0) >= 320), None) or (res[-1] if res else None)
        return (pick or images[0].get("source") or {}).get("url")
    t = post.get("thumbnail") or ""
    return t if t.startswith("https://") else None


def _ext(url: str, default: str = "jpg") -> str:
    path = urllib.parse.urlsplit(url).path.lower()
    for ext in _IMAGE_EXTS:
        if path.endswith(ext):
            return "jpg" if ext == ".jpeg" else ext[1:]
    return default


def _image(index: int, url: str, w, h, thumb: str | None = None) -> Item:
    return Item(index=index, type="image", thumbnail=thumb or url, width=w, height=h,
                variants=[Variant(url, w, h, has_audio=False, ext=_ext(url))])


def gallery_items(post: dict) -> tuple[list[Item], int]:
    """Gallery pictures in post order, plus how many entries were videos (left to yt-dlp)."""
    meta = post.get("media_metadata") or {}
    items: list[Item] = []
    videos = 0
    for entry in (post.get("gallery_data") or {}).get("items") or []:
        m = meta.get(entry.get("media_id")) or {}
        if m.get("status") != "valid":
            continue
        if m.get("e") == "RedditVideo":
            videos += 1
            continue
        s = m.get("s") or {}
        # Animated entries: keep the GIF (what the poster uploaded); "u" is a still for photos.
        url = s.get("gif") or s.get("u")
        if not url:
            continue
        previews = m.get("p") or []
        thumb = next((p.get("u") for p in previews if (p.get("x") or 0) >= 320), None)
        items.append(_image(len(items), url, s.get("x"), s.get("y"), thumb))
    return items, videos


def image_item(post: dict) -> Item | None:
    """A single-picture post: the original on i.redd.it, else Reddit's full-size preview copy
    (which also covers pictures hosted elsewhere, such as imgur)."""
    url = post.get("url_overridden_by_dest") or post.get("url") or ""
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    images = (post.get("preview") or {}).get("images") or []
    source = images[0].get("source") if images else None
    if host == "i.redd.it" and _ext(url, "") and source:
        return _image(0, url, source.get("width"), source.get("height"), _thumb(post))
    if host == "i.redd.it" and _ext(url, ""):
        return _image(0, url, None, None)
    if post.get("post_hint") == "image" and source and source.get("url"):
        return _image(0, source["url"], source.get("width"), source.get("height"), _thumb(post))
    return None


def _is_video(post: dict) -> bool:
    media = post.get("secure_media") or post.get("media") or {}
    return bool(post.get("is_video") or media.get("reddit_video"))


def extract(url: str, can_mux: bool, follow: Callable[[str], Resolved]) -> Resolved:
    """follow resolves a link on another supported platform (a Reddit post that links to one)."""
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or "").lower()
    if host == "i.redd.it" and _ext(url, ""):
        name = parts.path.strip("/")
        return Resolved(url=url, platform="reddit", id=name.rsplit(".", 1)[0], items=[_image(0, url, None, None)],
                        referer="https://www.reddit.com/", via="direct")
    if host == "v.redd.it" or _SHARE.match(parts.path):
        url = _follow(url)
    pid = post_id(url)
    if not pid:
        raise ApiError("unsupported_url", "Share a link to a Reddit post (not a subreddit or profile).")

    post = fetch_post(pid)
    permalink = "https://www.reddit.com" + (post.get("permalink") or f"/comments/{pid}/")
    # A crosspost carries its media on the original.
    src = (post.get("crosspost_parent_list") or [post])[0]
    info = {"title": post.get("title") or None,
            "author": f"u/{post['author']}" if post.get("author") and post["author"] != "[deleted]" else None,
            "thumbnail": _thumb(src)}

    def resolved(items: list[Item], via: str) -> Resolved:
        return Resolved(url=permalink, platform="reddit", id=pid, items=items,
                        referer="https://www.reddit.com/", via=via, **info)

    if src.get("is_gallery"):
        items, videos = gallery_items(src)
        if items:
            return resolved(items, "json-gallery")
        if not videos:
            raise ApiError("unavailable", "This gallery's pictures were removed.")
    elif not _is_video(src):
        item = image_item(src)
        if item:
            return resolved([item], "json")
        dest = src.get("url_overridden_by_dest") or ""
        dest_host = (urllib.parse.urlsplit(dest).hostname or "").lower()
        if dest_host and platform_of_host(dest_host) not in (None, "reddit"):
            return follow(dest)
        if src.get("is_self") or not dest_host:
            raise ApiError("unavailable", "This is a text post; there's no photo or video to save.")
        raise ApiError("unavailable", f"This post links to {dest_host}. SaveSama only saves media "
                                      "hosted on Reddit; open that link instead.")

    res = ytdlp.resolve(permalink, "reddit", can_mux)
    res.id = res.id or pid
    # The post's own title and u/author read better than yt-dlp's.
    res.title = info["title"] or res.title
    res.author = info["author"] or res.author
    res.thumbnail = res.thumbnail or info["thumbnail"]
    return res
