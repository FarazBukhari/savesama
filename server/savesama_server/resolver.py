"""Dispatches links to extractors and caches results briefly.

The app usually calls /resolve and then /jobs for the same link; the cache means the
platform is asked once, which matters for rate limits. Concurrent requests for the same
link wait for one extraction instead of each starting their own.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict

from .errors import ApiError
from .extractors import facebook, instagram, reddit, threads, tiktok, ytdlp
from .media import Resolved
from .urls import clean_url

CACHE_TTL = 15 * 60
CACHE_SIZE = 64


class Resolver:
    def __init__(self, can_mux: bool):
        self.can_mux = can_mux
        self._cache: OrderedDict[str, Resolved] = OrderedDict()
        self._lock = threading.Lock()
        self._inflight: dict[str, threading.Lock] = {}

    def resolve(self, raw_url: object, fresh: bool = False) -> Resolved:
        url, platform = clean_url(raw_url)
        with self._lock:
            key_lock = self._inflight.setdefault(url, threading.Lock())
        try:
            with key_lock:
                if not fresh:
                    hit = self._get(url)
                    if hit:
                        return hit
                res = self._extract(url, platform)
                res.url = res.url or url
                with self._lock:
                    # Jobs store the canonical URL; cache it too so they don't extract again.
                    for key in {url, res.url}:
                        self._cache[key] = res
                        self._cache.move_to_end(key)
                    while len(self._cache) > CACHE_SIZE:
                        self._cache.popitem(last=False)
                return res
        finally:
            with self._lock:
                if self._inflight.get(url) is key_lock and not key_lock.locked():
                    self._inflight.pop(url, None)

    def _get(self, url: str) -> Resolved | None:
        with self._lock:
            res = self._cache.get(url)
            if res and time.time() - res.created < CACHE_TTL:
                return res
            self._cache.pop(url, None)
            return None

    def forget(self, url: str) -> None:
        try:
            key = clean_url(url)[0]
        except ApiError:
            return
        with self._lock:
            stale = self._cache.pop(key, None)
            for k, v in list(self._cache.items()):
                if v is stale:
                    self._cache.pop(k, None)

    def _extract(self, url: str, platform: str) -> Resolved:
        if platform == "instagram":
            return instagram.extract(url, self.can_mux)
        if platform == "threads":
            return threads.extract(url, self.can_mux)
        if platform == "facebook":
            return facebook.extract(url, self.can_mux)
        if platform == "tiktok":
            return tiktok.extract(url, self.can_mux)
        if platform == "reddit":
            return reddit.extract(url, self.can_mux, follow=lambda u: self._extract(*clean_url(u)))
        return ytdlp.resolve(url, platform, self.can_mux)
