"""Regression tests for the verifier's findings (error mapping, HTTP errors, dims, redirects, CLI)."""

import contextlib
import http.client
import io
import json
import logging
import os
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

from helpers import FakeResolver, fixture, fixture_json
from yt_dlp.utils import DownloadError, ExtractorError

from savesama_server import api, cli, download, pairing
from savesama_server.errors import ApiError
from savesama_server.extractors import instagram, meta, ytdlp

HAS_FFMPEG = shutil.which("ffmpeg") is not None


def dl(msg):
    return DownloadError("ERROR: " + msg, (ExtractorError, ExtractorError(msg), None))


# Warnings yt-dlp 2026.08.19 logged from a blocked datacenter IP (ignore_no_formats_error on).
BOT_CHECK_WARNINGS = [
    "[youtube] jNQXAC9IVRw: Unable to download webpage: HTTP Error 429: Too Many Requests (caused by <HTTPError 429: Too Many Requests>)",
    "[youtube] Unable to fetch GVS PO Token for web client: Missing required Visitor Data.",
    "[youtube] Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.",
    "No video formats found!",
    "Requested format is not available",
]
UNKNOWN_ID_WARNINGS = [
    "[youtube] aaaaaaaaaaa: Unable to download webpage: HTTP Error 429: Too Many Requests (caused by <HTTPError 429: Too Many Requests>)",
    "[youtube] Video unavailable",
    'Extractor failed to obtain "title". Creating a generic title instead',
    "No video formats found!",
    "Requested format is not available",
]


class YouTubeBlockTest(unittest.TestCase):
    def test_bot_check_is_rate_limited(self):
        err = ytdlp.map_error(dl("[youtube] jNQXAC9IVRw: Sign in to confirm you’re not a bot. Use --cookies-from-browser"), "youtube")
        self.assertEqual(err.code, "rate_limited")
        self.assertIn("YouTube is temporarily blocking this server", err.message)
        self.assertIn("another network", err.message)

    def test_swallowed_bot_check_is_rate_limited(self):
        err = ytdlp.no_formats_error(BOT_CHECK_WARNINGS, "youtube")
        self.assertEqual(err.code, "rate_limited")
        self.assertIn("temporarily blocking", err.message)

    def test_unknown_id_is_not_found(self):
        self.assertEqual(ytdlp.map_error(dl("[youtube] aaaaaaaaaaa: Video unavailable"), "youtube").code, "not_found")
        self.assertEqual(ytdlp.no_formats_error(UNKNOWN_ID_WARNINGS, "youtube").code, "not_found")

    def test_http_403_and_session_rate_limit(self):
        self.assertEqual(ytdlp.map_error(dl("unable to download video data: HTTP Error 403: Forbidden"), "youtube").code,
                         "rate_limited")
        msg = ("[youtube] x: Video unavailable. This content isn't available, try again later. The current "
               "session has been rate-limited by YouTube for up to an hour.")
        self.assertEqual(ytdlp.map_error(dl(msg), "youtube").code, "rate_limited")

    def test_429_inside_an_id_is_not_a_rate_limit(self):
        self.assertEqual(ytdlp.map_error(dl("[TikTok] 7429000429: Unexpected response from webpage request"), "tiktok").code,
                         "internal")

    def test_no_reason_stays_unavailable(self):
        self.assertEqual(ytdlp.no_formats_error(["No video formats found!"], "youtube").code, "unavailable")

    def test_resolve_maps_swallowed_reason(self):
        class FakeYdl:
            def __init__(self, params):
                self.params = params
                self.cookiejar = []

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def extract_info(self, url, download=False):
                for w in BOT_CHECK_WARNINGS:
                    self.params["logger"].warning(w)
                return {"id": "jNQXAC9IVRw", "formats": []}

        with mock.patch.object(ytdlp, "_new_ydl", FakeYdl), self.assertRaises(ApiError) as ctx:
            ytdlp.resolve("https://www.youtube.com/watch?v=jNQXAC9IVRw", "youtube", True)
        self.assertEqual(ctx.exception.code, "rate_limited")


class TikTokErrorTest(unittest.TestCase):
    def check(self, msg, code):
        self.assertEqual(ytdlp.map_error(dl(msg), "tiktok").code, code, msg)

    def test_messages(self):
        # yt-dlp's wording for statusCode 10204, which TikTok sends for "item doesn't exist".
        self.check("[TikTok] 1234567890123456789: Your IP address is blocked from accessing this post", "not_found")
        self.check("[TikTok] 1: Video not available, status code 10217", "not_found")
        self.check("[TikTok] 1: Unable to extract universal data for rehydration", "rate_limited")
        self.check("[TikTok] 1: Unable to extract challenge data", "rate_limited")
        self.check("[TikTok] 1: Unable to solve JS challenge", "rate_limited")
        self.check("[TikTok] 1: You do not have permission to view this post. Log into an account that has access",
                   "login_required")


class FacebookFormatTest(unittest.TestCase):
    def info(self):
        info = fixture_json("ytdlp_facebook_reel.json")
        info.update(width=480, height=848, thumbnail=None,
                    thumbnails=[{"url": "https://scontent.xx.fbcdn.net/small.jpg"},
                                {"url": "https://scontent.xx.fbcdn.net/big.jpg"}])
        return info

    def test_dims_match_qualities_and_thumbnail_from_list(self):
        item = ytdlp._entry_items(self.info(), True)[0]
        self.assertEqual(item.qualities, [480, 360])  # "hd" is the 480x848 file, not a 720p guess
        self.assertEqual((item.width, item.height), (480, 848))
        self.assertEqual(min(item.width, item.height), item.qualities[0])
        self.assertEqual(item.thumbnail, "https://scontent.xx.fbcdn.net/big.jpg")

    def test_dims_without_entry_size(self):
        info = fixture_json("ytdlp_facebook_reel.json")
        info["formats"] = [f for f in info["formats"] if f["format_id"] in ("sd", "hd")]
        item = ytdlp._entry_items(info, True)[0]
        self.assertEqual((item.qualities, item.width, item.height), ([720, 360], None, None))

    def test_h264_preferred_within_rung(self):
        formats = [
            {"format_id": "a", "vcodec": "none", "acodec": "mp4a.40.5", "ext": "m4a", "tbr": 60},
            {"format_id": "vp9", "width": 480, "height": 848, "vcodec": "vp09.00.30.08", "acodec": "none", "ext": "mp4", "tbr": 900},
            {"format_id": "avc", "width": 480, "height": 848, "vcodec": "avc1.4d401f", "acodec": "none", "ext": "mp4", "tbr": 500},
        ]
        self.assertEqual(ytdlp.choose_format(formats, "media", 480, True), "avc+a")


class InstagramEmbedTest(unittest.TestCase):
    def test_rendition_size_from_efg(self):
        media, _, _ = instagram.parse_embed(fixture("instagram_embed_sidecar.html"))
        items = meta.items_from_graph(media, True)
        # The post is 720x720 but the embed serves the 640 encode (vencode_tag ...C3.640...).
        self.assertEqual([(i.width, i.height, i.qualities) for i in items][0], (640, 640, [640]))
        self.assertEqual(items[0].variants[0].short, 640)

    def test_rendition_dims_without_tag(self):
        self.assertEqual(meta.rendition_dims("https://scontent.cdninstagram.com/v.mp4", 1080, 1920), (1080, 1920))

    @unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
    def test_audio_of_silent_video_is_unavailable(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "v.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1",
                            "-c:v", "mpeg4", src], check=True)
            self.assertIs(download.has_audio_stream(src), False)
            with self.assertRaises(ApiError) as ctx:
                download._ffmpeg_or_error(download.to_m4a, src, os.path.join(d, "out.m4a"), threading.Event())
            self.assertEqual((ctx.exception.code, ctx.exception.message), ("unavailable", "This video has no audio track."))


class CdnRedirectTest(unittest.TestCase):
    def test_redirects_stay_on_cdn_hosts(self):
        h = download._CdnOnlyRedirects()
        req = urllib.request.Request("https://scontent.cdninstagram.com/a.mp4")
        ok = h.redirect_request(req, None, 302, "Found", {}, "https://scontent-ord5-1.cdninstagram.com/b.mp4")
        self.assertEqual(ok.full_url, "https://scontent-ord5-1.cdninstagram.com/b.mp4")
        for bad in ("https://evil.example/x.mp4", "http://scontent.cdninstagram.com/b.mp4", "http://127.0.0.1:8765/"):
            with self.assertRaises(ApiError):
                h.redirect_request(req, None, 302, "Found", {}, bad)

    def test_fetch_refuses_offsite_redirect(self):
        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", "https://evil.example/x")
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *a):
                pass

        srv = HTTPServer(("127.0.0.1", 0), Redirect)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            plain = urllib.request.build_opener(urllib.request.ProxyHandler({}), download._CdnOnlyRedirects())
            with self.assertRaises(ApiError):
                plain.open(f"http://127.0.0.1:{srv.server_address[1]}/", timeout=5)
        finally:
            srv.shutdown()
            srv.server_close()


class HttpErrorShapeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = api.Server(("127.0.0.1", 0), token="t" * 43, name="Box", jobs=None,
                                resolver=FakeResolver(), ffmpeg=True)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def check_json_error(self, status, headers, body, want_status):
        self.assertEqual(status, want_status)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")
        self.assertTrue(headers.get("Content-Type", "").startswith("application/json"))
        err = json.loads(body)["error"]
        self.assertEqual(err["code"], "bad_request")
        self.assertTrue(err["message"])

    def test_unsupported_methods(self):
        for method in ("PUT", "PATCH", "TRACE"):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
            conn.request(method, "/api/v1/jobs", body=b"{}")
            resp = conn.getresponse()
            self.check_json_error(resp.status, resp.headers, resp.read(), 405)
            self.assertIn("POST", resp.headers.get("Allow"))
            conn.close()

    def raw(self, data: bytes):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as s:
            s.sendall(data)
            chunks = []
            while True:
                c = s.recv(65536)
                if not c:
                    break
                chunks.append(c)
        resp = http.client.HTTPResponse(_Sock(b"".join(chunks)))
        resp.begin()
        return resp.status, resp.headers, resp.read()

    def test_malformed_request_line(self):
        self.check_json_error(*self.raw(b"GARBAGE\r\n\r\n"), 400)

    def test_bad_http_version(self):
        self.check_json_error(*self.raw(b"GET /api/v1/info HTTP/9.9\r\n\r\n"), 505)

    def test_too_many_headers(self):
        hdrs = b"".join(b"X-%d: y\r\n" % i for i in range(150))
        self.check_json_error(*self.raw(b"GET /api/v1/info HTTP/1.1\r\n" + hdrs + b"\r\n"), 431)


class _Sock:
    def __init__(self, data):
        self.data = data

    def makefile(self, *a, **k):
        return io.BytesIO(self.data)


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [mock.patch.object(cli, "DATA_DIR", self.tmp.name),
                        mock.patch.object(cli, "LOCK_FILE", os.path.join(self.tmp.name, "server.lock")),
                        mock.patch.object(cli, "PID_FILE", os.path.join(self.tmp.name, "server.pid")),
                        mock.patch.object(pairing, "is_termux", return_value=False)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def pair_name(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            cli.main(["pair", "--local-only", *argv])
        link = next(line for line in out.getvalue().splitlines() if line.startswith("savesama://pair?"))
        return urllib.parse.parse_qs(urllib.parse.urlsplit(link).query)["name"][0]

    def test_pair_uses_running_server_name(self):
        server = api.Server(("127.0.0.1", 0), token="t" * 43, name="Desk via --name", jobs=None,
                            resolver=FakeResolver(), ffmpeg=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            port = str(server.server_address[1])
            self.assertEqual(self.pair_name("--port", port), "Desk via --name")
            self.assertEqual(self.pair_name("--port", port, "--name", "Explicit"), "Explicit")
        finally:
            server.shutdown()
            server.server_close()

    def test_pair_falls_back_to_hostname(self):
        with socket.socket() as s:  # a port nothing listens on
            s.bind(("127.0.0.1", 0))
            port = str(s.getsockname()[1])
        with mock.patch.object(pairing, "device_name", return_value="host-box"):
            self.assertEqual(self.pair_name("--port", port), "host-box")

    def test_serve_listens_only_with_a_job_manager(self):
        seen = {}
        real_activate = api.Server.server_activate

        def activate(server):
            seen["jobs_at_listen"] = server.jobs
            real_activate(server)

        def serve_forever(server, poll_interval=0.5):
            seen["jobs_at_serve"] = server.jobs

        fake_jobs = mock.Mock()
        args = cli._parser().parse_args(["--port", "0", "--local-only", "--no-open"])
        root = logging.getLogger()
        handlers, level = list(root.handlers), root.level
        old_term = signal.getsignal(signal.SIGTERM)
        try:
            with mock.patch.object(api.Server, "server_activate", activate), \
                    mock.patch.object(api.Server, "serve_forever", serve_forever), \
                    mock.patch("savesama_server.jobs.JobManager", return_value=fake_jobs), \
                    mock.patch.object(ytdlp, "runtime_summary", return_value="node"), \
                    contextlib.redirect_stdout(io.StringIO()):
                cli.serve(args, "t" * 43, "Box")
        finally:
            for h in root.handlers[:]:
                if h not in handlers:
                    root.removeHandler(h)
                    h.close()
            root.setLevel(level)
            signal.signal(signal.SIGTERM, old_term)
        self.assertIs(seen["jobs_at_listen"], fake_jobs)
        self.assertIs(seen["jobs_at_serve"], fake_jobs)
        fake_jobs.save.assert_called_once()


if __name__ == "__main__":
    unittest.main()
