import unittest

from helpers import *  # noqa: F401,F403
from savesama_server.errors import ApiError
from savesama_server.urls import clean_url, instagram_shortcode, is_allowed_url, is_share_link, threads_code


class CleanUrlTest(unittest.TestCase):
    def test_platforms(self):
        cases = {
            "https://www.youtube.com/watch?v=abc": "youtube",
            "https://youtu.be/abc": "youtube",
            "https://m.youtube.com/shorts/abc": "youtube",
            "https://www.instagram.com/reel/ABC/": "instagram",
            "https://vm.tiktok.com/ZMabc/": "tiktok",
            "https://www.facebook.com/reel/123": "facebook",
            "https://fb.watch/abc/": "facebook",
            "https://www.threads.net/@a/post/X": "threads",
            "https://threads.com/@a/post/X": "threads",
        }
        for url, platform in cases.items():
            self.assertEqual(clean_url(url)[1], platform, url)

    def test_extracts_url_from_share_text(self):
        url, platform = clean_url("Look at this! https://www.instagram.com/p/AbC_12/?igsh=xyz.")
        self.assertEqual(url, "https://www.instagram.com/p/AbC_12/?igsh=xyz")
        self.assertEqual(platform, "instagram")

    def test_bare_host_gets_https(self):
        self.assertEqual(clean_url("youtu.be/abc")[0], "https://youtu.be/abc")

    def test_rejects_other_hosts(self):
        for bad in ["https://evil.com/x", "https://youtube.com.evil.com/x", "https://notyoutube.com/",
                    "ftp://youtube.com/x", "https://l.facebook.com/l.php?u=https://evil.com",
                    "https://user:pw@youtube.com/", "https://www.youtube.com:8443/watch?v=1", "hello"]:
            with self.assertRaises(ApiError, msg=bad) as ctx:
                clean_url(bad)
            self.assertEqual(ctx.exception.code, "unsupported_url", bad)

    def test_bad_types(self):
        for bad in [None, 42, "", "   ", {"u": 1}]:
            with self.assertRaises(ApiError) as ctx:
                clean_url(bad)
            self.assertEqual(ctx.exception.code, "bad_request")

    def test_is_allowed(self):
        self.assertTrue(is_allowed_url("https://www.threads.com/@x/post/Y"))
        self.assertFalse(is_allowed_url("https://scontent.cdninstagram.com/v/1.jpg"))
        self.assertFalse(is_allowed_url("javascript:alert(1)"))


class PostIdTest(unittest.TestCase):
    def test_instagram_shortcodes(self):
        self.assertEqual(instagram_shortcode("https://www.instagram.com/p/AbC-1_x/"), "AbC-1_x")
        self.assertEqual(instagram_shortcode("https://www.instagram.com/reel/XyZ/?igsh=1"), "XyZ")
        self.assertEqual(instagram_shortcode("https://www.instagram.com/reels/XyZ/"), "XyZ")
        self.assertEqual(instagram_shortcode("https://www.instagram.com/someuser/p/XyZ/"), "XyZ")
        self.assertIsNone(instagram_shortcode("https://www.instagram.com/reels/audio/1273422726399305/"))
        self.assertIsNone(instagram_shortcode("https://www.instagram.com/someuser/"))

    def test_threads_codes(self):
        self.assertEqual(threads_code("https://www.threads.com/@nasa/post/Decc755lYhC?xmt=1"), "Decc755lYhC")
        self.assertEqual(threads_code("https://www.threads.net/t/Decc755lYhC"), "Decc755lYhC")
        self.assertIsNone(threads_code("https://www.threads.com/@nasa"))

    def test_share_links(self):
        self.assertTrue(is_share_link("https://www.threads.com/share/AbCd/"))
        self.assertTrue(is_share_link("https://www.facebook.com/share/r/1AbC/"))
        self.assertTrue(is_share_link("https://fb.watch/abc/"))
        self.assertFalse(is_share_link("https://www.facebook.com/reel/1"))


if __name__ == "__main__":
    unittest.main()
