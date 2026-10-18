"""Anonymous Instagram extraction.

Order: logged-out GraphQL (full media incl. video and DASH audio) -> embed page with a crawler
UA (images and most carousel videos; music reels come back "copyright_blocked" without a
video URL) -> yt-dlp (reels) -> best error.

GraphQL is the query instagram.com itself runs for a logged-out post page: an `lsd` token from
the home page, then POST /api/graphql. No cookies. If every post suddenly fails with
"execution error", Meta retired GRAPHQL_DOC_ID. Get the current one: open a public post
logged-out in a desktop browser with devtools, filter the Network tab for "api/graphql", and
copy the doc_id form field of the PolarisLoggedOutDesktopWWWPostRootContentQuery request (yt-dlp's
instagram extractor tracks it too). The older /graphql/query endpoint answers every anonymous
request with 401 "Please wait a few minutes" since autumn 2026.
"""

from __future__ import annotations

import html as html_mod
import json
import logging
import re
import string
import threading
import time
import urllib.parse

from .. import net
from ..errors import ApiError, most_specific
from ..media import Item, Resolved, Variant
from ..urls import instagram_shortcode, is_share_link
from . import meta, ytdlp

GRAPHQL_DOC_ID = "27130156389949648"
GRAPHQL_QUERY = "PolarisLoggedOutDesktopWWWPostRootContentQuery"
IG_APP_ID = "936619743392459"

log = logging.getLogger("savesama.instagram")

_LSD_RE = re.compile(r'\["LSD",\[\],\{"token":"([^"]+)"')
_EQMC_LSD_RE = re.compile(r'<script\b[^>]*\bid="__eqmc"[^>]*>\s*\{[^<]*?"l"\s*:\s*"([^"]+)"')
_CONTEXT_JSON_RE = re.compile(r'"contextJSON"\s*:\s*("(?:[^"\\]|\\.)*")')
_EMBED_IMG_RE = re.compile(r'<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"')
_SHORTCODE_ALPHABET = string.ascii_uppercase + string.ascii_lowercase + string.digits + "-_"

_lsd_lock = threading.Lock()
_lsd: tuple[str, float] | None = None
LSD_TTL = 30 * 60
# After Instagram rate-limits GraphQL, go straight to the fallbacks for a while instead of
# spending two more requests per link and deepening the limit.
GRAPHQL_COOLDOWN = 10 * 60
_graphql_blocked_until = 0.0

_RATE_LIMITED = "Instagram is limiting anonymous requests from this server. Try again in a few minutes."


def media_id(code: str) -> str:
    """Shortcode -> numeric media id (base64url digits). Private posts append 28 chars."""
    if len(code) > 28:
        code = code[:-28]
    pk = 0
    for ch in code:
        pk = pk * 64 + _SHORTCODE_ALPHABET.index(ch)
    return str(pk)


def _lsd_token() -> str:
    """The anonymous request token instagram.com embeds in every page."""
    global _lsd
    with _lsd_lock:
        if _lsd and time.time() - _lsd[1] < LSD_TTL:
            return _lsd[0]
    resp = net.request("https://www.instagram.com/")
    err = net.status_error(resp, "instagram")
    if err:
        raise err
    page = resp.text()
    m = _LSD_RE.search(page) or _EQMC_LSD_RE.search(page)
    if not m:
        raise ApiError("rate_limited", "Instagram didn't hand out an anonymous session. Try again later.")
    with _lsd_lock:
        _lsd = (m.group(1), time.time())
    return m.group(1)


def parse_graphql(body: str, status: int = 200) -> dict:
    """Return the post's media dict (private-API shape) from an /api/graphql answer, or raise."""
    try:
        data = json.loads(body)
    except ValueError:
        # Instagram answers a query it won't serve anonymously with its HTML app shell.
        if status in (200, 401, 403, 429) or "<html" in body[:500].lower():
            raise ApiError("rate_limited", _RATE_LIMITED) from None
        raise ApiError("internal", "Instagram answered with something that isn't JSON.") from None
    if data.get("status") == "fail" or data.get("require_login"):
        msg = (data.get("message") or "").lower()
        if "wait" in msg or status == 429 or data.get("require_login"):
            raise ApiError("rate_limited", _RATE_LIMITED)
        raise ApiError("login_required")
    holder = (data.get("data") or {}).get("xig_polaris_media")
    if data.get("errors") and not holder:
        log.warning("Instagram GraphQL error %s; GRAPHQL_DOC_ID %s may be retired",
                    data["errors"][:1], GRAPHQL_DOC_ID)
        raise ApiError("internal", "Instagram changed its web API. Update the server "
                                   "(Settings > Update extractor) or check GRAPHQL_DOC_ID.")
    if not holder:
        raise ApiError("not_found", "Instagram didn't return this post. It was deleted, or the "
                                    "account is private.")
    media = holder.get("if_not_gated_logged_out")
    if not media:
        raise ApiError("login_required", "Instagram only shows this post to logged-in viewers "
                                         "(age-restricted or limited), and SaveSama never uses accounts.")
    return media


def via_graphql(code: str) -> dict:
    lsd = _lsd_token()
    form = urllib.parse.urlencode({
        "lsd": lsd,
        "fb_api_caller_class": "RelayModern",
        "fb_api_req_friendly_name": GRAPHQL_QUERY,
        "server_timestamps": "true",
        "variables": json.dumps({"media_id": media_id(code)}, separators=(",", ":")),
        "doc_id": GRAPHQL_DOC_ID,
    }).encode()
    resp = net.request("https://www.instagram.com/api/graphql", method="POST", data=form, headers={
        "X-IG-App-ID": IG_APP_ID,
        "X-FB-LSD": lsd,
        "X-FB-Friendly-Name": GRAPHQL_QUERY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://www.instagram.com",
        "Referer": f"https://www.instagram.com/p/{code}/",
        "Accept": "*/*",
        # Without it Instagram serves its HTML app shell instead of the query result.
        "Sec-Fetch-Site": "same-origin",
    }, follow_redirects=False)
    if resp.status in (301, 302) or net.is_login_url(resp.url):
        raise ApiError("rate_limited", _RATE_LIMITED)
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
            return _resolved(post_url, code, meta.meta_from_api(media),
                             meta.items_from_api(media, can_mux), "graphql")
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
