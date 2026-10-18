import os
import stat
import tempfile
import unittest
import urllib.parse

from helpers import FIXTURES  # noqa: F401
from savesama_server import pairing


class PairingTest(unittest.TestCase):
    def test_token_created_private_and_stable(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "sub", "token")
            t1 = pairing.load_token(path)
            self.assertGreaterEqual(len(t1), 40)
            if os.name != "nt":
                self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
                os.chmod(path, 0o644)
            self.assertEqual(pairing.load_token(path), t1)
            if os.name != "nt":
                self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            self.assertNotEqual(pairing.load_token(path, reset=True), t1)

    def test_deep_link(self):
        link = pairing.deep_link("192.168.1.5", 8765, "abc_-123", "Pixel 8 (Termux)")
        self.assertTrue(link.startswith("savesama://pair?"))
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(link).query)
        self.assertEqual(q, {"host": ["192.168.1.5"], "port": ["8765"], "token": ["abc_-123"],
                             "name": ["Pixel 8 (Termux)"]})
        self.assertNotIn("+", link)

    def test_qr_renders(self):
        self.assertIn("█", pairing.qr_text("savesama://pair?host=1"))


if __name__ == "__main__":
    unittest.main()
