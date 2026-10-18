"""Facebook: yt-dlp for videos and reels; og:image for photo posts yt-dlp can't read."""

from __future__ import annotations

import logging
import re
import urllib.parse

from .. import net
from ..errors import ApiError, most_specific
from ..media import Item, Resolved, Variant
from ..urls import is_share_link
from . import meta, ytdlp

log = logging.getLogger("savesama.facebook")

_GENERIC_IMAGES = ("/rsrc.php/", "static.xx.fbcdn.net")


def resolve_share(url: str) -> str:
    """facebook.com/share/{r,v,p}/... and fb.watch redirect to the canonical post."""
    resp = net.request(url, ua=net.CRAWLER_UA, follow_redirects=False)
    loc = resp.headers.get("Location") if resp.headers else None
    if loc:
        target = urllib.parse.urljoin(url, loc)
        if net.is_login_url(target):
            raise ApiError("login_required")
        return target
    return url


def parse_og(html_text: str, url: str) -> Resolved | None:
    tags = meta.og_tags(html_text)
    image = tags.get("image")
    if not image or any(g in image for g in _GENERIC_IMAGES):
        return None
    fbid = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("fbid", [None])[0]
    post_id = fbid or (re.findall(r"/(\d{6,}|pfbid\w+)", urllib.parse.urlsplit(url).path) or [""])[-1]
    title = tags.get("description") or tags.get("title")
    item = Item(index=0, type="image", thumbnail=image,
                width=int(tags["image:width"]) if tags.get("image:width", "").isdigit() else None,
                height=int(tags["image:height"]) if tags.get("image:height", "").isdigit() else None,
                variants=[Variant(image, has_audio=False, ext="jpg")])
    return Resolved(url=url, platform="facebook", id=post_id or "photo", title=title or None,
                    author=None, items=[item], referer="https://www.facebook.com/", via="og")


def via_og(url: str) -> Resolved:
    resp = net.request(url, ua=net.CRAWLER_UA)
    if net.is_login_url(resp.url):
        raise ApiError("login_required", "Facebook only shows this post to signed-in users.")
    err = net.status_error(resp, "facebook")
    if err:
        raise err
    res = parse_og(resp.text(), url)
    if not res:
        raise ApiError("unavailable", "This Facebook post has no photo or video SaveSama can read.")
    return res


def extract(url: str, can_mux: bool) -> Resolved:
    if is_share_link(url):
        url = resolve_share(url)
    errors: list[ApiError] = []
    try:
        return ytdlp.resolve(url, "facebook", can_mux)
    except ApiError as e:
        log.info("facebook yt-dlp: %s", e)
        errors.append(e)
        if e.code in ("rate_limited", "network"):
            raise
    try:
        return via_og(url)
    except ApiError as e:
        log.info("facebook og: %s", e)
        errors.append(e)
    raise most_specific(errors)
