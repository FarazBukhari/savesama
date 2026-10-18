"""Anonymous Threads extraction.

A logged-out browser gets an app shell, but search-engine and link-preview crawlers get
server-rendered pages (verified Oct 2026):
1. post page with a search-bot UA: embeds the full media JSON (Instagram's private-API
   shape: video_versions, image_versions2, carousel_media, video_dash_manifest);
2. /embed with a link-preview UA: <video><source> and the post's <img draggable="false">;
3. og:video / og:image on the post page.
Share links (threads.com/share/<token>) 302 to the post for a crawler UA.
"""

from __future__ import annotations

import html as html_mod
import logging
import re
import urllib.parse

from .. import net
from ..errors import ApiError, most_specific
from ..media import Item, Resolved, Variant
from ..urls import is_share_link, threads_code
from . import meta

log = logging.getLogger("savesama.threads")

_SOURCE_RE = re.compile(r'<source[^>]+src="([^"]+)"')
_POST_IMG_RE = re.compile(r'<img(?=[^>]*draggable="false")[^>]*src="([^"]+)"[^>]*>')
_POST_IMG_RE2 = re.compile(r'<img[^>]*src="([^"]+)"(?=[^>]*draggable="false")[^>]*>')


def resolve_share(url: str) -> str:
    resp = net.request(url, ua=net.CRAWLER_UA, follow_redirects=False)
    loc = resp.headers.get("Location") if resp.headers else None
    if loc:
        return urllib.parse.urljoin(url, loc)
    raise ApiError("not_found", "Couldn't open that Threads share link.")


def _post_url(url: str, code: str) -> str:
    path = urllib.parse.urlsplit(url).path
    m = re.match(r"/(@[^/]+)/post/", path)
    return f"https://www.threads.com/{m.group(1)}/post/{code}" if m else f"https://www.threads.com/t/{code}"


def parse_post_page(html_text: str, code: str, can_mux: bool) -> tuple[dict, list[Item]] | None:
    media = meta.find_api_media(html_text, code)
    if media is None:
        return None
    return meta.meta_from_api(media), meta.items_from_api(media, can_mux)


def parse_embed(html_text: str) -> list[Item]:
    items: list[Item] = []
    for src in _SOURCE_RE.findall(html_text):
        items.append(Item(index=len(items), type="video", has_audio=True,
                          variants=[Variant(html_mod.unescape(src))]))
    seen = set()
    for src in _POST_IMG_RE.findall(html_text) + _POST_IMG_RE2.findall(html_text):
        src = html_mod.unescape(src)
        if src in seen:
            continue
        seen.add(src)
        items.append(Item(index=len(items), type="image", thumbnail=src,
                          variants=[Variant(src, has_audio=False, ext="jpg")]))
    return items


def parse_og(html_text: str) -> list[Item]:
    tags = meta.og_tags(html_text)
    video = tags.get("video:secure_url") or tags.get("video") or tags.get("video:url")
    if video:
        return [Item(index=0, type="video", thumbnail=tags.get("image"), has_audio=True,
                     variants=[Variant(video)])]
    image = tags.get("image")
    # A profile picture (t51.2885-19 / -19/) is what posts without media show; not post media.
    if image and "-19/" not in image:
        return [Item(index=0, type="image", thumbnail=image,
                     variants=[Variant(image, has_audio=False, ext="jpg")])]
    return []


def extract(url: str, can_mux: bool) -> Resolved:
    if is_share_link(url):
        url = resolve_share(url)
    code = threads_code(url)
    if not code:
        raise ApiError("unsupported_url", "Share a link to a Threads post (not a profile).")
    post_url = _post_url(url, code)
    author = (re.match(r"/@([^/]+)/", urllib.parse.urlsplit(post_url).path) or [None, None])[1]
    errors: list[ApiError] = []

    try:
        resp = net.request(post_url, ua=net.SEARCH_BOT_UA)
        err = net.status_error(resp, "threads")
        if err:
            raise err
        parsed = parse_post_page(resp.text(), code, can_mux)
        if parsed:
            info, items = parsed
            return Resolved(url=post_url, platform="threads", id=code, title=info.get("title"),
                            author=info.get("author") or author, items=items,
                            referer="https://www.threads.com/", via="post-page")
        errors.append(ApiError("login_required"))
    except ApiError as e:
        if e.code == "unavailable":  # text-only post: definitive
            raise
        log.info("threads post page %s: %s", code, e)
        errors.append(e)

    for page_url, ua, parser, via in (
        (post_url + "/embed", net.CRAWLER_UA, parse_embed, "embed"),
        (post_url, net.CRAWLER_UA, parse_og, "og"),
    ):
        try:
            resp = net.request(page_url, ua=ua)
            err = net.status_error(resp, "threads")
            if err:
                raise err
            if net.is_login_url(resp.url):
                raise ApiError("login_required")
            items = parser(resp.text())
            if items:
                return Resolved(url=post_url, platform="threads", id=code, author=author, items=items,
                                referer="https://www.threads.com/", via=via)
        except ApiError as e:
            log.info("threads %s %s: %s", via, code, e)
            errors.append(e)

    err = most_specific(errors)
    if err.code == "login_required":
        raise ApiError("login_required", "Threads only showed this post to signed-in users, so "
                                         "SaveSama can't download it without an account.")
    raise err
