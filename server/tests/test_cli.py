import contextlib
import io
import os
import tempfile
import unittest
import urllib.parse
from unittest import mock

from helpers import FIXTURES  # noqa: F401
from savesama_server import cli, pairing


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [mock.patch.object(cli, "DATA_DIR", self.tmp.name),
                        mock.patch.object(cli, "LOCK_FILE", os.path.join(self.tmp.name, "server.lock")),
                        mock.patch.object(pairing, "is_termux", return_value=False)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def run_cli(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            cli.main(list(argv))
        return out.getvalue()

    def test_pair_prints_link_with_token(self):
        text = self.run_cli("pair", "--name", "My Phone", "--port", "9000", "--local-only")
        link = next(line for line in text.splitlines() if line.startswith("savesama://pair?"))
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(link).query)
        with open(os.path.join(self.tmp.name, "token")) as fh:
            self.assertEqual(q["token"], [fh.read().strip()])
        self.assertEqual((q["host"], q["port"], q["name"]), (["127.0.0.1"], ["9000"], ["My Phone"]))

    def test_reset_token(self):
        self.run_cli("pair")
        with open(os.path.join(self.tmp.name, "token")) as fh:
            before = fh.read()
        self.run_cli("reset-token")
        with open(os.path.join(self.tmp.name, "token")) as fh:
            self.assertNotEqual(fh.read(), before)

    def test_data_dir_lock_is_exclusive(self):
        first = cli._lock_data_dir()
        self.assertIsNotNone(first)
        if os.name != "nt":  # flock is per open file description, so a second open conflicts
            self.assertIsNone(cli._lock_data_dir())
        first.close()
        again = cli._lock_data_dir()
        self.assertIsNotNone(again)
        again.close()


if __name__ == "__main__":
    unittest.main()
