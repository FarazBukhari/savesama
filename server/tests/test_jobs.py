import json
import os
import shutil
import tempfile
import threading
import time
import unittest
from unittest import mock

from helpers import FakeResolver
from savesama_server import download
from savesama_server.errors import ApiError
from savesama_server.extractors.ytdlp import Cancelled
from savesama_server.jobs import MAX_JOBS, JobManager


def wait_for(fn, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if fn():
            return True
        time.sleep(0.02)
    raise AssertionError("condition not met")


class FakeRun:
    """Replaces download.run: writes a file into the job's tmpdir, optionally blocking."""

    def __init__(self, block=False, fail=None):
        self.block = threading.Event() if block else None
        self.fail = fail
        self.tmpdirs = []
        self.started = threading.Semaphore(0)

    def __call__(self, resolved, item, mode, quality, can_mux, tmpdir, progress, on_processing, cancel):
        self.tmpdirs.append(tmpdir)
        part = os.path.join(tmpdir, "video.part")
        with open(part, "wb") as fh:
            fh.write(b"x" * 100)
        progress.update("v", 100, 200, force=True)
        self.started.release()
        if self.block:
            while not self.block.is_set():
                if cancel.is_set():
                    raise Cancelled()
                time.sleep(0.01)
        if self.fail:
            raise self.fail
        assert os.path.exists(part), "another job deleted this job's intermediate file"
        on_processing()
        out = os.path.join(tmpdir, "out.m4a" if mode == "audio" else "out.mp4")
        os.replace(part, out)
        return out


class JobManagerTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.data = os.path.join(self.dir, "data")
        os.makedirs(self.data)
        self.downloads = os.path.join(self.dir, "downloads")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def manager(self, resolver=None, workers=2):
        return JobManager(self.data, self.downloads, resolver or FakeResolver(3), workers=workers)

    def test_create_runs_and_names_files(self):
        fake = FakeRun()
        with mock.patch.object(download, "run", fake):
            m = self.manager()
            jobs = m.create("https://www.instagram.com/p/Abc123/", None, "media", "max")
            self.assertEqual([j.item_index for j in jobs], [0, 1, 2])
            wait_for(lambda: all(m.get(j.id).status == "done" for j in jobs))
        j = m.snapshot(jobs[1].id)
        self.assertEqual(j["file"]["name"], "A test post with bad chars [Abc123-2].mp4")
        self.assertEqual(j["file"]["mime"], "video/mp4")
        self.assertEqual(j["file"]["type"], "video")
        self.assertEqual(j["progress"], 1.0)
        self.assertIsNotNone(j["finished_at"])
        self.assertEqual(os.listdir(m.tmp_root), [])

    def test_bad_item_index(self):
        m = self.manager()
        with self.assertRaises(ApiError) as ctx:
            m.create("u", [5], "media", "max")
        self.assertEqual(ctx.exception.code, "bad_request")

    def test_same_media_twice_never_shares_temp_files(self):
        fake = FakeRun(block=True)
        with mock.patch.object(download, "run", fake):
            m = self.manager(FakeResolver(1))
            a = m.create("u", [0], "media", "max")[0]
            b = m.create("u", [0], "media", "max")[0]
            fake.started.acquire(timeout=3)
            fake.started.acquire(timeout=3)
            self.assertNotEqual(fake.tmpdirs[0], fake.tmpdirs[1])
            fake.block.set()
            wait_for(lambda: m.get(a.id).status == "done" and m.get(b.id).status == "done")
        names = {m.get(a.id).file["name"], m.get(b.id).file["name"]}
        self.assertEqual(len(names), 2)
        for n in names:
            self.assertTrue(os.path.isfile(os.path.join(self.downloads, n)))

    def test_cancel_running_then_retry_same_id(self):
        fake = FakeRun(block=True)
        with mock.patch.object(download, "run", fake):
            m = self.manager(FakeResolver(1), workers=1)
            job = m.create("u", None, "audio", "max")[0]
            fake.started.acquire(timeout=3)
            self.assertEqual(m.get(job.id).status, "running")
            self.assertEqual(m.get(job.id).bytes_done, 100)
            out = m.cancel(job.id)
            self.assertEqual(out["status"], "cancelled")
            wait_for(lambda: os.listdir(m.tmp_root) == [])  # partial files removed
            with self.assertRaises(ApiError) as ctx:
                m.cancel(job.id)
            self.assertEqual(ctx.exception.code, "conflict")
            again = m.retry(job.id)
            self.assertEqual((again["id"], again["status"]), (job.id, "queued"))
            fake.started.acquire(timeout=3)
            fake.block.set()
            wait_for(lambda: m.get(job.id).status == "done")
        self.assertEqual(m.get(job.id).file["type"], "audio")
        self.assertEqual(m.get(job.id).file["mime"], "audio/mp4")
        with self.assertRaises(ApiError) as ctx:
            m.retry(job.id)
        self.assertEqual(ctx.exception.code, "conflict")

    def test_cancel_queued(self):
        fake = FakeRun(block=True)
        with mock.patch.object(download, "run", fake):
            m = self.manager(FakeResolver(2), workers=1)
            first, second = m.create("u", None, "media", 720)
            fake.started.acquire(timeout=3)
            self.assertEqual(m.cancel(second.id)["status"], "cancelled")
            fake.block.set()
            wait_for(lambda: m.get(first.id).status == "done")
            time.sleep(0.1)
            self.assertEqual(m.get(second.id).status, "cancelled")
            self.assertEqual(len(fake.tmpdirs), 1)

    def test_error_is_reported_and_retryable(self):
        with mock.patch.object(download, "run", FakeRun(fail=ApiError("rate_limited", "slow down"))):
            m = self.manager(FakeResolver(1))
            job = m.create("u", None, "media", "max")[0]
            wait_for(lambda: m.get(job.id).status == "error")
        self.assertEqual(m.get(job.id).error, {"code": "rate_limited", "message": "slow down"})
        with mock.patch.object(download, "run", FakeRun(fail=RuntimeError("boom"))):
            m.retry(job.id)
            wait_for(lambda: m.get(job.id).status == "error")
        self.assertEqual(m.get(job.id).error["code"], "internal")

    def test_delete_removes_file(self):
        with mock.patch.object(download, "run", FakeRun()):
            m = self.manager(FakeResolver(1))
            job = m.create("u", None, "media", "max")[0]
            wait_for(lambda: m.get(job.id).status == "done")
        _, path = m.file_path(job.id)
        m.delete(job.id)
        self.assertFalse(os.path.exists(path))
        with self.assertRaises(ApiError) as ctx:
            m.get(job.id)
        self.assertEqual(ctx.exception.code, "not_found")

    def test_file_of_unfinished_job_conflicts(self):
        fake = FakeRun(block=True)
        with mock.patch.object(download, "run", fake):
            m = self.manager(FakeResolver(1))
            job = m.create("u", None, "media", "max")[0]
            with self.assertRaises(ApiError) as ctx:
                m.file_path(job.id)
            self.assertEqual(ctx.exception.code, "conflict")
            fake.block.set()

    def test_persistence_across_restart(self):
        fake = FakeRun(block=True)
        with mock.patch.object(download, "run", fake):
            m = self.manager(FakeResolver(2), workers=1)
            a, b = m.create("u", None, "media", "max")
            fake.started.acquire(timeout=3)
            fake.block.set()
            wait_for(lambda: m.get(a.id).status == "done" and m.get(b.id).status == "done")
        with open(os.path.join(self.data, "jobs.json")) as fh:
            self.assertEqual(len(json.load(fh)["jobs"]), 2)
        # Simulate a crash mid-download: one job persisted as running.
        path = os.path.join(self.data, "jobs.json")
        with open(path) as fh:
            state = json.load(fh)
        state["jobs"][0]["status"] = "running"
        with open(path, "w") as fh:
            json.dump(state, fh)
        with mock.patch.object(download, "run", FakeRun()):
            m2 = self.manager(FakeResolver(2))
            ids = {j["id"] for j in m2.list()}
            self.assertEqual(ids, {a.id, b.id})
            wait_for(lambda: all(j["status"] == "done" for j in m2.list()))
        _, path = m2.file_path(b.id)
        self.assertTrue(os.path.isfile(path))

    def test_list_newest_first_and_eviction(self):
        with mock.patch.object(download, "run", FakeRun()):
            m = self.manager(FakeResolver(1))
            first = m.create("u", None, "media", "max")[0]
            wait_for(lambda: m.get(first.id).status == "done")
            for _ in range(MAX_JOBS):
                last = m.create("u", None, "media", "max")[0]
            wait_for(lambda: all(j["status"] == "done" for j in m.list()), timeout=30)
        listed = m.list()
        self.assertLessEqual(len(listed), MAX_JOBS)
        self.assertEqual(listed[0]["id"], last.id)
        self.assertNotIn(first.id, {j["id"] for j in listed})
        # Evicted jobs take their files with them: disk holds exactly the listed jobs' files.
        on_disk = {n for n in os.listdir(self.downloads) if not n.startswith(".")}
        self.assertEqual(on_disk, {j["file"]["name"] for j in listed})


if __name__ == "__main__":
    unittest.main()
