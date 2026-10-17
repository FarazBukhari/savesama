import unittest
from unittest import mock

from helpers import FakeNet, fixture, response
from savesama_server import net
from savesama_server.errors import ApiError
from savesama_server.extractors import tiktok, ytdlp
from savesama_server.media import Item, Resolved


class TikTokPhotoTest(unittest.TestCase):
    """Handcrafted from TikTok's documented rehydration shape; no public photo post was
    reachable from the build machine to record a live one."""

    def test_photo_post_items(self):
        item = tiktok.parse_page(fixture("tiktok_photo_post.html"))
        items = tiktok.photo_items(item)
        self.assertEqual([i.type for i in items], ["image", "image", "image", "audio"])
        self.assertEqual((items[1].width, items[1].height), (1440, 1080))
        self.assertIn(".jpeg", items[0].variants[0].url)  # JPEG preferred over HEIC
        self.assertEqual(items[3].to_api()["qualities"], [])
        self.assertTrue(items[3].to_api()["has_audio"])
        self.assertEqual(items[3].title, "original sound")

    def test_video_post_is_left_to_ytdlp(self):
        self.assertEqual(tiktok.photo_items(tiktok.parse_page(fixture("tiktok_video_post.html"))), [])

    def test_status_codes(self):
        for name, code in (("tiktok_deleted.html", "not_found"), ("tiktok_private.html", "login_required")):
            with self.assertRaises(ApiError) as ctx:
                tiktok.parse_page(fixture(name))
            self.assertEqual(ctx.exception.code, code)
        with self.assertRaises(ApiError) as ctx:
            tiktok.parse_page("<html>Site Maintenance</html>")
        self.assertEqual(ctx.exception.code, "rate_limited")

    def test_photo_url_skips_ytdlp(self):
        fake = FakeNet([("GET", "/photo/7400000000000000001", response(fixture("tiktok_photo_post.html")))])
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", side_effect=AssertionError("not for photos")):
            res = tiktok.extract("https://www.tiktok.com/@traveller/photo/7400000000000000001", True)
        self.assertEqual((res.id, res.author, len(res.items)), ("7400000000000000001", "traveller", 4))

    def test_slideshow_shared_as_video_link(self):
        audio_only = Resolved(url="u", platform="tiktok", id="7400000000000000001",
                              items=[Item(index=0, type="audio", source="ytdlp")])
        fake = FakeNet([("GET", "/video/7400000000000000001", response(fixture("tiktok_photo_post.html")))])
        with mock.patch.object(net, "request", fake), mock.patch.object(ytdlp, "resolve", return_value=audio_only):
            res = tiktok.extract("https://www.tiktok.com/@traveller/video/7400000000000000001", True)
        self.assertEqual(res.via, "page")

    def test_short_link_expanded(self):
        fake = FakeNet([
            ("GET", "vm.tiktok.com", response(status=301, headers={"Location": "https://www.tiktok.com/@traveller/photo/7400000000000000001?_r=1"})),
            ("GET", "/photo/", response(fixture("tiktok_photo_post.html"))),
        ])
        with mock.patch.object(net, "request", fake):
            res = tiktok.extract("https://vm.tiktok.com/ZMabc123/", True)
        self.assertEqual(len(res.items), 4)


if __name__ == "__main__":
    unittest.main()
