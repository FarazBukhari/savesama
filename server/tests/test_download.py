import os
import shutil
import subprocess
import tempfile
import threading
import unittest

from helpers import FIXTURES  # noqa: F401
from savesama_server import download
from savesama_server.errors import ApiError
from savesama_server.media import Item, Resolved

HAS_FFMPEG = shutil.which("ffmpeg") is not None


class NamingTest(unittest.TestCase):
    def res(self, title, n=1):
        return Resolved(url="u", platform="tiktok", id="123", title=title, author="me",
                        items=[Item(index=i, type="video") for i in range(n)])

    def test_names(self):
        self.assertEqual(download.file_name(self.res("Hello: world?\nsecond line"), 0, "mp4"),
                         "Hello world [123].mp4")
        self.assertEqual(download.file_name(self.res(None), 0, "M4A"), "me [123].m4a")
        self.assertEqual(download.file_name(self.res("x", 3), 2, "jpg"), "x [123-3].jpg")
        long = download.file_name(self.res("word " * 40), 0, "mp4")
        self.assertLessEqual(len(long), 80)
        self.assertNotIn("/", download.file_name(self.res("../../etc/passwd"), 0, "mp4"))

    def test_place_is_unique(self):
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for i in range(3):
                src = os.path.join(d, f"src{i}")
                with open(src, "w") as fh:
                    fh.write(str(i))
                paths.append(download.place(src, d, "A [1].mp4"))
            self.assertEqual([os.path.basename(p) for p in paths], ["A [1].mp4", "A [1] (2).mp4", "A [1] (3).mp4"])

    def test_kind_and_mime(self):
        self.assertEqual(download.kind_and_mime("a.mp4", "media"), ("video", "video/mp4"))
        self.assertEqual(download.kind_and_mime("a.m4a", "audio"), ("audio", "audio/mp4"))
        self.assertEqual(download.kind_and_mime("a.mp3", "audio"), ("audio", "audio/mpeg"))
        self.assertEqual(download.kind_and_mime("a.webm", "audio"), ("audio", "audio/webm"))
        self.assertEqual(download.kind_and_mime("a.jpg", "audio"), ("image", "image/jpeg"))
        self.assertEqual(download.kind_and_mime("a.webp", "media"), ("image", "image/webp"))


class ProgressTest(unittest.TestCase):
    def test_parts_add_up(self):
        seen = []
        p = download.Progress(lambda *a: seen.append(a))
        p.update("v", 50, 100, force=True)
        p.update("a", 10, 20, force=True)
        self.assertEqual(seen[-1][:2], (60, 120))
        p.update("x", 1, None, force=True)
        self.assertIsNone(seen[-1][1])  # unknown total stays unknown

    def test_ytdlp_hook_counts_pending_audio(self):
        seen = []
        p = download.Progress(lambda *a: seen.append(a))
        info = {"requested_formats": [{"filesize": 1000}, {"filesize": 200}]}
        p.ytdlp_hook({"status": "downloading", "filename": "v", "downloaded_bytes": 500, "total_bytes": 1000,
                      "speed": 100.0, "info_dict": info})
        p.ytdlp_hook({"status": "finished", "filename": "v", "downloaded_bytes": 1000, "total_bytes": 1000})
        self.assertEqual(seen[-1][:2], (1000, 1200))
        p.ytdlp_hook({"status": "downloading", "filename": "a", "downloaded_bytes": 100, "total_bytes": 200,
                      "info_dict": info})
        p.ytdlp_hook({"status": "finished", "filename": "a", "downloaded_bytes": 200})
        self.assertEqual(seen[-1][:2], (1200, 1200))


class FetchGuardTest(unittest.TestCase):
    def test_refuses_non_cdn_hosts(self):
        for url in ("https://evil.com/x.mp4", "http://scontent.cdninstagram.com/x.mp4",
                    "https://cdninstagram.com.evil.com/x"):
            with self.assertRaises(ApiError):
                download.fetch(url, "/tmp/never", referer=None, progress=download.Progress(lambda *a: None),
                               key="k", cancel=threading.Event())


@unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
class FfmpegTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.v = os.path.join(self.d, "v.mp4")
        self.a = os.path.join(self.d, "a.mp4")
        run = lambda *args: subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)
        run("-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", self.v)
        run("-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", self.a)

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def probe(self, path):
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", path],
                             capture_output=True, text=True).stdout.split()
        return out

    def test_mux_and_audio(self):
        out = os.path.join(self.d, "out.mp4")
        download.mux(self.v, self.a, out, threading.Event())
        self.assertEqual(sorted(self.probe(out)), ["aac", "h264"])
        m4a = os.path.join(self.d, "out.m4a")
        download.to_m4a(out, m4a, threading.Event())
        self.assertEqual(self.probe(m4a), ["aac"])

    def test_cancel_kills_ffmpeg(self):
        ev = threading.Event()
        ev.set()
        with self.assertRaises(download.Cancelled):
            download.run_ffmpeg(["-f", "lavfi", "-i", "testsrc=duration=60", "-f", "null", "-"], ev)


if __name__ == "__main__":
    unittest.main()
