import http.client
import json
import os
import shutil
import tempfile
import threading
import time
import unittest
from unittest import mock

from helpers import FakeResolver
from test_jobs import FakeRun, wait_for
from savesama_server import download
from savesama_server.api import Server
from savesama_server.errors import ApiError
from savesama_server.jobs import JobManager

TOKEN = "t" * 43


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        cls.patch = mock.patch.object(download, "run", FakeRun())
        cls.patch.start()
        cls.resolver = FakeResolver(2)
        jobs = JobManager(cls.dir, os.path.join(cls.dir, "dl"), cls.resolver, workers=2)
        cls.server = Server(("127.0.0.1", 0), token=TOKEN, name="Unit Box", jobs=jobs,
                            resolver=cls.resolver, ffmpeg=True)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.patch.stop()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def req(self, method, path, body=None, token=TOKEN, headers=None, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = dict(headers or {})
        if token:
            h["Authorization"] = f"Bearer {token}"
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if data is not None:
            h.setdefault("Content-Type", "application/json")
        conn.request(method, "/api/v1" + path, body=data, headers=h)
        resp = conn.getresponse()
        payload = resp.read()
        conn.close()
        return resp, payload

    def jbody(self, payload):
        return json.loads(payload) if payload else None

    def test_info_without_auth(self):
        resp, payload = self.req("GET", "/info", token=None)
        self.assertEqual(resp.status, 200)
        info = self.jbody(payload)
        self.assertEqual(info["app"], "savesama")
        self.assertEqual(info["api"], 1)
        self.assertEqual(info["name"], "Unit Box")
        self.assertEqual(info["platforms"], ["youtube", "instagram", "tiktok", "facebook", "threads", "reddit"])
        self.assertTrue(info["ffmpeg"])
        self.assertTrue(info["extractor_version"])
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "*")

    def test_auth(self):
        for token in (None, "wrong", TOKEN + "x"):
            resp, payload = self.req("GET", "/jobs", token=token)
            self.assertEqual(resp.status, 401)
            self.assertEqual(self.jbody(payload)["error"]["code"], "unauthorized")
            self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "*")
        resp, _ = self.req("GET", "/jobs", token=None, headers={"Authorization": "Basic " + TOKEN})
        self.assertEqual(resp.status, 401)

    def test_preflight(self):
        resp, payload = self.req("OPTIONS", "/jobs", token=None,
                                 headers={"Origin": "http://localhost:8081", "Access-Control-Request-Method": "POST"})
        self.assertEqual(resp.status, 204)
        self.assertEqual(payload, b"")
        self.assertIn("DELETE", resp.getheader("Access-Control-Allow-Methods"))
        self.assertIn("Range", resp.getheader("Access-Control-Allow-Headers"))
        self.assertIn("Content-Range", resp.getheader("Access-Control-Expose-Headers"))

    def test_body_limits_and_validation(self):
        resp, payload = self.req("POST", "/resolve", raw=b"x" * (64 * 1024 + 1))
        self.assertEqual(resp.status, 413)
        resp, payload = self.req("POST", "/resolve", raw=b"{nope")
        self.assertEqual((resp.status, self.jbody(payload)["error"]["code"]), (400, "bad_request"))
        resp, payload = self.req("POST", "/resolve", raw=b"[1]")
        self.assertEqual(resp.status, 400)
        resp, payload = self.req("POST", "/resolve", raw=b"{}", headers={"Content-Length": "-5"})
        self.assertEqual(resp.status, 400)
        for body in ({"url": "u", "mode": "video"}, {"url": "u", "quality": "high"},
                     {"url": "u", "quality": -1}, {"url": "u", "items": []}, {"url": "u", "items": ["0"]},
                     {"url": "u", "items": [True]}):
            resp, payload = self.req("POST", "/jobs", body)
            self.assertEqual(resp.status, 400, body)

    def test_unsupported_url_never_reaches_resolver(self):
        from savesama_server.resolver import Resolver
        real = Resolver(True)
        with mock.patch.object(self.server, "resolver", real):
            resp, payload = self.req("POST", "/resolve", {"url": "https://example.com/video.mp4"})
        self.assertEqual(resp.status, 422)
        self.assertEqual(self.jbody(payload)["error"]["code"], "unsupported_url")

    def test_resolve_shape(self):
        resp, payload = self.req("POST", "/resolve", {"url": "https://www.instagram.com/p/Abc123/"})
        self.assertEqual(resp.status, 200)
        r = self.jbody(payload)
        self.assertEqual(set(r), {"url", "platform", "id", "title", "author", "thumbnail", "duration", "items"})
        self.assertEqual(set(r["items"][0]), {"index", "type", "thumbnail", "width", "height", "duration",
                                              "qualities", "has_audio", "title"})

    def test_resolve_errors_map_to_status(self):
        for code, status in (("login_required", 422), ("not_found", 404), ("rate_limited", 429),
                             ("network", 502), ("unavailable", 422)):
            with mock.patch.object(self.resolver, "error", ApiError(code)):
                resp, payload = self.req("POST", "/resolve", {"url": "https://www.instagram.com/p/x/"})
            self.assertEqual((resp.status, self.jbody(payload)["error"]["code"]), (status, code))

    def test_job_lifecycle_and_file_ranges(self):
        resp, payload = self.req("POST", "/jobs", {"url": "https://www.instagram.com/p/Abc123/", "items": [1],
                                                    "quality": "720"})
        self.assertEqual(resp.status, 201)
        job = self.jbody(payload)["jobs"][0]
        self.assertEqual(len(job["id"]), 32)
        self.assertEqual((job["item_index"], job["quality"], job["mode"]), (1, 720, "media"))
        jid = job["id"]
        wait_for(lambda: self.jbody(self.req("GET", f"/jobs/{jid}")[1])["status"] == "done")
        job = self.jbody(self.req("GET", f"/jobs/{jid}")[1])
        size = job["file"]["size"]

        resp, body = self.req("GET", f"/jobs/{jid}/file")
        self.assertEqual(resp.status, 200)
        self.assertEqual(len(body), size)
        self.assertEqual(resp.getheader("Content-Type"), "video/mp4")
        self.assertEqual(int(resp.getheader("Content-Length")), size)
        self.assertTrue(resp.getheader("Content-Disposition").startswith("attachment; filename*=UTF-8''"))

        resp, part = self.req("GET", f"/jobs/{jid}/file", headers={"Range": "bytes=10-19"})
        self.assertEqual(resp.status, 206)
        self.assertEqual(resp.getheader("Content-Range"), f"bytes 10-19/{size}")
        self.assertEqual(part, body[10:20])
        resp, part = self.req("GET", f"/jobs/{jid}/file", headers={"Range": "bytes=90-"})
        self.assertEqual((resp.status, part), (206, body[90:]))
        resp, part = self.req("GET", f"/jobs/{jid}/file", headers={"Range": "bytes=-5"})
        self.assertEqual((resp.status, part), (206, body[-5:]))
        resp, _ = self.req("GET", f"/jobs/{jid}/file", headers={"Range": f"bytes={size}-"})
        self.assertEqual(resp.status, 416)
        self.assertEqual(resp.getheader("Content-Range"), f"bytes */{size}")
        resp, part = self.req("GET", f"/jobs/{jid}/file", headers={"Range": "bytes=0-1,5-6"})
        self.assertEqual((resp.status, len(part)), (200, size))

        resp, payload = self.req("POST", f"/jobs/{jid}/cancel")
        self.assertEqual((resp.status, self.jbody(payload)["error"]["code"]), (409, "conflict"))
        resp, payload = self.req("POST", f"/jobs/{jid}/retry")
        self.assertEqual(resp.status, 409)

        resp, payload = self.req("GET", "/jobs")
        self.assertIn(jid, [j["id"] for j in self.jbody(payload)["jobs"]])
        resp, payload = self.req("DELETE", f"/jobs/{jid}")
        self.assertEqual((resp.status, payload), (204, b""))
        resp, payload = self.req("GET", f"/jobs/{jid}")
        self.assertEqual((resp.status, self.jbody(payload)["error"]["code"]), (404, "not_found"))
        resp, _ = self.req("GET", f"/jobs/{jid}/file")
        self.assertEqual(resp.status, 404)

    def test_unknown_routes(self):
        self.assertEqual(self.req("GET", "/nope")[0].status, 404)
        self.assertEqual(self.req("GET", "/jobs/not-an-id")[0].status, 404)
        self.assertEqual(self.req("GET", "/nope", token=None)[0].status, 401)

    def test_keep_alive_survives_error_bodies(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        for _ in range(3):
            conn.request("POST", "/api/v1/jobs", body=b'{"url":"u","mode":"bad"}', headers=h)
            r = conn.getresponse()
            r.read()
            self.assertEqual(r.status, 400)
            conn.request("GET", "/api/v1/info")
            r = conn.getresponse()
            r.read()
            self.assertEqual(r.status, 200)
        conn.close()


if __name__ == "__main__":
    unittest.main()
