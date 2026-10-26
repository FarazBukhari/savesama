"""yt-dlp adapter: resolve to Items, pick formats by our quality rule, map errors.

No cookies are ever loaded: no cookiefile, no cookies-from-browser. yt-dlp's in-memory jar
only holds the anonymous session cookies a platform hands out during one extraction
(TikTok's CDN refuses downloads without them), and they're never written to disk.
"""

from __future__ import annotations

import copy
import functools
import logging
import os
import re
import shutil
import threading
from typing import Callable

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError, GeoRestrictedError

try:
    from yt_dlp.networking.exceptions import HTTPError, TransportError
except ImportError:  # pragma: no cover - very old yt-dlp
    HTTPError = TransportError = ()  # type: ignore[assignment]

from ..errors import ApiError, most_specific
from ..media import Item, Resolved, pick_rung, short_side
from ..net import ACCEPT_LANGUAGE

log = logging.getLogger("savesama.ytdlp")

# Only these extractors may run. Excludes the generic extractor and link-shim redirectors,
# so a crafted link can't make yt-dlp fetch an arbitrary host.
ALLOWED_EXTRACTORS = [
    "youtube", "youtubeytbe", "youtube:clip", "youtube:shorts:pivot:audio",
    "instagram", "instagramios",
    "tiktok", "vm.tiktok",
    "facebook", "facebook:reel", "facebookpluginsvideo",
    "reddit",
    "end",  # UnsupportedURLIE: turns anything else into "Unsupported URL"
]

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".savesama", "cache", "yt-dlp")


class Cancelled(Exception):
    pass


class _Logger:
    def __init__(self):
        self.warnings: list[str] = []

    def debug(self, msg):
        log.debug("%s", msg)

    def info(self, msg):
        log.debug("%s", msg)

    def warning(self, msg):
        log.debug("warning: %s", msg)
        if len(self.warnings) < 50:
            self.warnings.append(str(msg))

    def error(self, msg):
        log.debug("error: %s", msg)


@functools.lru_cache(maxsize=1)
def js_runtimes() -> dict:
    """JavaScript runtimes yt-dlp may use for YouTube's challenges (EJS).

    yt-dlp only enables deno unless told otherwise, and Termux has no deno, so we pass every
    runtime we can find, node first (Termux: `pkg install nodejs-lts`). yt-dlp itself
    ignores ones below its minimum versions (node 22, deno 2.3, bun 1.2.11).
    """
    found = {}
    for name in ("node", "deno", "bun"):
        path = shutil.which(name)
        if path:
            found[name] = {"path": path}
    return found


@functools.lru_cache(maxsize=1)
def has_ejs() -> bool:
    try:
        import yt_dlp_ejs  # noqa: F401
        return True
    except ImportError:
        return False


def runtime_summary() -> str:
    rts = js_runtimes()
    if not rts:
        return ("no JavaScript runtime found: YouTube may offer fewer formats or fail. "
                "Install Node.js 22+ (Termux: pkg install nodejs-lts).")
    try:
        from yt_dlp.utils._jsruntime import BunJsRuntime, DenoJsRuntime, NodeJsRuntime

        classes = {"node": NodeJsRuntime, "deno": DenoJsRuntime, "bun": BunJsRuntime}
        parts = []
        for name, cfg in rts.items():
            info = classes[name](path=cfg["path"]).info
            if info:
                parts.append(f"{name} {info.version}" + ("" if info.supported else " (too old)"))
        return ", ".join(parts) or "none usable"
    except Exception:
        return ", ".join(rts)


def base_params(**extra) -> dict:
    params = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "logger": _Logger(),
        "http_headers": {"Accept-Language": ACCEPT_LANGUAGE},
        "js_runtimes": js_runtimes(),
        "allowed_extractors": ALLOWED_EXTRACTORS,
        "socket_timeout": 20,
        "retries": 3,
        "fragment_retries": 5,
        "extractor_retries": 2,
        "cachedir": CACHE_DIR,
        "check_formats": False,
        "color": {"stdout": "never", "stderr": "never"},
    }
    if not has_ejs():
        # Without the bundled solver scripts, let yt-dlp fetch them from its own GitHub release.
        params["remote_components"] = ["ejs:github"]
    params.update(extra)
    return params


def _new_ydl(params: dict) -> yt_dlp.YoutubeDL:
    return yt_dlp.YoutubeDL(params)


# ---- format classification -------------------------------------------------------------

def _is_video(f: dict) -> bool:
    if f.get("vcodec") == "none":
        return False
    if f.get("ext") == "mhtml" or "storyboard" in (f.get("format_note") or "").lower():
        return False
    if f.get("vcodec") is None and f.get("acodec") not in (None, "none") and not (f.get("width") or f.get("height")):
        return False  # audio-only format with unknown vcodec
    return True


def _is_audio_only(f: dict) -> bool:
    return f.get("vcodec") == "none" and f.get("acodec") not in (None, "none")


def _has_audio(f: dict) -> bool:
    # Unknown acodec on a video format (Facebook's progressive sd/hd) means muxed.
    return f.get("acodec") != "none"


_FB_GUESS = {"hd": 720, "sd": 360}


def fmt_short(f: dict) -> int | None:
    s = short_side(f.get("width"), f.get("height"))
    if s:
        return s
    # Facebook's progressive renditions carry no dimensions; "hd" is 720p, "sd" 360p.
    return _FB_GUESS.get(str(f.get("format_id")))


def _vcodec_score(f: dict) -> int:
    v = (f.get("vcodec") or "").lower()
    if v.startswith(("avc1", "h264")):
        return 3
    if not v:
        return 2  # unknown: Facebook/Instagram progressive MP4s are H.264
    if v.startswith(("vp9", "vp09", "hevc", "hvc1", "h265")):
        return 1
    return 0


def _is_aac(f: dict) -> bool:
    return (f.get("acodec") or "").lower().startswith(("mp4a", "aac"))


def _audio_score(f: dict) -> tuple:
    # "-drc" is YouTube's dynamic-range-compressed copy of the same track.
    return (_is_aac(f) or f.get("ext") == "m4a", "drc" not in str(f.get("format_id")),
            f.get("abr") or f.get("tbr") or 0)


def _proto_score(f: dict) -> int:
    return 1 if (f.get("protocol") or "https").startswith("http") else 0


def usable_videos(formats: list[dict], can_mux: bool) -> list[dict]:
    vids = [f for f in formats if _is_video(f)]
    if not can_mux:
        vids = [f for f in vids if _has_audio(f) and _proto_score(f)]
    return vids


def qualities(formats: list[dict], can_mux: bool) -> list[int]:
    return sorted({s for s in (fmt_short(f) for f in usable_videos(formats, can_mux)) if s}, reverse=True)


def choose_format(formats: list[dict], mode: str, quality, can_mux: bool) -> str:
    """Return a yt-dlp format spec ("137+140", "18", ...) for our rules, or raise."""
    audio_only = sorted((f for f in formats if _is_audio_only(f)), key=_audio_score, reverse=True)
    if mode == "audio":
        m4a = [f for f in audio_only if _audio_score(f)[0]]
        if m4a:
            return m4a[0]["format_id"]
        if can_mux:
            muxed = [f for f in usable_videos(formats, True) if _has_audio(f)]
            muxed_aac = [f for f in muxed if _is_aac(f) or not f.get("acodec")]
            pool = muxed_aac or ([] if audio_only else muxed)
            if pool:  # smallest muxed rendition; ffmpeg copies its audio track out
                return min(pool, key=lambda f: (fmt_short(f) or 0, f.get("tbr") or 0))["format_id"]
        if audio_only:
            return audio_only[0]["format_id"]
        if not can_mux:
            raise ApiError("unavailable", "Saving just the audio of this post needs ffmpeg on the server.")
        raise ApiError("unavailable", "This post has no audio track.")

    vids = usable_videos(formats, can_mux)
    if not vids:
        if [f for f in formats if _is_video(f)]:
            raise ApiError("unavailable", "This video needs ffmpeg on the server to combine its "
                                          "video and audio streams.")
        raise ApiError("unavailable", "This post has no video to save.")
    sized = [f for f in vids if fmt_short(f)]
    if sized:
        rung = pick_rung([fmt_short(f) for f in sized], quality)
        pool = [f for f in sized if fmt_short(f) == rung]
    else:
        pool = vids
    best = max(pool, key=lambda f: (_vcodec_score(f), _has_audio(f), f.get("ext") == "mp4",
                                    _proto_score(f), f.get("tbr") or 0))
    if _has_audio(best) or not audio_only:
        return best["format_id"]
    return f"{best['format_id']}+{audio_only[0]['format_id']}"


# ---- resolve ---------------------------------------------------------------------------

def fill_progressive_dims(formats: list[dict], width, height) -> None:
    """Give Facebook's dimensionless "hd" progressive the video's own size (capped at 720p).

    Without this "hd" is guessed as 720p even for a 480x848 reel, so the item would claim a
    720 quality and the 480 rung would miss the muxed file that really is 480p.
    """
    if not (width and height):
        return
    s = min(width, height)
    scale = min(1.0, _FB_GUESS["hd"] / s)
    for f in formats:
        if str(f.get("format_id")) == "hd" and not (f.get("width") or f.get("height")):
            f["width"], f["height"] = round(width * scale), round(height * scale)


def _dims_at(fmt: dict, entry: dict) -> tuple[int | None, int | None]:
    """The format's dimensions; for a dimensionless one, the entry's aspect at its rung."""
    w, h = fmt.get("width"), fmt.get("height")
    if w and h:
        return w, h
    ew, eh, s = entry.get("width"), entry.get("height"), fmt_short(fmt)
    if ew and eh and s:
        scale = s / min(ew, eh)
        return round(ew * scale), round(eh * scale)
    return None, None


def entry_thumbnail(entry: dict) -> str | None:
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    # yt-dlp sorts thumbnails worst to best (the same pick it uses for "thumbnail").
    urls = [t["url"] for t in entry.get("thumbnails") or [] if isinstance(t, dict) and t.get("url")]
    return urls[-1] if urls else None


def _entry_items(info: dict, can_mux: bool) -> list[Item]:
    if info.get("_type") in ("playlist", "multi_video"):
        entries = [e for e in (info.get("entries") or []) if isinstance(e, dict)]
    else:
        entries = [info]
    items = []
    for pos, e in enumerate(entries, start=1):
        formats = e.get("formats") or ([e] if e.get("url") else [])
        fill_progressive_dims(formats, e.get("width"), e.get("height"))
        vids = [f for f in formats if _is_video(f)]
        auds = [f for f in formats if _is_audio_only(f)]
        thumb = entry_thumbnail(e)
        if vids:
            top = max(usable_videos(formats, can_mux) or vids, key=lambda f: (fmt_short(f) or 0))
            width, height = _dims_at(top, e)
            item = Item(index=len(items), type="video", thumbnail=thumb, width=width, height=height,
                        duration=e.get("duration"), has_audio=bool(auds) or any(_has_audio(f) for f in vids),
                        qualities=qualities(formats, can_mux))
        elif auds:
            item = Item(index=len(items), type="audio", thumbnail=thumb,
                        duration=e.get("duration"), has_audio=True)
        else:
            continue
        item.source = "ytdlp"
        item.entry = e
        item.playlist_index = pos if info is not e else None
        items.append(item)
    return items


# Warnings that accompany a "no formats" result but never explain it.
_WARNING_NOISE = ("unable to download webpage", "po token", "visitor data", "extractor failed to obtain",
                  "no video formats found", "requested format is not available", "falling back",
                  "retrying", "unable to download api page", "nsig", "n challenge", "javascript runtime")


def no_formats_error(warnings: list[str], platform: str) -> ApiError:
    """The error yt-dlp would have raised, recovered from the warnings ignore_no_formats_error
    turned it into (e.g. YouTube's bot check, or "Video unavailable" for an unknown id)."""
    reasons = [w for w in warnings if not any(k in w.lower() for k in _WARNING_NOISE)]
    mapped = [map_error(ExtractorError(w, expected=True), platform) for w in reasons]
    mapped = [e for e in mapped if e.code != "internal"]
    if mapped:
        return most_specific(mapped)
    return ApiError("unavailable", "This post has no video or audio to save.")


def resolve(url: str, platform: str, can_mux: bool) -> Resolved:
    logger = _Logger()
    params = base_params(
        format=lambda ctx: ctx["formats"][-1:],  # any; we only want the processed formats
        # Image entries in a carousel have no formats; without this the whole post would fail.
        # The swallowed reason comes back through the logger (no_formats_error).
        ignore_no_formats_error=True,
        simulate=True,
        logger=logger,
    )
    with _new_ydl(params) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as e:  # noqa: BLE001 - every yt-dlp failure is mapped below
            raise map_error(e, platform) from e
        cookies = list(ydl.cookiejar)
    if not info:
        raise no_formats_error(logger.warnings, platform)
    items = _entry_items(info, can_mux)
    if not items:
        raise no_formats_error(logger.warnings, platform)
    return Resolved(
        url=url, platform=platform, id=str(info.get("id") or ""),
        title=info.get("title") or info.get("description") or None,
        author=info.get("uploader") or info.get("channel") or info.get("uploader_id"),
        thumbnail=entry_thumbnail(info) or items[0].thumbnail,
        duration=info.get("duration") if len(items) == 1 else None,
        items=items, cookies=cookies, via="yt-dlp",
    )


# ---- download --------------------------------------------------------------------------

def download(resolved: Resolved, item: Item, mode: str, quality, can_mux: bool, tmpdir: str,
             on_progress: Callable[[dict], None], on_processing: Callable[[], None],
             cancel: threading.Event) -> str:
    """Download one yt-dlp item into tmpdir and return the finished file's path."""
    holder: dict = {}

    entry = item.entry or {}

    def selector(ctx):
        fill_progressive_dims(ctx["formats"], entry.get("width"), entry.get("height"))
        spec = choose_format(ctx["formats"], mode, quality, can_mux)
        holder["spec"] = spec
        return holder["ydl"].build_format_selector(spec)(ctx)

    def progress_hook(d):
        if cancel.is_set():
            raise Cancelled()
        on_progress(d)

    def pp_hook(d):
        if cancel.is_set():
            raise Cancelled()
        if d.get("status") == "started":
            on_processing()

    postprocessors = []
    if can_mux and mode == "audio":
        postprocessors.append({"key": "FFmpegExtractAudio", "preferredcodec": "m4a"})
    elif can_mux:
        postprocessors.append({"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"})

    params = base_params(
        format=selector,
        outtmpl={"default": "%(id).60s.%(ext)s"},
        paths={"home": tmpdir, "temp": tmpdir},
        merge_output_format="mp4",
        postprocessors=postprocessors,
        progress_hooks=[progress_hook],
        postprocessor_hooks=[pp_hook],
        overwrites=True,
        continuedl=False,
        http_chunk_size=10 * 1024 * 1024,
        concurrent_fragment_downloads=4,
    )

    def run(fresh: bool):
        with _new_ydl(params) as ydl:
            holder["ydl"] = ydl
            for c in resolved.cookies or []:
                ydl.cookiejar.set_cookie(c)
            if fresh:
                if item.playlist_index:
                    ydl.params["playlist_items"] = str(item.playlist_index)
                ydl.extract_info(resolved.url, download=True)
            else:
                ydl.process_ie_result(copy.deepcopy(item.entry), download=True)

    try:
        try:
            run(fresh=False)
        except (DownloadError, ExtractorError) as e:
            if cancel.is_set() or _find_cause(e, Cancelled) or _is_api(e):
                raise
            # Signed URLs from the resolve step may have expired: extract again once.
            log.info("retrying %s with a fresh extraction: %s", resolved.url, _short(e))
            _clear(tmpdir)
            run(fresh=True)
    except Exception as e:  # noqa: BLE001
        if cancel.is_set() or _find_cause(e, Cancelled):
            raise Cancelled() from e
        api = _find_cause(e, ApiError)
        if api:
            raise api from e
        raise map_error(e, resolved.platform) from e
    return _output_file(tmpdir)


def _clear(tmpdir: str):
    for name in os.listdir(tmpdir):
        try:
            os.remove(os.path.join(tmpdir, name))
        except OSError:
            pass


def _output_file(tmpdir: str) -> str:
    files = [os.path.join(tmpdir, n) for n in os.listdir(tmpdir)
             if not n.endswith((".part", ".ytdl", ".temp", ".tmp")) and ".part-Frag" not in n
             and os.path.isfile(os.path.join(tmpdir, n))]
    if not files:
        raise ApiError("internal", "The download finished but produced no file.")
    return max(files, key=os.path.getsize)


# ---- errors ----------------------------------------------------------------------------

def _causes(exc: BaseException):
    seen = set()
    stack = [exc]
    while stack:
        e = stack.pop()
        if e is None or id(e) in seen:
            continue
        seen.add(id(e))
        yield e
        stack.extend([getattr(e, "cause", None), e.__cause__, e.__context__])
        exc_info = getattr(e, "exc_info", None)
        if isinstance(exc_info, tuple) and len(exc_info) > 1:
            stack.append(exc_info[1])


def _find_cause(exc: BaseException, cls):
    for e in _causes(exc):
        if isinstance(e, cls):
            return e
    return None


def _is_api(exc) -> bool:
    return _find_cause(exc, ApiError) is not None


_NOISE = [
    re.compile(r"^ERROR:\s*"),
    re.compile(r"^\[[^\]]+\]\s*[^:]{1,80}:\s*"),
    re.compile(r"^\[[^\]]+\]\s*"),  # warnings carry "[extractor]" without an id
    re.compile(r";?\s*please report this issue.*$", re.I | re.S),
    re.compile(r"\s*Use --cookies.*$", re.I | re.S),
    re.compile(r"\s*\(caused by .*$", re.I | re.S),
    re.compile(r"\s*Confirm you are on the latest version.*$", re.I | re.S),
]


def _short(exc: BaseException) -> str:
    msg = getattr(exc, "orig_msg", None) or getattr(exc, "msg", None) or str(exc)
    msg = str(msg)
    for rx in _NOISE:
        msg = rx.sub("", msg).strip()
    return msg[:300]


_RATE_LIMIT = re.compile(r"(?:error|status)\s*:?\s*429\b|too many requests|rate-limit|rate limit|"
                         r"temporarily blocked|not a bot|captcha", re.I)
# TikTok's statusCode 10204 is "item doesn't exist"; yt-dlp words it as an IP block.
_TIKTOK_GONE = ("your ip address is blocked from accessing this post", "status code 10204",
                "status code 10217")
# TikTok's bot wall: the page came back without the post data or with a challenge we can't pass.
_TIKTOK_WALL = ("unable to extract universal data", "unable to extract challenge data",
                "unable to solve js challenge")
_YT_GONE = ("video unavailable", "this video is unavailable", "this video isn't available anymore")


def blocked_error(name: str) -> ApiError:
    return ApiError("rate_limited", f"{name} is temporarily blocking this server. Try again later, "
                                    "or run the server from another network.")


def map_error(exc: BaseException, platform: str) -> ApiError:
    name = {"youtube": "YouTube", "tiktok": "TikTok"}.get(platform, platform.capitalize())
    reason = _short(exc)
    low = " ".join(str(e) for e in _causes(exc)).lower()

    if _find_cause(exc, GeoRestrictedError) or "not available in your country" in low or "geo restrict" in low:
        return ApiError("unavailable", f"This {name} post isn't available in the server's country.")
    http = _find_cause(exc, HTTPError) if HTTPError else None
    status = getattr(getattr(http, "response", None), "status", None) or getattr(http, "status", None)

    if platform == "tiktok" and any(k in low for k in _TIKTOK_GONE):
        return ApiError("not_found", "This TikTok post doesn't exist or was deleted.")
    if platform == "tiktok" and any(k in low for k in _TIKTOK_WALL):
        return blocked_error(name)
    # yt-dlp asks for an account when Reddit served its HTML block page instead of JSON.
    if platform == "reddit" and "account authentication is required" in low:
        return blocked_error(name)
    if platform == "reddit" and ("private subreddit" in low or "quarantined subreddit" in low):
        return ApiError("login_required", "This post is in a private or quarantined community that "
                                          "needs an account. SaveSama never signs in.")
    if platform == "reddit" and ("no media found" in low or "video is processing" in low):
        return ApiError("unavailable", "Reddit has no video for this post yet (still processing, or removed).")
    if _RATE_LIMIT.search(low) or status == 429:
        return blocked_error(name)
    if "unsupported url" in low:
        return ApiError("unsupported_url", f"That {name} link isn't a post, video or reel SaveSama can read.")
    if any(k in low for k in ("private video", "this account is private", "private account", "is private",
                              "age-restricted", "age restricted", "inappropriate for some users",
                              "confirm your age", "members-only", "join this channel", "login required",
                              "log in", "sign in", "login", "requires authentication", "cookies")):
        return ApiError("login_required", f"This {name} post needs an account to view (private, "
                                          "age-restricted or members-only). SaveSama never signs in.")
    if platform == "youtube" and reason.lower().rstrip(". ") in _YT_GONE:
        # YouTube's whole answer for an id that never existed (or was purged).
        return ApiError("not_found", f"This {name} video doesn't exist or was deleted.")
    if (status in (404, 410) or any(k in low for k in (
            "has been removed", "been deleted", "does not exist", "doesn't exist", "no longer available",
            "not found", "video unavailable. this video is no longer", "post isn't available",
            "content isn't available", "this video has been removed", "account has been terminated"))):
        return ApiError("not_found", f"This {name} post doesn't exist or was deleted.")
    if any(k in low for k in ("live event", "is live", "live stream", "premiere", "will begin in",
                              "no video formats", "no video in this post", "drm", "requested format is not available",
                              "video unavailable", "not available")):
        return ApiError("unavailable", f"This {name} post can't be downloaded: {reason}" if reason
                        else None)
    if status == 403 or "http error 403" in low or "403: forbidden" in low:
        return blocked_error(name)
    if (_find_cause(exc, TransportError) if TransportError else None) or any(
            k in low for k in ("timed out", "connection", "name resolution", "network is unreachable",
                               "temporary failure", "ssl", "urlopen error")):
        return ApiError("network", f"The server couldn't reach {name}. Check its internet connection.")
    return ApiError("internal", f"{name} extraction failed: {reason}" if reason else None)
