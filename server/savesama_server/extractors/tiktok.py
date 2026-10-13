"""TikTok: yt-dlp for videos; our own reader for photo posts (/photo/ links and slideshows).

yt-dlp has no support for TikTok photo carousels. The post page embeds its data in
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">; a plain request gets it as long as
Accept-Language isn't yt-dlp's old default (see net.ACCEPT_LANGUAGE).
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse

from .. import net
from ..errors import ApiError
from ..media import Item, Resolved, Variant
from . import ytdlp

log = logging.getLogger("savesama.tiktok")

_DATA_RE = re.compile(r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', re.S)
NOT_FOUND = {10204, 10217}
PRIVATE = {10216, 10222}


def _expand_short(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or "").lower()
    if host.startswith(("vm.", "vt.")) or parts.path.startswith("/t/"):
        resp = net.request(url, follow_redirects=False)
        loc = resp.headers.get("Location") if resp.headers else None
        if loc:
            return urllib.parse.urljoin(url, loc)
    return url


def parse_page(html_text: str) -> dict:
    """The post's itemStruct, or raise the matching API error."""
    m = _DATA_RE.search(html_text)
    if not m:
        raise ApiError("rate_limited", "TikTok didn't return the post page. Try again in a few minutes.")
    try:
        scope = json.loads(m.group(1)).get("__DEFAULT_SCOPE__") or {}
    except ValueError:
        raise ApiError("internal", "TikTok's page data couldn't be read.") from None
    detail = scope.get("webapp.video-detail") or scope.get("webapp.photo-detail") or {}
    status = detail.get("statusCode")
    if status in NOT_FOUND:
        raise ApiError("not_found", "This TikTok post doesn't exist or was deleted.")
    if status in PRIVATE:
        raise ApiError("login_required", "This TikTok post is private.")
    item = (detail.get("itemInfo") or {}).get("itemStruct")
    if not item:
        raise ApiError("unavailable", "TikTok didn't include this post's media.")
    return item


def photo_items(item: dict) -> list[Item]:
    images = (item.get("imagePost") or {}).get("images") or []
    items: list[Item] = []
    for img in images:
        urls = (img.get("imageURL") or {}).get("urlList") or []
        if not urls:
            continue
        # Prefer a JPEG/plain rendition over HEIC/WebP-only ones for gallery compatibility.
        url = next((u for u in urls if ".jpeg" in u or ".jpg" in u), urls[0])
        w, h = img.get("imageWidth"), img.get("imageHeight")
        items.append(Item(index=len(items), type="image", thumbnail=url, width=w, height=h,
                          variants=[Variant(url, w, h, has_audio=False, ext="jpg")]))
    music = item.get("music") or {}
    if items and music.get("playUrl"):
        items.append(Item(index=len(items), type="audio", thumbnail=music.get("coverMedium") or music.get("coverThumb"),
                          duration=music.get("duration"), has_audio=True,
                          variants=[Variant(music["playUrl"], has_audio=True, ext="mp3")]))
    return items


def via_page(url: str) -> Resolved | None:
    resp = net.request(url)
    if net.is_login_url(resp.url):
        raise ApiError("login_required", "TikTok wants a signed-in user for this post.")
    err = net.status_error(resp, "tiktok")
    if err:
        raise err
    item = parse_page(resp.text())
    items = photo_items(item)
    if not items:
        return None  # a regular video: yt-dlp's job
    author = (item.get("author") or {}).get("uniqueId")
    post_id = str(item.get("id") or "")
    return Resolved(url=f"https://www.tiktok.com/@{author or '_'}/photo/{post_id}", platform="tiktok",
                    id=post_id, title=item.get("desc") or None, author=author, items=items,
                    referer="https://www.tiktok.com/", via="page")


def extract(url: str, can_mux: bool) -> Resolved:
    url = _expand_short(url)
    if "/photo/" in urllib.parse.urlsplit(url).path:
        res = via_page(url)
        if res:
            return res
    try:
        res = ytdlp.resolve(url, "tiktok", can_mux)
        if all(i.type == "audio" for i in res.items):
            # A slideshow: yt-dlp only sees its soundtrack.
            try:
                return via_page(url) or res
            except ApiError:
                return res
        return res
    except ApiError as e:
        if e.code not in ("unavailable", "unsupported_url", "internal"):
            raise
        # A slideshow shared as /video/ has only an mp3 "format" for yt-dlp: read the photos.
        try:
            res = via_page(url)
        except ApiError:
            raise e from None
        if res:
            return res
        raise
