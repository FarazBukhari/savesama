"""Reddit extraction. Reddit blocks the build machine's datacenter address, so these posts are
handcrafted in the documented shape of /comments/<id>/.json (raw_json=1), not recorded live."""

import json
import unittest
from unittest import mock

from helpers import FakeNet, response
from savesama_server import net
from savesama_server.errors import ApiError
from savesama_server.extractors import reddit, ytdlp
from savesama_server.media import Item, Resolved
from savesama_server.urls import clean_url

I = "https://i.redd.it"
P = "https://preview.redd.it"


def listing(**post):
    base = {"id": "1abcde2", "title": "Chai in the rain", "author": "lahore_eats",
            "permalink": "/r/pakistan/comments/1abcde2/chai_in_the_rain/", "is_self": False}
    return json.dumps([{"kind": "Listing", "data": {"children": [{"kind": "t3", "data": {**base, **post}}]}},
                       {"kind": "Listing", "data": {"children": []}}])


GALLERY = dict(
    is_gallery=True,
    gallery_data={"items": [{"media_id": "b"}, {"media_id": "a"}, {"media_id": "gone"}, {"media_id": "g"}]},
    media_metadata={
        "a": {"status": "valid", "e": "Image", "m": "image/jpg", "s": {"u": f"{P}/a.jpg?width=3024&s=1", "x": 3024, "y": 4032},
              "p": [{"u": f"{P}/a.jpg?width=108", "x": 108, "y": 144}, {"u": f"{P}/a.jpg?width=320", "x": 320, "y": 426}]},
        "b": {"status": "valid", "e": "Image", "m": "image/png", "s": {"u": f"{P}/b.png?width=1080&s=2", "x": 1080, "y": 1080}},
        "gone": {"status": "failed"},
        "g": {"status": "valid", "e": "AnimatedImage", "s": {"gif": f"{I}/g.gif", "mp4": f"{P}/g.gif?format=mp4", "x": 480, "y": 270}},
    },
)
PREVIEW = {"images": [{"source": {"url": f"{P}/src.jpg?s=9", "width": 2048, "height": 1536},
                       "resolutions": [{"url": f"{P}/src.jpg?width=108", "width": 108, "height": 81},
                                       {"url": f"{P}/src.jpg?width=320", "width": 320, "height": 240}]}]}


class ParseTest(unittest.TestCase):
    def test_errors(self):
        cases = [("<html><body>You've been blocked by network security.</body></html>", 403, "rate_limited"),
                 ('{"reason": "private", "message": "Forbidden", "error": 403}', 403, "login_required"),
                 ('{"message": "Not Found", "error": 404}', 404, "not_found"),
                 ("", 429, "rate_limited"),
                 ("[]", 200, "not_found")]
        for body, status, code in cases:
            with self.assertRaises(ApiError, msg=body) as ctx:
                reddit.parse_listing(body, status)
            self.assertEqual(ctx.exception.code, code, body)

    def test_gallery_order_gif_and_removed_entries(self):
        items, videos = reddit.gallery_items(GALLERY)
        self.assertEqual(videos, 0)
        self.assertEqual([(i.index, i.width, i.variants[0].ext) for i in items], [(0, 1080, "png"), (1, 3024, "jpg"), (2, 480, "gif")])
        self.assertEqual(items[1].thumbnail, f"{P}/a.jpg?width=320")
        self.assertEqual(items[2].variants[0].url, f"{I}/g.gif")

    def test_single_images(self):
        own = reddit.image_item({"url_overridden_by_dest": f"{I}/x.jpeg", "post_hint": "image", "preview": PREVIEW})
        self.assertEqual((own.variants[0].url, own.width, own.variants[0].ext), (f"{I}/x.jpeg", 2048, "jpg"))
        imgur = reddit.image_item({"url_overridden_by_dest": "https://i.imgur.com/x.jpg", "post_hint": "image", "preview": PREVIEW})
        self.assertEqual(imgur.variants[0].url, f"{P}/src.jpg?s=9")  # Reddit's own full-size copy
        self.assertIsNone(reddit.image_item({"url": "https://example.com/article", "post_hint": "link"}))


class ExtractTest(unittest.TestCase):
    def run_extract(self, url, routes, follow=None):
        fake = FakeNet(routes)
        with mock.patch.object(net, "request", fake):
            return reddit.extract(url, True, follow or (lambda u: self.fail(f"unexpected follow {u}"))), fake

    def test_gallery_post(self):
        res, fake = self.run_extract("https://www.reddit.com/r/pakistan/comments/1abcde2/chai/?utm_source=share",
                                     [("GET", "/comments/1abcde2/.json", response(listing(**GALLERY)))])
        self.assertEqual((res.platform, res.id, res.title, res.author), ("reddit", "1abcde2", "Chai in the rain", "u/lahore_eats"))
        self.assertEqual(res.url, "https://www.reddit.com/r/pakistan/comments/1abcde2/chai_in_the_rain/")
        self.assertEqual(len(res.items), 3)
        call = fake.calls[0]
        self.assertIn("raw_json=1", call["url"])
        self.assertEqual(call["ua"], reddit.API_UA)

    def test_crosspost_uses_the_original_media(self):
        res, _ = self.run_extract("https://redd.it/1abcde2", [
            ("GET", "/comments/1abcde2/.json", response(listing(crosspost_parent_list=[{**GALLERY, "title": "orig"}])))])
        self.assertEqual((res.title, len(res.items)), ("Chai in the rain", 3))

    def test_video_post_goes_to_ytdlp_with_reddit_title(self):
        video = listing(is_video=True, secure_media={"reddit_video": {"fallback_url": "https://v.redd.it/abc/DASH_720.mp4"}})
        yres = Resolved(url="u", platform="reddit", id="abc", title="yt-dlp title", author="lahore_eats",
                        items=[Item(index=0, type="video", source="ytdlp", qualities=[720])], via="yt-dlp")
        with mock.patch.object(ytdlp, "resolve", return_value=yres) as yt:
            res, _ = self.run_extract("https://www.reddit.com/comments/1abcde2", [("GET", "/comments/1abcde2/.json", response(video))])
        yt.assert_called_once_with("https://www.reddit.com/r/pakistan/comments/1abcde2/chai_in_the_rain/", "reddit", True)
        self.assertEqual((res.title, res.author), ("Chai in the rain", "u/lahore_eats"))

    def test_link_to_a_supported_platform_is_followed(self):
        post = listing(post_hint="rich:video", url_overridden_by_dest="https://www.youtube.com/watch?v=jNQXAC9IVRw")
        target = Resolved(url="yt", platform="youtube", id="jNQXAC9IVRw")
        seen = []
        res, _ = self.run_extract("https://www.reddit.com/comments/1abcde2", [("GET", "/comments/1abcde2/.json", response(post))],
                                  follow=lambda u: seen.append(u) or target)
        self.assertIs(res, target)
        self.assertEqual(seen, ["https://www.youtube.com/watch?v=jNQXAC9IVRw"])

    def test_text_and_external_posts(self):
        for post, needle in [(listing(is_self=True, url="https://www.reddit.com/r/x/comments/1abcde2/t/"), "text post"),
                             (listing(post_hint="link", url_overridden_by_dest="https://example.com/news"), "example.com")]:
            with self.assertRaises(ApiError) as ctx:
                self.run_extract("https://www.reddit.com/comments/1abcde2", [("GET", "/comments/1abcde2/.json", response(post))])
            self.assertEqual(ctx.exception.code, "unavailable")
            self.assertIn(needle, ctx.exception.message)

    def test_share_link_and_direct_image(self):
        res, fake = self.run_extract("https://www.reddit.com/r/pakistan/s/AbCdEf123", [
            ("GET", "/s/AbCdEf123", response(status=301, headers={"Location": "https://www.reddit.com/r/pakistan/comments/1abcde2/chai/"})),
            ("GET", "/comments/1abcde2/.json", response(listing(**GALLERY)))])
        self.assertFalse(fake.calls[0]["follow_redirects"])
        self.assertEqual(len(res.items), 3)
        res, fake = self.run_extract(f"{I}/abc123.png", [])
        self.assertEqual((res.items[0].type, res.items[0].variants[0].ext, fake.calls), ("image", "png", []))


class UrlAndErrorTest(unittest.TestCase):
    def test_reddit_links_are_accepted(self):
        for url in ("https://www.reddit.com/r/pics/comments/1abcde2/x/", "https://redd.it/1abcde2",
                    "https://v.redd.it/abc123", "https://old.reddit.com/comments/1abcde2"):
            self.assertEqual(clean_url(url)[1], "reddit", url)
        with self.assertRaises(ApiError):
            clean_url("https://out.reddit.com/t3_x?url=https%3A%2F%2Fevil.com")

    def test_ytdlp_reddit_errors(self):
        from yt_dlp.utils import ExtractorError
        for msg, code in [("Account authentication is required", "rate_limited"),
                          ("Private subreddit; an account that has been approved is required", "login_required"),
                          ("No media found", "unavailable")]:
            self.assertEqual(ytdlp.map_error(ExtractorError(msg, expected=True), "reddit").code, code, msg)


if __name__ == "__main__":
    unittest.main()
