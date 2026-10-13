import unittest

from helpers import fixture, fixture_json
from savesama_server.errors import ApiError
from savesama_server.extractors import ytdlp
from savesama_server.media import Variant, choose_variant, pick_rung, short_side


def fmt(spec: str, formats):
    return {f["format_id"]: f for f in formats}[spec] if "+" not in spec else spec


class RungTest(unittest.TestCase):
    def test_short_side(self):
        self.assertEqual(short_side(1080, 1920), 1080)
        self.assertEqual(short_side(1920, 1080), 1080)
        self.assertEqual(short_side(None, 720), 720)
        self.assertIsNone(short_side(None, None))

    def test_pick_rung(self):
        rungs = [1080, 720, 480, 360]
        self.assertEqual(pick_rung(rungs, "max"), 1080)
        self.assertEqual(pick_rung(rungs, 720), 720)
        self.assertEqual(pick_rung(rungs, 600), 480)   # best at/below
        self.assertEqual(pick_rung(rungs, 144), 360)   # none below: smallest
        self.assertEqual(pick_rung(rungs, 4000), 1080)
        self.assertIsNone(pick_rung([], "max"))

    def test_choose_variant_prefers_muxed_and_respects_mux_ability(self):
        vs = [Variant("a", 720, 1280), Variant("b", 1080, 1920, has_audio=False), Variant("c", 720, 1280, has_audio=False)]
        self.assertEqual(choose_variant(vs, "max").url, "b")
        self.assertEqual(choose_variant(vs, "max", can_mux=False).url, "a")
        self.assertEqual(choose_variant(vs, 720).url, "a")  # same rung: the muxed one


class YtdlpFormatTest(unittest.TestCase):
    def test_tiktok_prefers_h264_and_aac_audio(self):
        formats = fixture_json("ytdlp_tiktok.json")["formats"]
        # The top rung (720) is H.265-only: "max" takes the top rung (HEVC MP4 plays in Android
        # galleries); within a rung H.264 wins, so 576 must be H.264.
        self.assertEqual(fmt(ytdlp.choose_format(formats, "media", "max", True), formats)["height"], 1280)
        spec576 = ytdlp.choose_format(formats, "media", 576, True)
        self.assertEqual(fmt(spec576, formats)["vcodec"], "h264")

    def test_tiktok_audio_takes_aac_from_video_not_mp3(self):
        formats = fixture_json("ytdlp_tiktok.json")["formats"]
        spec = ytdlp.choose_format(formats, "audio", "max", True)
        self.assertNotEqual(spec, "audio")
        self.assertEqual(fmt(spec, formats)["acodec"], "aac")
        # Without ffmpeg the mp3 stream is saved as-is.
        self.assertEqual(ytdlp.choose_format(formats, "audio", "max", False), "audio")

    def test_facebook_progressive_hd_wins_at_max_and_dash_at_480(self):
        formats = fixture_json("ytdlp_facebook_reel.json")["formats"]
        self.assertEqual(ytdlp.choose_format(formats, "media", "max", True), "hd")
        spec = ytdlp.choose_format(formats, "media", 480, True)
        self.assertIn("+", spec)
        v, a = spec.split("+")
        self.assertEqual(fmt(v, formats)["height"], 848)
        self.assertEqual(fmt(a, formats)["vcodec"], "none")
        self.assertEqual(ytdlp.qualities(formats, True), [720, 480, 360])
        self.assertEqual(ytdlp.qualities(formats, False), [720, 360])  # progressive only

    def test_youtube_merges_avc1_with_m4a(self):
        formats = fixture_json("ytdlp_youtube.json")["formats"]
        spec = ytdlp.choose_format(formats, "media", "max", True)
        v, a = spec.split("+")
        self.assertTrue(fmt(v, formats)["vcodec"].startswith("avc1"))
        self.assertEqual(fmt(a, formats)["ext"], "m4a")
        self.assertEqual(ytdlp.choose_format(formats, "audio", "max", True), "140")
        low = ytdlp.choose_format(formats, "media", 100, True)  # below everything: smallest rung
        self.assertEqual(short_side(fmt(low.split("+")[0], formats)["width"], fmt(low.split("+")[0], formats)["height"]), 144)

    def test_youtube_without_ffmpeg(self):
        formats = fixture_json("ytdlp_youtube.json")["formats"]
        # This (live, Oct 2026) format list has no muxed rendition: video needs ffmpeg ...
        with self.assertRaises(ApiError) as ctx:
            ytdlp.choose_format(formats, "media", "max", False)
        self.assertIn("ffmpeg", ctx.exception.message)
        # ... but audio can be saved as-is.
        self.assertEqual(ytdlp.choose_format(formats, "audio", "max", False), "140")
        # A muxed format is used when one exists.
        muxed = formats + [{"format_id": "18", "vcodec": "avc1.42001E", "acodec": "mp4a.40.2",
                            "width": 640, "height": 360, "ext": "mp4", "protocol": "https"}]
        self.assertEqual(ytdlp.choose_format(muxed, "media", "max", False), "18")

    def test_no_video_raises_unavailable(self):
        with self.assertRaises(ApiError) as ctx:
            ytdlp.choose_format([{"format_id": "a", "vcodec": "none", "acodec": "mp4a.40.2"}], "media", "max", True)
        self.assertEqual(ctx.exception.code, "unavailable")
        with self.assertRaises(ApiError):
            ytdlp.choose_format([{"format_id": "v", "vcodec": "avc1", "acodec": "none", "width": 1, "height": 1}],
                                "audio", "max", False)

    def test_storyboards_ignored(self):
        formats = [{"format_id": "sb0", "vcodec": "none", "acodec": "none", "ext": "mhtml", "width": 48, "height": 27},
                   {"format_id": "18", "vcodec": "avc1", "acodec": "mp4a", "width": 640, "height": 360, "ext": "mp4"}]
        self.assertEqual(ytdlp.qualities(formats, True), [360])


if __name__ == "__main__":
    unittest.main()
