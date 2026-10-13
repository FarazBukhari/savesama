"""Which links the server accepts, and which platform they belong to.

The server only ever fetches hosts listed here (plus the CDNs those platforms hand back),
so a user-supplied URL can never make it talk to an arbitrary host.
"""

from __future__ import annotations

import re
import urllib.parse

from .errors import ApiError

PLATFORMS = ["youtube", "instagram", "tiktok", "facebook", "threads"]

PLATFORM_DOMAINS = {
    "youtube": ("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "instagram": ("instagram.com",),
    "tiktok": ("tiktok.com",),
    "facebook": ("facebook.com", "fb.watch", "fb.com"),
    "threads": ("threads.com", "threads.net"),
}

# Link shims that redirect to arbitrary third-party hosts.
BLOCKED_HOSTS = ("l.facebook.com", "lm.facebook.com", "l.instagram.com", "l.threads.com",
                 "l.threads.net")

_URL_IN_TEXT = re.compile(r"https?://[^\s<>\"']+", re.I)


def platform_of_host(host: str) -> str | None:
    host = (host or "").lower().rstrip(".")
    if not host or host in BLOCKED_HOSTS:
        return None
    for platform, domains in PLATFORM_DOMAINS.items():
        for domain in domains:
            if host == domain or host.endswith("." + domain):
                return platform
    return None


def is_allowed_url(url: str) -> bool:
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and platform_of_host(parts.hostname or "") is not None


def clean_url(raw: object) -> tuple[str, str]:
    """Validate a user-supplied link. Returns (url, platform) or raises unsupported_url.

    Share sheets often send "Look at this! https://..." so the first URL in the text is used.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise ApiError("bad_request", "Body must contain a \"url\" string.")
    text = raw.strip()
    if len(text) > 4096:
        raise ApiError("bad_request", "That link is too long.")
    match = _URL_IN_TEXT.search(text)
    if match:
        url = match.group(0).rstrip(".,);]")
    elif " " not in text and "." in text:
        url = "https://" + text
    else:
        raise ApiError("unsupported_url")
    try:
        parts = urllib.parse.urlsplit(url)
        host = parts.hostname or ""
    except ValueError:
        raise ApiError("unsupported_url") from None
    platform = platform_of_host(host)
    if parts.scheme not in ("http", "https") or platform is None or parts.username or parts.password:
        raise ApiError("unsupported_url")
    if parts.port not in (None, 80, 443):
        raise ApiError("unsupported_url")
    return urllib.parse.urlunsplit(("https", host.lower(), parts.path or "/", parts.query, "")), platform


def strip_tracking(url: str) -> str:
    """Drop query strings that only carry tracking (igsh, xmt, ...) on Meta post links."""
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


_IG_SHORTCODE = re.compile(r"/(?:[A-Za-z0-9_.]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")
_THREADS_CODE = re.compile(r"/(?:@[^/]+/)?(?:post|t)/([A-Za-z0-9_-]+)")


def instagram_shortcode(url: str) -> str | None:
    path = urllib.parse.urlsplit(url).path
    if path.startswith("/reels/audio/") or path.startswith("/reel/audio/"):
        return None
    m = _IG_SHORTCODE.search(path)
    return m.group(1) if m else None


def threads_code(url: str) -> str | None:
    m = _THREADS_CODE.search(urllib.parse.urlsplit(url).path)
    return m.group(1) if m else None


def is_share_link(url: str) -> bool:
    """Links whose path carries no post id and must be resolved by redirect."""
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or "").lower()
    if host.endswith("fb.watch"):
        return True
    return parts.path.startswith("/share/")
