"""Runs one item download into a private temp dir, then names and places the result."""

from __future__ import annotations

import logging
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

from . import net
from .errors import ApiError
from .extractors import ytdlp
from .extractors.ytdlp import Cancelled
from .media import Item, Resolved, Variant, choose_variant

log = logging.getLogger("savesama.download")

# Direct downloads only go to the CDNs our own extractors read URLs from.
CDN_DOMAINS = ("cdninstagram.com", "fbcdn.net", "instagram.com", "facebook.com", "threads.com",
               "threads.net")
CHUNK = 256 * 1024

IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "heic", "gif", "avif"}
AUDIO_EXTS = {"m4a", "mp3", "aac", "opus", "ogg", "oga", "wav", "flac", "weba"}
MIME_OVERRIDES = {"m4a": "audio/mp4", "mp4": "video/mp4", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                  "webp": "image/webp", "heic": "image/heic", "avif": "image/avif", "opus": "audio/ogg",
                  "weba": "audio/webm", "mp3": "audio/mpeg", "mkv": "video/x-matroska"}


class Progress:
    """Aggregates byte progress over the parts of one job (e.g. video + audio streams)."""

    def __init__(self, report: Callable[[int, int | None, float | None, float | None], None]):
        self.report = report
        self.parts: dict[str, list] = {}
        self.pending_bytes = 0  # parts we know will follow but haven't started
        self._last = 0.0
        self._rate_t, self._rate_b, self.speed = time.monotonic(), 0, None

    def update(self, key: str, done: int, total: int | None, speed: float | None = None,
               force: bool = False):
        self.parts[key] = [done, total]
        now = time.monotonic()
        all_done = sum(p[0] for p in self.parts.values())
        if speed is None and now - self._rate_t >= 1.0:
            inst = (all_done - self._rate_b) / (now - self._rate_t)
            self.speed = inst if self.speed is None else 0.6 * self.speed + 0.4 * inst
            self._rate_t, self._rate_b = now, all_done
        elif speed is not None:
            self.speed = speed
        if not force and now - self._last < 0.25:
            return
        self._last = now
        known = all(p[1] for p in self.parts.values())
        total_all = sum(p[1] or 0 for p in self.parts.values()) + self.pending_bytes if known else None
        eta = None
        if total_all and self.speed and self.speed > 0:
            eta = max(0.0, (total_all - all_done) / self.speed)
        self.report(all_done, total_all, self.speed, eta)

    def ytdlp_hook(self, d: dict):
        key = d.get("filename") or d.get("tmpfilename") or "main"
        status = d.get("status")
        total = d.get("total_bytes") or d.get("total_bytes_estimate")
        if status == "downloading":
            if key not in self.parts:
                info = d.get("info_dict") or {}
                req = info.get("requested_formats") or []
                if req and len(self.parts) == 0:
                    sizes = [f.get("filesize") or f.get("filesize_approx") or 0 for f in req]
                    self.pending_bytes = int(sum(sizes[1:]))
                elif req:
                    self.pending_bytes = 0
            self.update(key, int(d.get("downloaded_bytes") or 0), int(total) if total else None,
                        d.get("speed"))
        elif status == "finished":
            done = int(d.get("downloaded_bytes") or d.get("total_bytes") or 0)
            self.update(key, done, done or None, force=True)


# ---- direct HTTP ------------------------------------------------------------------------

def _cdn_ok(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(host == d or host.endswith("." + d) for d in CDN_DOMAINS)


def fetch(url: str, dest: str, *, referer: str | None, progress: Progress, key: str,
          cancel: threading.Event, attempts: int = 3) -> str:
    """Download url to dest (resuming on retries). Returns the response Content-Type."""
    if not _cdn_ok(url):
        raise ApiError("internal", "Refusing to download from an unexpected host.")
    ctype = ""
    for attempt in range(1, attempts + 1):
        have = os.path.getsize(dest) if os.path.exists(dest) else 0
        headers = {"User-Agent": net.DESKTOP_UA, "Accept": "*/*", "Accept-Language": net.ACCEPT_LANGUAGE}
        if referer:
            headers["Referer"] = referer
        if have:
            headers["Range"] = f"bytes={have}-"
        req = urllib.request.Request(url, headers=headers)
        try:
            opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=net._SSL))
            with opener.open(req, timeout=30) as resp:
                ctype = resp.headers.get("Content-Type", "")
                if have and resp.status != 206:
                    have = 0  # server ignored Range: start over
                length = resp.headers.get("Content-Length")
                total = (int(length) + have) if length and length.isdigit() else None
                with open(dest, "ab" if have else "wb") as fh:
                    done = have
                    while True:
                        if cancel.is_set():
                            raise Cancelled()
                        chunk = resp.read(CHUNK)
                        if not chunk:
                            break
                        fh.write(chunk)
                        done += len(chunk)
                        progress.update(key, done, total)
                if total and done < total:
                    raise ConnectionError("connection closed early")
                progress.update(key, done, done, force=True)
                return ctype
        except Cancelled:
            raise
        except urllib.error.HTTPError as e:
            if e.code == 416 and have:
                return ctype  # already complete
            if e.code in (403, 410):
                raise ApiError("unavailable", "The platform's download link expired or was refused. "
                                              "Retry the download.") from e
            if e.code == 404:
                raise ApiError("not_found", "The media file is gone from the platform's servers.") from e
            if e.code == 429:
                raise ApiError("rate_limited") from e
            if attempt == attempts:
                raise ApiError("network", f"Download failed (HTTP {e.code}).") from e
        except (urllib.error.URLError, OSError, ConnectionError) as e:
            if attempt == attempts:
                raise ApiError("network", f"Download failed: {getattr(e, 'reason', e)}") from e
        time.sleep(min(2 ** attempt, 8))
    raise ApiError("network")


# ---- ffmpeg -----------------------------------------------------------------------------

def run_ffmpeg(args: list[str], cancel: threading.Event) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    err_chunks: list[bytes] = []
    reader = threading.Thread(target=lambda: err_chunks.append(proc.stderr.read()), daemon=True)
    reader.start()
    while proc.poll() is None:
        if cancel.is_set():
            proc.kill()
            proc.wait()
            raise Cancelled()
        time.sleep(0.2)
    reader.join(2)
    if proc.returncode != 0:
        tail = b"".join(err_chunks).decode("utf-8", "replace")[-800:]
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {tail}")


def to_m4a(src: str, dest: str, cancel: threading.Event) -> None:
    """Audio track -> .m4a. Copy when the codec allows (AAC/HE-AAC), else encode AAC."""
    try:
        run_ffmpeg(["-i", src, "-vn", "-map", "0:a:0", "-c:a", "copy", "-movflags", "+faststart",
                    "-f", "mp4", dest], cancel)
    except RuntimeError as e:
        log.info("audio copy failed, re-encoding: %s", e)
        run_ffmpeg(["-i", src, "-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", "-f", "mp4", dest], cancel)


def mux(video: str, audio: str, dest: str, cancel: threading.Event) -> None:
    run_ffmpeg(["-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
                "-movflags", "+faststart", "-shortest", "-f", "mp4", dest], cancel)


# ---- direct items -----------------------------------------------------------------------

def _ext_from(ctype: str, url: str, default: str) -> str:
    ctype = (ctype or "").split(";")[0].strip().lower()
    by_type = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
               "image/avif": "avif", "video/mp4": "mp4", "audio/mp4": "m4a", "audio/mpeg": "mp3"}
    if ctype in by_type:
        return by_type[ctype]
    path_ext = os.path.splitext(urllib.parse.urlsplit(url).path)[1].lstrip(".").lower()
    return path_ext if path_ext in IMAGE_EXTS | AUDIO_EXTS | {"mp4"} else default


def download_direct(resolved: Resolved, item: Item, mode: str, quality, can_mux: bool, tmpdir: str,
                    progress: Progress, on_processing: Callable[[], None],
                    cancel: threading.Event) -> str:
    ref = resolved.referer
    if item.type == "image":
        v = item.variants[0]
        part = os.path.join(tmpdir, "image.part")
        ctype = fetch(v.url, part, referer=ref, progress=progress, key="image", cancel=cancel)
        out = os.path.join(tmpdir, "image." + _ext_from(ctype, v.url, "jpg"))
        os.replace(part, out)
        return out

    if mode == "audio":
        if item.audio_url:
            raw = os.path.join(tmpdir, "audio.mp4")
            fetch(item.audio_url, raw, referer=ref, progress=progress, key="audio", cancel=cancel)
            if not can_mux:
                return _rename(raw, os.path.join(tmpdir, "audio.m4a"))  # already an audio MP4
            on_processing()
            out = os.path.join(tmpdir, "out.m4a")
            try:
                to_m4a(raw, out, cancel)
            except RuntimeError as e:
                log.warning("m4a remux failed, keeping the stream as-is: %s", e)
                return _rename(raw, os.path.join(tmpdir, "audio.m4a"))
            return out
        if not can_mux:
            raise ApiError("unavailable", "Saving just the audio of this post needs ffmpeg on the server.")
        muxed = [v for v in item.variants if v.has_audio]
        if not muxed or not item.has_audio:
            raise ApiError("unavailable", "This video has no audio track.")
        smallest = min(muxed, key=lambda v: v.short or 0)
        src = os.path.join(tmpdir, "video.mp4")
        fetch(smallest.url, src, referer=ref, progress=progress, key="video", cancel=cancel)
        on_processing()
        out = os.path.join(tmpdir, "out.m4a")
        _ffmpeg_or_error(to_m4a, src, out, cancel)
        return out

    v = choose_variant(item.variants, quality, can_mux and bool(item.audio_url))
    if v is None:
        raise ApiError("unavailable", "This video needs ffmpeg on the server to be saved.")
    if v.has_audio:
        out = os.path.join(tmpdir, "video.mp4")
        fetch(v.url, out, referer=ref, progress=progress, key="video", cancel=cancel)
        return out
    # Video-only DASH rendition + the audio stream, muxed without re-encoding.
    vpath, apath = os.path.join(tmpdir, "v.mp4"), os.path.join(tmpdir, "a.mp4")
    progress.pending_bytes = 0
    fetch(v.url, vpath, referer=ref, progress=progress, key="video", cancel=cancel)
    fetch(item.audio_url, apath, referer=ref, progress=progress, key="audio", cancel=cancel)
    on_processing()
    out = os.path.join(tmpdir, "out.mp4")
    try:
        mux(vpath, apath, out, cancel)
    except RuntimeError as e:
        log.warning("mux failed, falling back to the muxed rendition: %s", e)
        fallback = choose_variant([x for x in item.variants if x.has_audio], quality, False)
        if not fallback:
            raise ApiError("internal", "Couldn't combine the video and audio streams.") from e
        fetch(fallback.url, out, referer=ref, progress=progress, key="fallback", cancel=cancel)
    return out


def _ffmpeg_or_error(fn, src, out, cancel):
    try:
        fn(src, out, cancel)
    except RuntimeError as e:
        raise ApiError("internal", "ffmpeg couldn't extract the audio track.") from e


def _rename(src: str, dest: str) -> str:
    os.replace(src, dest)
    return dest


def run(resolved: Resolved, item: Item, mode: str, quality, can_mux: bool, tmpdir: str,
        progress: Progress, on_processing: Callable[[], None], cancel: threading.Event) -> str:
    if item.source == "ytdlp":
        return ytdlp.download(resolved, item, mode, quality, can_mux, tmpdir,
                              progress.ytdlp_hook, on_processing, cancel)
    return download_direct(resolved, item, mode, quality, can_mux, tmpdir, progress, on_processing, cancel)


# ---- naming -----------------------------------------------------------------------------

_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]+')


def safe_title(text: str | None, limit: int = 60) -> str:
    text = unicodedata.normalize("NFC", (text or "").strip().splitlines()[0] if text and text.strip() else "")
    text = _BAD.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(" .,;-") or text[:limit]
    return text


def file_name(resolved: Resolved, item_index: int, ext: str) -> str:
    base = safe_title(resolved.title) or safe_title(resolved.author) or resolved.platform.capitalize()
    tag = safe_title(resolved.id, 40) or "media"
    if len(resolved.items) > 1:
        tag = f"{tag}-{item_index + 1}"
    return f"{base} [{tag}].{ext.lower()}"


def unique_path(directory: str, name: str) -> str:
    stem, ext = os.path.splitext(name)
    candidate = os.path.join(directory, name)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(directory, f"{stem} ({n}){ext}")
        n += 1
    return candidate


def place(src: str, downloads_dir: str, name: str) -> str:
    """Atomically claim a unique final name (two jobs can finish the same media at once)."""
    stem, ext = os.path.splitext(name)
    n = 1
    while True:
        target = os.path.join(downloads_dir, name if n == 1 else f"{stem} ({n}){ext}")
        try:
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
        except FileExistsError:
            n += 1
            continue
        os.close(fd)
        try:
            os.replace(src, target)
        except OSError:
            shutil.move(src, target)
        return target


def kind_and_mime(path: str, mode: str) -> tuple[str, str]:
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    if ext in IMAGE_EXTS:
        kind = "image"
    elif ext in AUDIO_EXTS or mode == "audio":
        kind = "audio"
    else:
        kind = "video"
    mime = MIME_OVERRIDES.get(ext) or mimetypes.guess_type(path)[0] or "application/octet-stream"
    if kind == "audio" and mime.startswith("video/"):
        mime = "audio/" + mime.split("/", 1)[1]
    return kind, mime


__all__ = ["Progress", "run", "file_name", "place", "kind_and_mime", "Variant", "Cancelled"]
