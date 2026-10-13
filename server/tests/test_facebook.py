import unittest
from unittest import mock

from helpers import FakeNet, fixture, response
from savesama_server import net
from savesama_server.errors import ApiError
from savesama_server.extractors import facebook, ytdlp


class FacebookTest(unittest.TestCase):
    def test_og_photo(self):
        res = facebook.parse_og(fixture("facebook_photo_og.html"), "https://www.facebook.com/photo/?fbid=1234567890123")
        self.assertEqual(res.id, "1234567890123")
        self.assertEqual(res.title, "Our new office & team photo")
        img = res.items[0]
        self.assertEqual((img.type, img.width, img.height), ("image", 2048, 1365))
        self.assertEqual(img.variants[0].url, "https://scontent.xx.fbcdn.net/v/t39.30808-6/123_n.jpg?_nc_cat=1&ccb=1-7&oh=00_sig")

    def test_og_ignores_generic_logo(self):
        self.assertIsNone(facebook.parse_og(fixture("facebook_generic_og.html"), "https://www.facebook.com/x"))

    def test_ytdlp_failure_falls_back_to_og(self):
        fake = FakeNet([("GET", "facebook.com/photo", response(fixture("facebook_photo_og.html")))])
        with mock.patch.object(ytdlp, "resolve", side_effect=ApiError("unavailable", "no video")), \
                mock.patch.object(net, "request", fake):
            res = facebook.extract("https://www.facebook.com/photo/?fbid=1234567890123", True)
        self.assertEqual(res.via, "og")
        self.assertIn("facebookexternalhit", fake.calls[0]["ua"])

    def test_login_wall(self):
        login = response("<html>log in</html>", url="https://www.facebook.com/login/?next=x")
        fake = FakeNet([("GET", "facebook.com/photo", login)])
        with mock.patch.object(ytdlp, "resolve", side_effect=ApiError("unavailable")), \
                mock.patch.object(net, "request", fake), self.assertRaises(ApiError) as ctx:
            facebook.extract("https://www.facebook.com/photo/?fbid=1", True)
        self.assertEqual(ctx.exception.code, "login_required")

    def test_rate_limit_does_not_hit_og(self):
        with mock.patch.object(ytdlp, "resolve", side_effect=ApiError("rate_limited")), \
                mock.patch.object(net, "request", FakeNet([])), self.assertRaises(ApiError) as ctx:
            facebook.extract("https://www.facebook.com/reel/1", True)
        self.assertEqual(ctx.exception.code, "rate_limited")

    def test_share_link(self):
        fake = FakeNet([("GET", "/share/r/", response(status=302, headers={"Location": "https://www.facebook.com/reel/1195289147628387/"}))])
        with mock.patch.object(net, "request", fake):
            self.assertEqual(facebook.resolve_share("https://www.facebook.com/share/r/AbC/"),
                             "https://www.facebook.com/reel/1195289147628387/")


if __name__ == "__main__":
    unittest.main()
