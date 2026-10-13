import json
import unittest
import urllib.parse
from unittest import mock

from helpers import FakeNet, fixture, fixture_json, response
from savesama_server import net
from savesama_server.errors import ApiError
from savesama_server.extractors import instagram, meta, ytdlp
from savesama_server.media import Item, Resolved, Variant


def home():
    return response(fixture("instagram_home.html"))


class GraphqlParseTest(unittest.TestCase):
    def test_video_with_dash_ladder(self):
        media = instagram.parse_graphql(fixture("instagram_graphql_video.json"))
        info = meta.meta_from_graph(media)
        self.assertEqual(info, {"id": "VidCode123", "title": "Sunset reel\nsecond line", "author": "someartist"})
        items = meta.items_from_graph(media, True)
        self.assertEqual(len(items), 1)
        v = items[0]
        self.assertEqual(v.type, "video")
        self.assertEqual(v.qualities, [1080, 540])  # VP9 representation excluded
        self.assertEqual(v.audio_url, "https://scontent.cdninstagram.com/v/audio.mp4?x=1&y=2&oh=sig")
        self.assertEqual(v.thumbnail, "https://scontent.cdninstagram.com/v/vid_640x1138.jpg")
        self.assertEqual(meta.items_from_graph(media, False)[0].qualities, [1080])

    def test_sidecar_crops_and_silent_video(self):
        media = instagram.parse_graphql(fixture("instagram_graphql_sidecar.json"))
        items = meta.items_from_graph(media, True)
        self.assertEqual([i.type for i in items], ["image", "video"])
        img = items[0]
        self.assertEqual((img.width, img.height), (1080, 1350))
        self.assertTrue(img.variants[0].url.endswith("a_1080x1350.jpg"))  # never the 1080x1080 crop
        self.assertFalse(items[1].has_audio)
        self.assertIsNone(items[1].audio_url)

    def test_error_bodies(self):
        cases = [("instagram_graphql_rate_limited.json", 401, "rate_limited"),
                 ("instagram_graphql_null.json", 200, "not_found"),
                 ("instagram_graphql_doc_id_retired.json", 200, "internal")]
        for name, status, code in cases:
            with self.assertRaises(ApiError, msg=name) as ctx:
                instagram.parse_graphql(fixture(name), status)
            self.assertEqual(ctx.exception.code, code, name)
        with self.assertRaises(ApiError) as ctx:
            instagram.parse_graphql("<html>login</html>", 200)
        self.assertEqual(ctx.exception.code, "rate_limited")


class EmbedParseTest(unittest.TestCase):
    def test_live_sidecar_embed_has_video_urls(self):
        media, img = instagram.parse_embed(fixture("instagram_embed_sidecar.html"))
        self.assertIsNone(img)
        items = meta.items_from_graph(media, True)
        self.assertEqual(len(items), 3)
        self.assertTrue(meta.is_complete(items))
        self.assertTrue(all(i.type == "video" and i.variants for i in items))

    def test_live_copyright_blocked_reel_is_incomplete(self):
        media, img = instagram.parse_embed(fixture("instagram_embed_reel_blocked.html"))
        self.assertIsNone(img)  # a video must never degrade to its poster
        items = meta.items_from_graph(media, True)
        self.assertFalse(meta.is_complete(items))
        self.assertEqual((items[0].width, items[0].height), (1080, 1920))


class ExtractFlowTest(unittest.TestCase):
    def setUp(self):
        instagram._csrf = None
        instagram._graphql_blocked_until = 0.0

    def test_graphql_recipe(self):
        fake = FakeNet([
            ("GET", "instagram.com/", home()),
            ("POST", "/graphql/query", response(fixture("instagram_graphql_video.json"))),
        ])
        with mock.patch.object(net, "request", fake):
            res = instagram.extract("https://www.instagram.com/reel/VidCode123/?igsh=x", True)
        self.assertEqual(res.via, "graphql")
        post = fake.calls[1]
        self.assertEqual(post["headers"]["X-IG-App-ID"], instagram.IG_APP_ID)
        self.assertEqual(post["headers"]["X-CSRFToken"], "Ab12Cd34Ef56Gh78Ij90Kl")
        self.assertEqual(post["headers"]["Cookie"], "csrftoken=Ab12Cd34Ef56Gh78Ij90Kl")
        form = urllib.parse.parse_qs(post["data"].decode())
        self.assertEqual(form["doc_id"], [instagram.GRAPHQL_DOC_ID])
        self.assertEqual(json.loads(form["variables"][0])["shortcode"], "VidCode123")

    def test_csrf_from_escaped_json(self):
        fake = FakeNet([("GET", "instagram.com/", response(fixture("instagram_home_escaped.html")))])
        with mock.patch.object(net, "request", fake):
            self.assertEqual(instagram._csrf_token(), "Zz98Yy76Xx54Ww32Vv10")

    def test_rate_limited_graphql_falls_back_to_embed(self):
        fake = FakeNet([
            ("GET", "/embed/captioned/", response(fixture("instagram_embed_sidecar.html"))),
            ("GET", "instagram.com/", home()),
            ("POST", "/graphql/query", response(fixture("instagram_graphql_rate_limited.json"), status=401)),
        ])
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", side_effect=AssertionError("must not be needed")):
            res = instagram.extract("https://www.instagram.com/p/BQ0eAlwhDrw/", True)
        self.assertEqual(res.via, "embed")
        self.assertEqual(len(res.items), 3)
        self.assertIn("facebookexternalhit", fake.calls[-1]["ua"])
        # The rate limit starts a cooldown: the next link skips GraphQL entirely.
        fake.calls.clear()
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", side_effect=AssertionError("must not be needed")):
            instagram.extract("https://www.instagram.com/p/BQ0eAlwhDrw/", True)
        self.assertEqual([c["method"] for c in fake.calls], ["GET"])
        self.assertIn("/embed/", fake.calls[0]["url"])

    def test_blocked_reel_falls_back_to_ytdlp(self):
        fake = FakeNet([
            ("GET", "/embed/captioned/", response(fixture("instagram_embed_reel_blocked.html"))),
            ("GET", "instagram.com/", home()),
            ("POST", "/graphql/query", response(fixture("instagram_graphql_rate_limited.json"), status=401)),
        ])
        yres = Resolved(url="u", platform="instagram", id="Chunk8-jurw",
                        items=[Item(index=0, type="video", source="ytdlp", variants=[], qualities=[720])],
                        via="yt-dlp")
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", return_value=yres) as yt:
            res = instagram.extract("https://www.instagram.com/reel/Chunk8-jurw/", True)
        self.assertIs(res, yres)
        yt.assert_called_once()

    def test_all_strategies_fail_picks_most_specific(self):
        fake = FakeNet([
            ("GET", "/embed/captioned/", response("<html>no media</html>")),
            ("GET", "instagram.com/", home()),
            ("POST", "/graphql/query", response(fixture("instagram_graphql_null.json"))),
        ])
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", side_effect=ApiError("rate_limited")):
            with self.assertRaises(ApiError) as ctx:
                instagram.extract("https://www.instagram.com/p/Gone123/", True)
        self.assertEqual(ctx.exception.code, "not_found")

    def test_photo_post_from_embed_image_only(self):
        html = ('<img class="EmbeddedMediaImage" alt="x" src="https://scontent.cdninstagram.com/v/p.jpg?a=1&amp;b=2" />'
                '<script>{"contextJSON":' + json.dumps(json.dumps({"context": {"type": "GraphImage"}, "gql_data": None})) + '}</script>')
        media, img = instagram.parse_embed(html)
        self.assertIsNone(media)
        self.assertEqual(img, "https://scontent.cdninstagram.com/v/p.jpg?a=1&b=2")

    def test_non_post_links(self):
        for url, code in [("https://www.instagram.com/reels/audio/123/", "unavailable"),
                          ("https://www.instagram.com/stories/someone/1/", "login_required"),
                          ("https://www.instagram.com/someone/", "unsupported_url")]:
            with self.assertRaises(ApiError) as ctx:
                instagram.extract(url, True)
            self.assertEqual(ctx.exception.code, code, url)


if __name__ == "__main__":
    unittest.main()
