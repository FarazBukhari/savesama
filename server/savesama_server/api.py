"""HTTP API (docs/API.md) on the stdlib ThreadingHTTPServer."""

from __future__ import annotations

import hmac
import json
import logging
import os
import re
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yt_dlp.version

from . import __version__, update
from .errors import ApiError
from .jobs import JobManager
from .resolver import Resolver
from .urls import PLATFORMS

log = logging.getLogger("savesama.http")

MAX_BODY = 64 * 1024
API = "/api/v1"
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition",
}
ALLOW = "GET, HEAD, POST, DELETE, OPTIONS"
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr, *, token: str, name: str, jobs: JobManager | None, resolver: Resolver,
                 ffmpeg: bool, bind_and_activate: bool = True):
        self.token = token
        self.device_name = name
        self.jobs = jobs
        self.resolver = resolver
        self.ffmpeg = ffmpeg
        super().__init__(addr, Handler, bind_and_activate)


def _parse_quality(q):
    if q is None or q == "max":
        return "max"
    if isinstance(q, bool):
        raise ApiError("bad_request", "quality must be \"max\" or a pixel number.")
    if isinstance(q, str) and q.strip().isdigit():
        q = int(q.strip())
    if isinstance(q, float) and q.is_integer():
        q = int(q)
    if isinstance(q, int) and 1 <= q <= 10000:
        return q
    raise ApiError("bad_request", "quality must be \"max\" or a pixel number like 1080.")


def _parse_items(items):
    if items is None:
        return None
    if not isinstance(items, list) or not items or len(items) > 100 or not all(
            isinstance(i, int) and not isinstance(i, bool) and i >= 0 for i in items):
        raise ApiError("bad_request", "items must be a non-empty list of item indices, or null.")
    return items


class Handler(BaseHTTPRequestHandler):
    server: Server
    protocol_version = "HTTP/1.1"
    server_version = f"SaveSama/{__version__}"
    sys_version = ""
    timeout = 120  # seconds a connection may sit idle (or stall a transfer) before it's dropped

    # ---- plumbing -------------------------------------------------------------------

    def log_message(self, fmt, *args):  # quiet default logging; see _log
        pass

    def _log(self, status: int):
        level = logging.DEBUG if self.command in ("GET", "HEAD", "OPTIONS") and status < 400 else logging.INFO
        path = urllib.parse.urlsplit(getattr(self, "path", "") or "").path
        log.log(level, "%s %s %s %s", self.client_address[0], self.command, path[:200], status)

    def _headers(self, status: int, headers: dict):
        self.send_response(status)
        for k, v in {**CORS, **headers}.items():
            self.send_header(k, str(v))
        self.end_headers()
        self._log(status)

    def _json(self, status: int, payload, extra: dict | None = None):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Length": len(body), "Cache-Control": "no-store"}
        if payload is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
        headers.update(extra or {})
        self._headers(status, headers)
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def _error(self, err: ApiError, status: int | None = None, close: bool = False,
               extra: dict | None = None):
        headers = {**({"Connection": "close"} if close else {}), **(extra or {})}
        self._json(status or err.status, {"error": err.to_dict()}, headers)
        if close:
            self.close_connection = True

    def _body(self) -> dict:
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            self.close_connection = True
            raise ApiError("bad_request", "Chunked request bodies aren't supported; send Content-Length.")
        raw_len = self.headers.get("Content-Length") or "0"
        try:
            length = int(raw_len)
        except ValueError:
            self.close_connection = True
            raise ApiError("bad_request", "Invalid Content-Length.") from None
        if length < 0:
            self.close_connection = True
            raise ApiError("bad_request", "Invalid Content-Length.")
        if length > MAX_BODY:
            raise _TooLarge()
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError("bad_request", "Body must be JSON.") from None
        if not isinstance(data, dict):
            raise ApiError("bad_request", "Body must be a JSON object.")
        return data

    def _drain(self):
        """Read an unread small body so keep-alive stays in sync."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if 0 < length <= MAX_BODY:
            self.rfile.read(length)
        elif length > MAX_BODY:
            self.close_connection = True

    def send_error(self, code, message=None, explain=None):
        """The stdlib's own errors (unsupported method, malformed request line, oversized
        headers) as our JSON shape with CORS, instead of its HTML page."""
        self.close_connection = True  # the request may not have been read in full
        # Python 3.10 leaves an unparseable request at HTTP/0.9, which suppresses the status
        # line and headers; the error must still be a real HTTP/1.x response.
        if self.request_version == "HTTP/0.9":
            self.request_version = "HTTP/1.0"
        if code == 501:  # BaseHTTPRequestHandler's answer to a method we have no do_X for
            err = ApiError("bad_request", f"Method {str(self.command)[:20]} isn't supported.")
            return self._error(err, 405, close=True, extra={"Allow": ALLOW})
        text = {414: "The request URL is too long.", 431: "The request headers are too large.",
                505: "Unsupported HTTP version."}.get(int(code), "The request was malformed.")
        self._error(ApiError("bad_request", text), int(code), close=True)

    def _authorized(self) -> bool:
        header = self.headers.get("Authorization", "")
        scheme, _, given = header.partition(" ")
        if scheme.lower() != "bearer" or not given:
            return False
        return hmac.compare_digest(given.strip().encode("utf-8"), self.server.token.encode("utf-8"))

    # ---- dispatch -------------------------------------------------------------------

    def do_OPTIONS(self):
        self._drain()
        self._headers(204, {
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
            "Access-Control-Max-Age": "86400",
            "Content-Length": "0",
        })

    def do_GET(self):
        self._dispatch("GET")

    def do_HEAD(self):
        self._dispatch("HEAD")

    def do_POST(self):
        self._dispatch("POST")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _dispatch(self, method: str):
        path = urllib.parse.urlsplit(self.path).path.rstrip("/") or "/"
        try:
            if path == f"{API}/info" and method in ("GET", "HEAD"):
                self._drain()
                return self._json(200, self._info())
            if not self._authorized():
                self._drain()
                return self._error(ApiError("unauthorized"))
            route = self._route(method, path)
            if route is None:
                self._drain()
                raise ApiError("not_found", "Unknown route.")
            handler, args = route
            handler(*args)
        except _TooLarge:
            self._error(ApiError("bad_request", "Request body is larger than 64 KB."), 413, close=True)
        except ApiError as e:
            self._error(e)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:  # noqa: BLE001
            log.exception("unhandled error on %s %s", method, path)
            try:
                self._error(ApiError("internal"))
            except OSError:
                self.close_connection = True

    def _route(self, method: str, path: str):
        if not path.startswith(API + "/"):
            return None
        parts = path[len(API) + 1:].split("/")
        if parts == ["resolve"] and method == "POST":
            return self._resolve, ()
        if parts == ["jobs"]:
            return {"GET": (self._list, ()), "HEAD": (self._list, ()), "POST": (self._create, ())}.get(method)
        if parts == ["maintenance", "update"] and method == "POST":
            return self._update, ()
        if len(parts) >= 2 and parts[0] == "jobs" and re.fullmatch(r"[0-9a-f]{32}", parts[1]):
            jid = parts[1]
            if len(parts) == 2:
                return {"GET": (self._get, (jid,)), "HEAD": (self._get, (jid,)),
                        "DELETE": (self._delete, (jid,))}.get(method)
            if parts[2:] == ["cancel"] and method == "POST":
                return self._cancel, (jid,)
            if parts[2:] == ["retry"] and method == "POST":
                return self._retry, (jid,)
            if parts[2:] == ["file"] and method in ("GET", "HEAD"):
                return self._file, (jid,)
        if len(parts) >= 2 and parts[0] == "jobs":
            self._drain()
            raise ApiError("not_found", "No job with that id.")
        return None

    # ---- routes ---------------------------------------------------------------------

    def _info(self) -> dict:
        return {
            "app": "savesama",
            "api": 1,
            "version": __version__,
            "name": self.server.device_name,
            "platforms": PLATFORMS,
            "ffmpeg": self.server.ffmpeg,
            "extractor_version": yt_dlp.version.__version__,
        }

    def _resolve(self):
        body = self._body()
        res = self.server.resolver.resolve(body.get("url"))
        self._json(200, res.to_api())

    def _create(self):
        body = self._body()
        mode = body.get("mode", "media")
        if mode not in ("media", "audio"):
            raise ApiError("bad_request", "mode must be \"media\" or \"audio\".")
        quality = _parse_quality(body.get("quality", "max"))
        items = _parse_items(body.get("items"))
        jobs = self.server.jobs.create(body.get("url"), items, mode, quality)
        self._json(201, {"jobs": [j.to_api() for j in jobs]})

    def _list(self):
        self._drain()
        self._json(200, {"jobs": self.server.jobs.list()})

    def _get(self, jid):
        self._drain()
        self._json(200, self.server.jobs.snapshot(jid))

    def _cancel(self, jid):
        self._drain()
        self._json(200, self.server.jobs.cancel(jid))

    def _retry(self, jid):
        self._drain()
        self._json(200, self.server.jobs.retry(jid))

    def _delete(self, jid):
        self._drain()
        self.server.jobs.delete(jid)
        self._json(204, None)

    def _update(self):
        self._drain()
        update.start(self.server)
        self._json(202, {"status": "updating"})

    def _file(self, jid):
        self._drain()
        job, path = self.server.jobs.file_path(jid)
        size = os.path.getsize(path)
        name = job.file["name"]
        headers = {
            "Content-Type": job.file.get("mime") or "application/octet-stream",
            "Content-Disposition": "attachment; filename*=UTF-8''" + urllib.parse.quote(name, safe=""),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
        }
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng and "," not in rng:  # multi-range requests get the whole file (RFC 9110 allows it)
            m = _RANGE.match(rng.strip())
            if m and (m.group(1) or m.group(2)):
                a, b = m.group(1), m.group(2)
                if a:
                    start = int(a)
                    end = min(int(b), size - 1) if b else size - 1
                else:  # suffix range: last N bytes
                    n = int(b)
                    start, end = max(size - n, 0), size - 1
                    if n == 0:
                        start = size
                if start >= size or start > end:
                    return self._json(416, {"error": ApiError(
                        "bad_request", "Requested range is outside the file.").to_dict()},
                        {"Content-Range": f"bytes */{size}"})
                status = 206
                headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        length = end - start + 1 if size else 0
        headers["Content-Length"] = length
        self._headers(status, headers)
        if self.command == "HEAD" or length <= 0:
            return
        with open(path, "rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


class _TooLarge(Exception):
    pass

