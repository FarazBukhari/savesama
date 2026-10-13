"""Minimal HTTP client for the server's own extractors (stdlib urllib, no cookie jar)."""

from __future__ import annotations

import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from email.message import Message

from .errors import ApiError
from .urls import is_allowed_url

DESKTOP_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
# Link-preview crawlers get server-rendered pages (embed media, og: tags, share redirects).
CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
SEARCH_BOT_UA = "Googlebot/2.1 (+http://www.google.com/bot.html)"
# TikTok's WAF answers yt-dlp's default "en-us,en;q=0.5" with a maintenance page.
ACCEPT_LANGUAGE = "en-US,en;q=0.9"

MAX_PAGE_BYTES = 12 * 1024 * 1024


def ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    try:  # python.org builds on macOS ship without a CA store; certifi fills the gap
        import certifi

        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    return ctx


_SSL = ssl_context()


@dataclass
class Response:
    status: int
    url: str
    headers: Message
    body: bytes = field(repr=False)

    def text(self) -> str:
        return self.body.decode("utf-8", "replace")


class _PlatformOnlyRedirects(urllib.request.HTTPRedirectHandler):
    """Follow redirects only while they stay on a supported platform's host."""

    def __init__(self, follow: bool):
        self.follow = follow

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = urllib.parse.urljoin(req.full_url, newurl)
        if not self.follow or not is_allowed_url(newurl):
            return None  # urllib then surfaces the 3xx as an HTTPError we return as-is
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def request(url: str, *, method: str = "GET", headers: dict | None = None,
            data: bytes | None = None, ua: str = DESKTOP_UA, timeout: float = 20,
            follow_redirects: bool = True, max_bytes: int = MAX_PAGE_BYTES) -> Response:
    """Fetch a platform page. Any HTTP status is returned; transport failures raise network."""
    if not is_allowed_url(url):
        raise ApiError("unsupported_url")
    hdrs = {"User-Agent": ua, "Accept-Language": ACCEPT_LANGUAGE,
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=_SSL), _PlatformOnlyRedirects(follow_redirects))
    try:
        with opener.open(req, timeout=timeout) as resp:
            return Response(resp.status, resp.url, resp.headers, resp.read(max_bytes))
    except urllib.error.HTTPError as e:
        try:
            body = e.read(max_bytes)
        except Exception:
            body = b""
        return Response(e.code, e.url or url, e.headers, body)
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, ssl.SSLError) as e:
        reason = getattr(e, "reason", e)
        raise ApiError("network", f"Couldn't reach {urllib.parse.urlsplit(url).hostname}: {reason}") from e


def status_error(resp: Response, platform: str) -> ApiError | None:
    """Map a non-2xx platform response to an API error (None when 2xx)."""
    s = resp.status
    if 200 <= s < 300:
        return None
    name = platform.capitalize()
    if s == 404 or s == 410:
        return ApiError("not_found")
    if s == 429:
        return ApiError("rate_limited", f"{name} is rate-limiting this server. Try again in a few minutes.")
    if s in (401, 403):
        body = resp.text()[:2000].lower()
        if "wait a few minutes" in body or "rate" in body:
            return ApiError("rate_limited", f"{name} is rate-limiting this server. Try again in a few minutes.")
        return ApiError("login_required")
    if s >= 500:
        return ApiError("network", f"{name} returned a server error ({s}). Try again later.")
    return ApiError("unavailable", f"{name} answered with HTTP {s}.")


def is_login_url(url: str) -> bool:
    path = urllib.parse.urlsplit(url).path.lower()
    return path.startswith(("/login", "/accounts/login", "/checkpoint")) or "/login/" in path
