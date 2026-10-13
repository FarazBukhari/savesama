import unittest
from unittest import mock

from helpers import FakeNet, fixture, response
from savesama_server import net
from savesama_server.errors import ApiError
from savesama_server.extractors import threads


class ThreadsParseTest(unittest.TestCase):
    """Fixtures are trimmed copies of live crawler-rendered pages (Oct 2026)."""

    def test_video_post(self):
        info, items = threads.parse_post_page(fixture("threads_post_video.html"), "DecNkzeCX8-", True)
        self.assertEqual(info["author"], "instagram")
        self.assertTrue(info["title"].startswith("@hichiyan686"))
        self.assertEqual(len(items), 1)
        v = items[0]
        self.assertEqual(v.type, "video")
        self.assertTrue(v.has_audio)
        self.assertEqual((v.width, v.height), (720, 1280))
        self.assertEqual(v.qualities, [720, 360])  # muxed 720 + DASH H.264 360
        self.assertTrue(v.audio_url and "&amp;" not in v.audio_url)
        self.assertTrue(v.to_api()["thumbnail"].startswith("https://"))

    def test_video_qualities_without_ffmpeg(self):
        _, items = threads.parse_post_page(fixture("threads_post_video.html"), "DecNkzeCX8-", False)
        self.assertEqual(items[0].qualities, [720])

    def test_reply_with_other_code_is_not_picked(self):
        self.assertIsNone(threads.parse_post_page(fixture("threads_post_video.html"), "ReplyCodeXX", True))

    def test_carousel_full_frame_images(self):
        info, items = threads.parse_post_page(fixture("threads_post_carousel.html"), "Decc755lYhC", True)
        self.assertEqual(info["author"], "nasa")
        self.assertEqual([i.type for i in items], ["image"] * 4)
        self.assertEqual([(i.width, i.height) for i in items],
                         [(3024, 4032), (1279, 1919), (1919, 1280), (1920, 1280)])
        for it in items:
            self.assertEqual(it.to_api()["qualities"], [])
            self.assertFalse(it.has_audio)

    def test_photo_never_picks_square_crop(self):
        _, items = threads.parse_post_page(fixture("threads_post_photo.html"), "DeZtp-TkQHh", True)
        img = items[0]
        self.assertNotEqual(img.width, img.height)
        self.assertEqual(img.variants[0].width, img.width)

    def test_text_only_post(self):
        with self.assertRaises(ApiError) as ctx:
            threads.parse_post_page(fixture("threads_post_text.html"), "DecbRB8GZOK", True)
        self.assertEqual(ctx.exception.code, "unavailable")

    def test_embed_video_and_carousel(self):
        items = threads.parse_embed(fixture("threads_embed_video.html"))
        self.assertEqual([i.type for i in items], ["video"])
        self.assertNotIn("&amp;", items[0].variants[0].url)
        items = threads.parse_embed(fixture("threads_embed_carousel.html"))
        self.assertEqual([i.type for i in items], ["image"] * 4)  # not the avatar or favicon

    def test_og_ignores_profile_picture(self):
        html = '<meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.2885-19/pic.jpg" />'
        self.assertEqual(threads.parse_og(html), [])
        html = '<meta property="og:video" content="https://scontent.cdninstagram.com/v.mp4" />'
        self.assertEqual(threads.parse_og(html)[0].type, "video")


class ThreadsExtractTest(unittest.TestCase):
    def test_post_page_path(self):
        fake = FakeNet([("GET", "/@nasa/post/Decc755lYhC", response(fixture("threads_post_carousel.html")))])
        with mock.patch.object(net, "request", fake):
            res = threads.extract("https://www.threads.net/@nasa/post/Decc755lYhC?xmt=1", True)
        self.assertEqual(res.via, "post-page")
        self.assertEqual(len(res.items), 4)
        self.assertEqual(fake.calls[0]["url"], "https://www.threads.com/@nasa/post/Decc755lYhC")
        self.assertIn("Googlebot", fake.calls[0]["ua"])

    def test_falls_back_to_embed(self):
        fake = FakeNet([
            ("GET", "/embed", response(fixture("threads_embed_video.html"))),
            ("GET", "/post/DecNkzeCX8-", response("<html>app shell</html>")),
        ])
        with mock.patch.object(net, "request", fake):
            res = threads.extract("https://www.threads.com/@instagram/post/DecNkzeCX8-", True)
        self.assertEqual(res.via, "embed")
        self.assertEqual(res.items[0].type, "video")
        self.assertIn("facebookexternalhit", fake.calls[1]["ua"])

    def test_share_link_resolves_via_crawler_redirect(self):
        fake = FakeNet([
            ("GET", "/share/", response(status=302, headers={"Location": "https://www.threads.com/@nasa/post/Decc755lYhC?xmt=1"})),
            ("GET", "/@nasa/post/Decc755lYhC", response(fixture("threads_post_carousel.html"))),
        ])
        with mock.patch.object(net, "request", fake):
            res = threads.extract("https://www.threads.com/share/AbCdEf/", True)
        self.assertEqual(res.id, "Decc755lYhC")
        self.assertFalse(fake.calls[0]["follow_redirects"])

    def test_nothing_anonymous_is_login_required(self):
        fake = FakeNet([("GET", "threads.com", response("<html>app shell</html>"))])
        with mock.patch.object(net, "request", fake):
            with self.assertRaises(ApiError) as ctx:
                threads.extract("https://www.threads.com/@a/post/Xyz123", True)
        self.assertEqual(ctx.exception.code, "login_required")

    def test_rate_limit_and_404(self):
        fake = FakeNet([("GET", "threads.com", response("", status=429))])
        with mock.patch.object(net, "request", fake), self.assertRaises(ApiError) as ctx:
            threads.extract("https://www.threads.com/@a/post/Xyz123", True)
        self.assertEqual(ctx.exception.code, "rate_limited")
        fake = FakeNet([("GET", "threads.com", response("", status=404))])
        with mock.patch.object(net, "request", fake), self.assertRaises(ApiError) as ctx:
            threads.extract("https://www.threads.com/@a/post/Xyz123", True)
        self.assertEqual(ctx.exception.code, "not_found")


if __name__ == "__main__":
    unittest.main()
