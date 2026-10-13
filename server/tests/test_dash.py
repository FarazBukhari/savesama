import unittest

from helpers import fixture, fixture_json
from savesama_server import dash


class DashTest(unittest.TestCase):
    def test_live_manifest_audio_url_is_entity_decoded(self):
        url = dash.audio_url(fixture("dash_manifest.mpd"))
        self.assertTrue(url.startswith("https://"))
        self.assertNotIn("&amp;", url)
        self.assertIn("&", url)

    def test_live_manifest_h264_ladder(self):
        reps = dash.h264_videos(fixture("dash_manifest.mpd"))
        self.assertTrue(reps)
        self.assertEqual((reps[0][0], reps[0][1]), (720, 1280))
        for w, h, bw, url in reps:
            self.assertNotIn("&amp;", url)

    def test_vp9_skipped_and_best_audio(self):
        manifest = fixture_json("instagram_graphql_video.json")["data"]["xdt_shortcode_media"]["dash_info"]["video_dash_manifest"]
        reps = dash.h264_videos(manifest)
        self.assertEqual([(w, h) for w, h, _, _ in reps], [(1080, 1920), (540, 960)])
        self.assertEqual(dash.audio_url(manifest), "https://scontent.cdninstagram.com/v/audio.mp4?x=1&y=2&oh=sig")

    def test_empty_and_broken(self):
        self.assertIsNone(dash.audio_url(None))
        self.assertEqual(dash.h264_videos(""), [])
        broken = '<MPD><AdaptationSet contentType="audio"><BaseURL>https://x/a?b=1&amp;c=2</BaseURL>'
        self.assertEqual(dash.audio_url(broken), "https://x/a?b=1&c=2")


if __name__ == "__main__":
    unittest.main()
