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


class GraphShapeTest(unittest.TestCase):
    """The old GraphQL shape, which the embed page's gql_data still uses."""

    def test_video_with_dash_ladder(self):
        media = fixture_json("instagram_graphql_video.json")["data"]["xdt_shortcode_media"]
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
        media = fixture_json("instagram_graphql_sidecar.json")["data"]["xdt_shortcode_media"]
        items = meta.items_from_graph(media, True)
        self.assertEqual([i.type for i in items], ["image", "video"])
        img = items[0]
        self.assertEqual((img.width, img.height), (1080, 1350))
        self.assertTrue(img.variants[0].url.endswith("a_1080x1350.jpg"))  # never the 1080x1080 crop
        self.assertFalse(items[1].has_audio)
        self.assertIsNone(items[1].audio_url)


class GraphqlParseTest(unittest.TestCase):
    """Live /api/graphql answers (recorded October 2026, trimmed)."""

    def test_media_id(self):
        self.assertEqual(instagram.media_id("Deb_p3pxcjQ"), "4007076247661562064")
        self.assertEqual(instagram.media_id("DblSWtPD9-n"), "3955648572951617447")

    def test_reel_size_comes_from_the_encode(self):
        media = instagram.parse_graphql(fixture("instagram_api_reel.json"))
        self.assertEqual(meta.meta_from_api(media)["id"], "Chunk8-jurw")
        [v] = meta.items_from_api(media, True)
        # video_versions carry no sizes; the efg tag says 480 although the post is 720x1280.
        self.assertEqual((v.type, v.width, v.height, v.qualities), ("video", 480, 853, [480]))
        self.assertFalse(v.has_audio)  # licensed music is stripped for logged-out viewers
        self.assertIsNotNone(v.thumbnail)

    def test_carousel(self):
        media = instagram.parse_graphql(fixture("instagram_api_sidecar.json"))
        items = meta.items_from_api(media, True)
        self.assertEqual([(i.index, i.type, i.qualities) for i in items],
                         [(0, "video", [640]), (1, "video", [640]), (2, "video", [640])])

    def test_photo_without_candidate_sizes(self):
        media = instagram.parse_graphql(fixture("instagram_api_photo.json"))
        self.assertEqual(meta.meta_from_api(media)["author"], "world_record_egg")
        [img] = meta.items_from_api(media, True)
        self.assertEqual((img.type, img.width, img.height), ("image", 584, 584))
        self.assertEqual(img.variants[0].url, media["image_versions2"]["candidates"][0]["url"])

    def _photo_with(self, music_metadata):
        media = instagram.parse_graphql(fixture("instagram_api_photo.json"))
        media["music_metadata"] = music_metadata
        return meta.items_from_api(media, True)

    def test_photo_post_soundtrack(self):
        # Field names as Meta's private-API payload carries them. Instagram's logged-out answers
        # omit music_metadata (checked on a carousel with a song), so this shape is handcrafted.
        items = self._photo_with({"music_info": {
            "music_asset_info": {"title": "Golden Hour", "display_artist": "JVKE", "duration_in_ms": 15000,
                                 "cover_artwork_uri": "https://scontent.cdninstagram.com/cover.jpg",
                                 "progressive_download_url": "https://scontent.cdninstagram.com/song.mp3?x=1"},
            "music_consumption_info": {"should_mute_audio": False}}})
        self.assertEqual([i.type for i in items], ["image", "audio"])
        sound = items[1]
        self.assertEqual((sound.index, sound.title, sound.duration), (1, "Golden Hour · JVKE", 15.0))
        self.assertEqual((sound.variants[0].ext, sound.thumbnail), ("mp3", "https://scontent.cdninstagram.com/cover.jpg"))
        self.assertEqual(sound.to_api()["title"], "Golden Hour · JVKE")

    def test_original_sound_preview_and_muted(self):
        [_, orig] = self._photo_with({"original_sound_info": {
            "original_audio_title": "Original audio", "ig_artist": {"username": "someone"},
            "progressive_download_url": "https://scontent.cdninstagram.com/o1/audio.mp4?x=1"}})
        self.assertEqual((orig.title, orig.variants[0].ext), ("Original audio · someone", "m4a"))
        [_, preview] = self._photo_with({"music_info": {"music_asset_info": {
            "title": "Song", "web_30s_preview_download_url": "https://scontent.cdninstagram.com/p.mp3"}}})
        self.assertEqual(preview.title, "Song (30-second preview)")
        muted = self._photo_with({"music_info": {"music_asset_info": {"title": "Song"},
                                                 "music_consumption_info": {"should_mute_audio": True}}})
        self.assertEqual([i.type for i in muted], ["image"])

    def test_video_posts_get_no_separate_soundtrack(self):
        media = instagram.parse_graphql(fixture("instagram_api_reel.json"))
        media["music_metadata"] = {"original_sound_info": {"progressive_download_url": "https://x.cdninstagram.com/a.mp4"}}
        self.assertEqual([i.type for i in meta.items_from_api(media, True)], ["video"])

    def test_error_bodies(self):
        cases = [("instagram_graphql_rate_limited.json", 401, "rate_limited"),
                 ("instagram_graphql_null.json", 200, "not_found"),
                 ("instagram_graphql_gated.json", 200, "login_required"),
                 ("instagram_graphql_doc_id_retired.json", 200, "internal")]
        for name, status, code in cases:
            with self.assertRaises(ApiError, msg=name) as ctx:
                instagram.parse_graphql(fixture(name), status)
            self.assertEqual(ctx.exception.code, code, name)
        with self.assertRaises(ApiError) as ctx:  # the HTML app shell instead of a query result
            instagram.parse_graphql("<!DOCTYPE html><html><head></head></html>", 200)
        self.assertEqual(ctx.exception.code, "rate_limited")


class EmbedParseTest(unittest.TestCase):
    def test_live_sidecar_embed_has_video_urls(self):
        media, img, _ = instagram.parse_embed(fixture("instagram_embed_sidecar.html"))
        self.assertIsNone(img)
        items = meta.items_from_graph(media, True)
        self.assertEqual(len(items), 3)
        self.assertTrue(meta.is_complete(items))
        self.assertTrue(all(i.type == "video" and i.variants for i in items))

    def test_live_copyright_blocked_reel_is_incomplete(self):
        media, img, author = instagram.parse_embed(fixture("instagram_embed_reel_blocked.html"))
        self.assertEqual(author, "instagram")
        self.assertIsNone(img)  # a video must never degrade to its poster
        items = meta.items_from_graph(media, True)
        self.assertFalse(meta.is_complete(items))
        self.assertEqual((items[0].width, items[0].height), (1080, 1920))


class ExtractFlowTest(unittest.TestCase):
    def setUp(self):
        instagram._lsd = None
        instagram._graphql_blocked_until = 0.0

    def test_graphql_recipe(self):
        fake = FakeNet([
            ("GET", "instagram.com/", home()),
            ("POST", "/api/graphql", response(fixture("instagram_api_reel.json"))),
        ])
        with mock.patch.object(net, "request", fake):
            res = instagram.extract("https://www.instagram.com/reel/Chunk8-jurw/?igsh=x", True)
        self.assertEqual((res.via, res.id, res.author), ("graphql", "Chunk8-jurw", "instagram"))
        post = fake.calls[1]
        self.assertEqual(post["headers"]["Sec-Fetch-Site"], "same-origin")
        self.assertEqual(post["headers"]["X-FB-LSD"], "AVqLsdTok3n")
        self.assertNotIn("Cookie", post["headers"])
        form = urllib.parse.parse_qs(post["data"].decode())
        self.assertEqual(form["doc_id"], [instagram.GRAPHQL_DOC_ID])
        self.assertEqual(form["lsd"], ["AVqLsdTok3n"])
        self.assertEqual(json.loads(form["variables"][0]), {"media_id": instagram.media_id("Chunk8-jurw")})

    def test_lsd_from_eqmc_script(self):
        fake = FakeNet([("GET", "instagram.com/", response(fixture("instagram_home_eqmc.html")))])
        with mock.patch.object(net, "request", fake):
            self.assertEqual(instagram._lsd_token(), "AVqEqmcTok3n")

    def test_rate_limited_graphql_falls_back_to_embed(self):
        fake = FakeNet([
            ("GET", "/embed/captioned/", response(fixture("instagram_embed_sidecar.html"))),
            ("GET", "instagram.com/", home()),
            ("POST", "/api/graphql", response(fixture("instagram_graphql_rate_limited.json"), status=401)),
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
            ("POST", "/api/graphql", response(fixture("instagram_graphql_rate_limited.json"), status=401)),
        ])
        yres = Resolved(url="u", platform="instagram", id="Chunk8-jurw",
                        items=[Item(index=0, type="video", source="ytdlp", variants=[], qualities=[720])],
                        via="yt-dlp")
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", return_value=yres) as yt:
            res = instagram.extract("https://www.instagram.com/reel/Chunk8-jurw/", True)
        self.assertIs(res, yres)
        yt.assert_called_once()

    def test_carousel_merge_matches_videos_by_position(self):
        from savesama_server.extractors import meta as meta_mod

        partial_items = [Item(index=0, type="image", variants=[Variant("img")]),
                         Item(index=1, type="video", variants=[Variant("embed-A")]),
                         Item(index=2, type="video")]  # blocked in the embed
        partial = Resolved(url="u", platform="instagram", id="C", items=partial_items, via="embed")
        yres = Resolved(url="u", platform="instagram", id="C", via="yt-dlp", items=[
            Item(index=0, type="video", source="ytdlp", playlist_index=2),
            Item(index=1, type="video", source="ytdlp", playlist_index=3)])
        with mock.patch.object(instagram, "via_graphql", side_effect=ApiError("rate_limited")), \
                mock.patch.object(instagram, "via_embed", return_value=({"x": 1}, None, None)), \
                mock.patch.object(meta_mod, "items_from_graph", return_value=partial_items), \
                mock.patch.object(instagram, "_resolved", return_value=partial), \
                mock.patch.object(ytdlp, "resolve", return_value=yres):
            res = instagram.extract("https://www.instagram.com/p/C/", True)
        self.assertEqual([i.variants[0].url if i.variants else i.source for i in res.items],
                         ["img", "embed-A", "ytdlp"])
        self.assertIs(res.items[2], yres.items[1])
        self.assertEqual((res.items[2].playlist_index, res.items[2].index), (3, 2))

    def test_all_strategies_fail_picks_most_specific(self):
        fake = FakeNet([
            ("GET", "/embed/captioned/", response("<html>no media</html>")),
            ("GET", "instagram.com/", home()),
            ("POST", "/api/graphql", response(fixture("instagram_graphql_null.json"))),
        ])
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", side_effect=ApiError("rate_limited")):
            with self.assertRaises(ApiError) as ctx:
                instagram.extract("https://www.instagram.com/p/Gone123/", True)
        self.assertEqual(ctx.exception.code, "not_found")

    def test_live_photo_embed(self):
        media, img, author = instagram.parse_embed(fixture("instagram_embed_photo.html"))
        self.assertIsNone(media)
        self.assertEqual(author, "world_record_egg")
        self.assertIn("stp=dst-jpg_e35_tt6&", img)  # full size, entities decoded, not a crop

    def test_photo_post_flow(self):
        fake = FakeNet([
            ("GET", "/embed/captioned/", response(fixture("instagram_embed_photo.html"))),
            ("GET", "instagram.com/", home()),
            ("POST", "/api/graphql", response(fixture("instagram_graphql_rate_limited.json"), status=401)),
        ])
        with mock.patch.object(net, "request", fake), \
                mock.patch.object(ytdlp, "resolve", side_effect=AssertionError("yt-dlp can't do photos")):
            res = instagram.extract("https://www.instagram.com/p/BsOGulcndj-/", True)
        self.assertEqual((res.via, res.author, [i.type for i in res.items]), ("embed-img", "world_record_egg", ["image"]))

    def test_non_post_links(self):
        for url, code in [("https://www.instagram.com/reels/audio/123/", "unavailable"),
                          ("https://www.instagram.com/stories/someone/1/", "login_required"),
                          ("https://www.instagram.com/someone/", "unsupported_url")]:
            with self.assertRaises(ApiError) as ctx:
                instagram.extract(url, True)
            self.assertEqual(ctx.exception.code, code, url)


if __name__ == "__main__":
    unittest.main()
