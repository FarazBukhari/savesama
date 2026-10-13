"""Anonymous Instagram extraction.

Order: GraphQL (full media incl. video and DASH audio) -> embed page with a crawler UA
(images and most carousel videos; music reels come back "copyright_blocked" without a
video URL) -> yt-dlp (works for reels from many networks) -> best error.

If every post suddenly fails with "execution error", Meta retired GRAPHQL_DOC_ID. Get the
current one: open a public post logged-out in a desktop browser with devtools, filter the
Network tab for "graphql/query", and copy the doc_id form field of the
PolarisPostActionLoadPostQueryQuery request.
"""

from __future__ import annotations

import html as html_mod
import json
import logging
import re
import threading
import time
import urllib.parse

from .. import net
from ..errors import ApiError, most_specific
from ..media import Item, Resolved, Variant
from ..urls import instagram_shortcode, is_share_link
from . import meta, ytdlp

GRAPHQL_DOC_ID = "10015901848480474"
IG_APP_ID = "936619743392459"

log = logging.getLogger("savesama.instagram")

_CSRF_RE = re.compile(r'\\?"csrf_token\\?"\s*:\s*\\?"([A-Za-z0-9_-]{8,})\\?"')
_CONTEXT_JSON_RE = re.compile(r'"contextJSON"\s*:\s*("(?:[^"\\]|\\.)*")')
_EMBED_IMG_RE = re.compile(r'<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"')

_csrf_lock = threading.Lock()
_csrf: tuple[str, float] | None = None
CSRF_TTL = 30 * 60
# After Instagram rate-limits GraphQL, go straight to the fallbacks for a while instead of
# spending two more requests per link and deepening the limit.
GRAPHQL_COOLDOWN = 10 * 60
_graphql_blocked_until = 0.0


def _csrf_token() -> str:
    """Anonymous CSRF token, read from the home page body (not Set-Cookie)."""
    global _csrf
    with _csrf_lock:
        if _csrf and time.time() - _csrf[1] < CSRF_TTL:
            return _csrf[0]
    resp = net.request("https://www.instagram.com/")
    err = net.status_error(resp, "instagram")
    if err:
        raise err
    m = _CSRF_RE.search(resp.text())
    if not m:
        raise ApiError("rate_limited", "Instagram didn't hand out an anonymous session. Try again later.")
    with _csrf_lock:
        _csrf = (m.group(1), time.time())
    return m.group(1)


def parse_graphql(body: str, status: int = 200) -> dict:
    """Return the shortcode_media dict from a /graphql/query answer, or raise."""
    try:
        data = json.loads(body)
    except ValueError:
        if status in (401, 403, 429) or "<html" in body[:500].lower():
            raise ApiError("rate_limited", "Instagram is limiting anonymous requests from this "
                                           "server. Try again in a few minutes.") from None
        raise ApiError("internal", "Instagram answered with something that isn't JSON.") from None
    if data.get("status") == "fail" or data.get("require_login"):
        msg = (data.get("message") or "").lower()
        if "wait" in msg or status == 429 or data.get("require_login"):
            raise ApiError("rate_limited", "Instagram is limiting anonymous requests from this server. "
                                           "Try again in a few minutes.")
        raise ApiError("login_required")
    if data.get("errors") and not (data.get("data") or {}).get("xdt_shortcode_media"):
        log.warning("Instagram GraphQL error %s; GRAPHQL_DOC_ID %s may be retired",
                    data["errors"][:1], GRAPHQL_DOC_ID)
        raise ApiError("internal", "Instagram changed its web API. Update the server "
                                   "(Settings > Update extractor) or check GRAPHQL_DOC_ID.")
    media = (data.get("data") or {}).get("xdt_shortcode_media") or (data.get("data") or {}).get("shortcode_media")
    if not media:
        raise ApiError("not_found", "Instagram didn't return this post. It was deleted, or the "
                                    "account is private.")
    return media


def via_graphql(code: str) -> dict:
    token = _csrf_token()
    form = urllib.parse.urlencode({
        "variables": json.dumps({"shortcode": code, "fetch_tagged_user_count": None,
                                 "hoisted_comment_id": None, "hoisted_reply_id": None},
                                separators=(",", ":")),
        "doc_id": GRAPHQL_DOC_ID,
    }).encode()
    resp = net.request("https://www.instagram.com/graphql/query", method="POST", data=form, headers={
        "X-IG-App-ID": IG_APP_ID,
        "X-CSRFToken": token,
        "Cookie": f"csrftoken={token}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://www.instagram.com",
        "Referer": f"https://www.instagram.com/p/{code}/",
        "Accept": "*/*",
    }, follow_redirects=False)
    if resp.status in (301, 302) or net.is_login_url(resp.url):
        raise ApiError("rate_limited", "Instagram is limiting anonymous requests from this server.")
    if resp.status >= 500:
        raise ApiError("network", f"Instagram returned a server error ({resp.status}).")
    return parse_graphql(resp.text(), resp.status)


_MEDIA_TYPE_RE = re.compile(r'data-media-type="(Graph\w+)"')
_SHARED_BY_RE = re.compile(r'alt="[^"]*?(?:@|&#064;)([A-Za-z0-9_.]+)"')


def parse_embed(html_text: str) -> tuple[dict | None, str | None, str | None]:
    """(graph-shaped shortcode_media or None, photo URL or None, author or None).

    Photo embeds carry no contextJSON, only the <img class="EmbeddedMediaImage"> whose src is
    the full-size picture. The photo URL is only returned when the post is a single photo
    (GraphImage), so a video can never silently degrade to its poster frame.
    """
    m = _CONTEXT_JSON_RE.search(html_text)
    media, kind = None, None
    if m:
        try:
            ctx = json.loads(json.loads(m.group(1)))
            media = ((ctx.get("gql_data") or {}).get("shortcode_media")) or None
            kind = (ctx.get("context") or {}).get("type")
        except (ValueError, TypeError, AttributeError):
            media = None
    if not kind:
        t = _MEDIA_TYPE_RE.search(html_text)
        kind = t.group(1) if t else None
    img = _EMBED_IMG_RE.search(html_text) if kind == "GraphImage" else None
    author = _SHARED_BY_RE.search(html_text)
    return (media, html_mod.unescape(img.group(1)) if img else None,
            author.group(1) if author else None)


def via_embed(code: str) -> tuple[dict | None, str | None, str | None]:
    resp = net.request(f"https://www.instagram.com/p/{code}/embed/captioned/", ua=net.CRAWLER_UA)
    err = net.status_error(resp, "instagram")
    if err:
        raise err
    if net.is_login_url(resp.url):
        raise ApiError("login_required")
    media, img, author = parse_embed(resp.text())
    if media is None and img is None:
        raise ApiError("not_found", "Instagram didn't return this post. It was deleted, or the "
                                    "account is private.")
    return media, img, author


def resolve_share(url: str) -> str:
    """instagram.com/share/... links redirect to the real post for a crawler UA."""
    resp = net.request(url, ua=net.CRAWLER_UA, follow_redirects=False)
    loc = resp.headers.get("Location") if resp.headers else None
    if loc:
        return urllib.parse.urljoin(url, loc)
    if 200 <= resp.status < 300 and instagram_shortcode(resp.url):
        return resp.url
    raise ApiError("not_found", "Couldn't open that Instagram share link.")


def extract(url: str, can_mux: bool) -> Resolved:
    if is_share_link(url):
        url = resolve_share(url)
    path = urllib.parse.urlsplit(url).path
    if "/audio/" in path:
        raise ApiError("unavailable", "Instagram song pages can't be downloaded. Share the reel "
                                      "itself and save it as audio.")
    if path.startswith("/stories/"):
        raise ApiError("login_required", "Instagram stories need an account to view.")
    code = instagram_shortcode(url)
    if not code:
        raise ApiError("unsupported_url", "Share a link to an Instagram post or reel (not a profile).")
    post_url = f"https://www.instagram.com/p/{code}/"
    errors: list[ApiError] = []

    global _graphql_blocked_until
    if time.time() >= _graphql_blocked_until:
        try:
            media = via_graphql(code)
            info = meta.meta_from_graph(media)
            return _resolved(post_url, code, info, meta.items_from_graph(media, can_mux), "graphql")
        except ApiError as e:
            log.info("instagram graphql %s: %s", code, e)
            if e.code == "rate_limited":
                _graphql_blocked_until = time.time() + GRAPHQL_COOLDOWN
            errors.append(e)

    partial = None
    try:
        media, img, author = via_embed(code)
        if media:
            items = meta.items_from_graph(media, can_mux)
            res = _resolved(post_url, code, meta.meta_from_graph(media), items, "embed")
            if meta.is_complete(items):
                return res
            partial = res
        elif img:
            item = Item(index=0, type="image", thumbnail=img,
                        variants=[Variant(img, has_audio=False, ext="jpg")])
            # A single photo is complete, and yt-dlp can't read photos anyway.
            return _resolved(post_url, code, {"id": code, "author": author}, [item], "embed-img")
    except ApiError as e:
        log.info("instagram embed %s: %s", code, e)
        errors.append(e)

    try:
        res = ytdlp.resolve(post_url, "instagram", can_mux)
        res.id = res.id or code
        if partial and len(partial.items) > len(res.items):
            # yt-dlp only sees a carousel's videos (in post order); keep the embed's full item
            # list and fill each video the embed couldn't expose from the matching yt-dlp video.
            ytdlp_videos = [i for i in res.items if i.type == "video"]
            nth = 0
            for idx, it in enumerate(partial.items):
                if it.type != "video":
                    continue
                if not it.variants and nth < len(ytdlp_videos):
                    repl = ytdlp_videos[nth]
                    repl.index = idx
                    partial.items[idx] = repl
                nth += 1
            partial.cookies = res.cookies
            if meta.is_complete(partial.items):
                return partial
        else:
            return res
    except ApiError as e:
        log.info("instagram yt-dlp %s: %s", code, e)
        errors.append(e)

    raise most_specific(errors)


def _resolved(url: str, code: str, info: dict, items: list[Item], via: str) -> Resolved:
    return Resolved(url=url, platform="instagram", id=info.get("id") or code, title=info.get("title"),
                    author=info.get("author"), items=items, referer="https://www.instagram.com/", via=via)
