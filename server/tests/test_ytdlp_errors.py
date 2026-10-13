import unittest

from helpers import fixture_json  # noqa: F401
from yt_dlp.utils import DownloadError, ExtractorError, GeoRestrictedError

from savesama_server.extractors import ytdlp


def dl(msg):
    return DownloadError("ERROR: " + msg, (ExtractorError, ExtractorError(msg), None))


class MapErrorTest(unittest.TestCase):
    def check(self, msg, code, platform="youtube"):
        self.assertEqual(ytdlp.map_error(dl(msg), platform).code, code, msg)

    def test_messages(self):
        self.check("[youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser", "rate_limited")
        self.check("[youtube] x: Private video. Sign in if you've been granted access", "login_required")
        self.check("[youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.", "login_required")
        self.check("[youtube] x: Video unavailable. This video has been removed by the uploader", "not_found")
        self.check("[youtube] x: This live event will begin in 3 hours.", "unavailable")
        self.check("[Instagram] x: The webpage request was redirected to the login page. You have exceeded the rate-limit", "rate_limited", "instagram")
        self.check("[TikTok] x: Unexpected response from webpage request; please report this issue on https://github.com/yt-dlp/yt-dlp/issues", "internal", "tiktok")
        self.check("Unsupported URL: https://www.youtube.com/feed/x", "unsupported_url")
        self.check("[facebook] x: Cannot parse data; please report this issue", "internal", "facebook")

    def test_geo_and_messages_are_clean(self):
        err = ytdlp.map_error(GeoRestrictedError("The uploader has not made this video available in your country"), "youtube")
        self.assertEqual(err.code, "unavailable")
        err = ytdlp.map_error(dl("[TikTok] 1: Unexpected response; please report this issue on https://github.com/x"), "tiktok")
        self.assertNotIn("github", err.message)
        self.assertNotIn("ERROR", err.message)


if __name__ == "__main__":
    unittest.main()
