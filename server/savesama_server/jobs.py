"""Job queue: worker pool, state machine, persistence (~/.savesama/jobs.json).

Every attempt of every job downloads into its own temp dir (<downloads>/.tmp/<id>-<attempt>),
so two jobs for the same media, or a retry racing a cancelled attempt, never share or delete
each other's intermediate files.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import shutil
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field

from . import download
from .errors import ApiError
from .extractors.ytdlp import Cancelled
from .resolver import Resolver

log = logging.getLogger("savesama.jobs")

MAX_JOBS = 200
ACTIVE = ("queued", "running", "processing")
FINISHED = ("done", "error", "cancelled")
PUBLIC_FIELDS = ("id", "url", "platform", "item_index", "mode", "quality", "status", "progress",
                 "bytes_done", "bytes_total", "speed", "eta", "title", "author", "thumbnail", "file",
                 "error", "created_at", "finished_at")


@dataclass
class Job:
    id: str
    url: str
    platform: str
    item_index: int
    mode: str
    quality: object
    status: str = "queued"
    progress: float = 0.0
    bytes_done: int = 0
    bytes_total: int | None = None
    speed: float | None = None
    eta: float | None = None
    title: str | None = None
    author: str | None = None
    thumbnail: str | None = None
    file: dict | None = None
    error: dict | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    attempt: int = 0
    cancel_event: threading.Event = field(default_factory=threading.Event, repr=False)

    def to_api(self) -> dict:
        d = {k: getattr(self, k) for k in PUBLIC_FIELDS}
        d["speed"] = round(self.speed) if self.speed is not None else None
        d["eta"] = round(self.eta) if self.eta is not None else None
        d["progress"] = round(min(max(self.progress, 0.0), 1.0), 4)
        return d

    def to_disk(self) -> dict:
        d = {k: getattr(self, k) for k in PUBLIC_FIELDS}
        d["attempt"] = self.attempt
        return d


class JobManager:
    def __init__(self, data_dir: str, downloads_dir: str, resolver: Resolver, workers: int = 2,
                 can_mux: bool = True):
        self.data_dir = data_dir
        self.downloads_dir = downloads_dir
        self.tmp_root = os.path.join(downloads_dir, ".tmp")
        self.state_path = os.path.join(data_dir, "jobs.json")
        self.resolver = resolver
        self.can_mux = can_mux
        self.jobs: dict[str, Job] = {}
        self.lock = threading.RLock()
        self.queue: queue.Queue[tuple[str, int]] = queue.Queue()
        self._save_lock = threading.Lock()
        os.makedirs(downloads_dir, exist_ok=True)
        shutil.rmtree(self.tmp_root, ignore_errors=True)  # leftovers of a crashed run
        os.makedirs(self.tmp_root, exist_ok=True)
        self._load()
        self.threads = [threading.Thread(target=self._worker, name=f"worker-{i + 1}", daemon=True)
                        for i in range(max(1, workers))]
        for t in self.threads:
            t.start()

    # ---- persistence ----------------------------------------------------------------

    def _load(self) -> None:
        try:
            with open(self.state_path, encoding="utf-8") as fh:
                raw = json.load(fh)
        except FileNotFoundError:
            return
        except (OSError, ValueError) as e:
            log.warning("ignoring unreadable %s: %s", self.state_path, e)
            return
        for d in raw.get("jobs", []) if isinstance(raw, dict) else []:
            try:
                job = Job(**{k: d.get(k) for k in PUBLIC_FIELDS if k in d}, attempt=int(d.get("attempt") or 0))
            except TypeError:
                continue
            if job.status in ACTIVE:  # interrupted by a restart: start over
                self._reset(job)
            self.jobs[job.id] = job
        for job in sorted(self.jobs.values(), key=lambda j: j.created_at):
            if job.status == "queued":
                self.queue.put((job.id, job.attempt))
        log.info("loaded %d jobs", len(self.jobs))

    def save(self) -> None:
        with self.lock:
            data = {"version": 1, "jobs": [j.to_disk() for j in self.jobs.values()]}
        tmp = self.state_path + ".tmp"
        with self._save_lock:
            try:
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(data, fh)
                os.replace(tmp, self.state_path)
            except OSError as e:
                log.warning("couldn't save jobs: %s", e)

    # ---- public API -----------------------------------------------------------------

    def create(self, url: object, items: list[int] | None, mode: str, quality) -> list[Job]:
        resolved = self.resolver.resolve(url)
        count = len(resolved.items)
        if items is None:
            indices = list(range(count))
        else:
            bad = [i for i in items if i >= count]
            if bad:
                raise ApiError("bad_request", f"Item index {bad[0]} doesn't exist; this post has {count}.")
            indices = list(dict.fromkeys(items))
        jobs = []
        with self.lock:
            for i in indices:
                item = resolved.items[i]
                job = Job(id=uuid.uuid4().hex, url=resolved.url, platform=resolved.platform, item_index=i,
                          mode=mode, quality=quality, title=resolved.title, author=resolved.author,
                          thumbnail=item.thumbnail or resolved.thumbnail)
                self.jobs[job.id] = job
                jobs.append(job)
                self.queue.put((job.id, job.attempt))
            self._evict()
        self.save()
        return jobs

    def list(self) -> list[dict]:
        with self.lock:
            return [j.to_api() for j in sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)]

    def get(self, job_id: str) -> Job:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise ApiError("not_found", "No job with that id.")
            return job

    def snapshot(self, job_id: str) -> dict:
        with self.lock:
            return self.get(job_id).to_api()

    def cancel(self, job_id: str) -> dict:
        with self.lock:
            job = self.get(job_id)
            if job.status not in ACTIVE:
                raise ApiError("conflict", f"The job is already {job.status}.")
            job.cancel_event.set()
            job.status = "cancelled"
            job.speed = job.eta = None
            job.finished_at = time.time()
            out = job.to_api()
        self.save()
        return out

    def retry(self, job_id: str) -> dict:
        with self.lock:
            job = self.get(job_id)
            if job.status not in ("error", "cancelled"):
                raise ApiError("conflict", f"Only failed or cancelled jobs can be retried (this one is {job.status}).")
            self._reset(job)
            self.queue.put((job.id, job.attempt))
            out = job.to_api()
        # The previous failure may have come from a stale resolve; extract again.
        self.resolver.forget(job.url)
        self.save()
        return out

    def delete(self, job_id: str) -> None:
        with self.lock:
            job = self.get(job_id)
            job.cancel_event.set()
            self.jobs.pop(job_id, None)
            self._remove_file(job)
        self.save()

    def file_path(self, job_id: str) -> tuple[Job, str]:
        with self.lock:
            job = self.get(job_id)
            if job.status != "done" or not job.file:
                raise ApiError("conflict", f"The job isn't finished (it's {job.status}).")
            path = os.path.join(self.downloads_dir, job.file["name"])
        if not os.path.isfile(path):
            raise ApiError("not_found", "The file is no longer on the server.")
        return job, path

    def active_count(self) -> int:
        with self.lock:
            return sum(1 for j in self.jobs.values() if j.status in ACTIVE)

    # ---- internals ------------------------------------------------------------------

    def _reset(self, job: Job) -> None:
        job.attempt += 1
        job.cancel_event = threading.Event()
        job.status = "queued"
        job.progress, job.bytes_done = 0.0, 0
        job.bytes_total = job.speed = job.eta = None
        job.error = job.file = job.finished_at = None

    def _remove_file(self, job: Job) -> None:
        if job.file and job.file.get("name"):
            path = os.path.join(self.downloads_dir, os.path.basename(job.file["name"]))
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
            except OSError as e:
                log.warning("couldn't delete %s: %s", path, e)

    def _evict(self) -> None:
        if len(self.jobs) <= MAX_JOBS:
            return
        for job in sorted(self.jobs.values(), key=lambda j: j.created_at):
            if len(self.jobs) <= MAX_JOBS:
                break
            if job.status in FINISHED:
                self.jobs.pop(job.id, None)
                self._remove_file(job)

    def _current(self, job_id: str, attempt: int) -> Job | None:
        """The job if this attempt is still the live one (not cancelled/retried/deleted)."""
        job = self.jobs.get(job_id)
        if job is None or job.attempt != attempt or job.cancel_event.is_set():
            return None
        return job

    def _worker(self) -> None:
        while True:
            job_id, attempt = self.queue.get()
            try:
                self._run(job_id, attempt)
            except Exception:  # noqa: BLE001 - a worker must never die
                log.error("worker crashed on %s:\n%s", job_id, traceback.format_exc())

    def _run(self, job_id: str, attempt: int) -> None:
        with self.lock:
            job = self._current(job_id, attempt)
            if job is None or job.status != "queued":
                return
            job.status = "running"
            cancel = job.cancel_event
            url, index, mode, quality = job.url, job.item_index, job.mode, job.quality
        self.save()
        tmpdir = os.path.join(self.tmp_root, f"{job_id}-{attempt}")
        os.makedirs(tmpdir, exist_ok=True)

        def report(done, total, speed, eta):
            with self.lock:
                j = self._current(job_id, attempt)
                if j is None or j.status != "running":
                    return
                j.bytes_done, j.bytes_total, j.speed, j.eta = done, total, speed, eta
                if total:
                    j.progress = min(done / total, 0.999)

        def processing():
            with self.lock:
                j = self._current(job_id, attempt)
                if j is not None and j.status == "running":
                    j.status, j.progress, j.speed, j.eta = "processing", 1.0, None, None
            self.save()

        try:
            resolved = self.resolver.resolve(url)
            if index >= len(resolved.items):
                raise ApiError("not_found", "This item is no longer part of the post.")
            item = resolved.items[index]
            out = download.run(resolved, item, mode, quality, self.can_mux, tmpdir,
                               download.Progress(report), processing, cancel)
            ext = os.path.splitext(out)[1].lstrip(".") or "bin"
            name = download.file_name(resolved, index, ext)
            with self.lock:
                if self._current(job_id, attempt) is None:
                    return
            final = download.place(out, self.downloads_dir, name)
            kind, mime = download.kind_and_mime(final, mode)
            size = os.path.getsize(final)
            with self.lock:
                j = self._current(job_id, attempt)
                if j is None:  # cancelled or deleted while we were placing the file
                    os.remove(final)
                    return
                j.status, j.progress = "done", 1.0
                j.bytes_done = size
                j.bytes_total = size
                j.speed = j.eta = None
                j.file = {"name": os.path.basename(final), "size": size, "mime": mime, "type": kind}
                j.title = j.title or resolved.title
                j.finished_at = time.time()
            log.info("done %s -> %s (%d bytes)", job_id[:8], os.path.basename(final), size)
        except Cancelled:
            log.info("cancelled %s", job_id[:8])
        except ApiError as e:
            self._fail(job_id, attempt, e)
        except Exception as e:  # noqa: BLE001
            log.error("job %s failed:\n%s", job_id, traceback.format_exc())
            self._fail(job_id, attempt, ApiError("internal", f"Unexpected error: {e}"[:300]))
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
            self.save()

    def _fail(self, job_id: str, attempt: int, err: ApiError) -> None:
        with self.lock:
            j = self._current(job_id, attempt)
            if j is None:
                return
            j.status, j.error = "error", err.to_dict()
            j.speed = j.eta = None
            j.finished_at = time.time()
        log.info("error %s: %s", job_id[:8], err)
