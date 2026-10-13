"""Shared test helpers: fixtures and a scripted fake for net.request."""

from __future__ import annotations

import json
import logging
import os
import sys
from email.message import Message

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # run without installing the package

from savesama_server.net import Response  # noqa: E402

FIXTURES = os.path.join(HERE, "fixtures")
logging.disable(logging.CRITICAL)


def fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as fh:
        return fh.read()


def fixture_json(name: str):
    return json.loads(fixture(name))


def response(body: str | bytes = b"", status: int = 200, url: str = "https://www.example.com/",
             headers: dict | None = None) -> Response:
    msg = Message()
    for k, v in (headers or {}).items():
        msg[k] = v
    if isinstance(body, str):
        body = body.encode("utf-8")
    return Response(status, url, msg, body)


class FakeNet:
    """Replaces net.request: routes (method, url-substring) to canned responses, records calls."""

    def __init__(self, routes):
        self.routes = routes  # list of (method, substring, Response or callable)
        self.calls = []

    def __call__(self, url, *, method="GET", headers=None, data=None, ua=None, timeout=20,
                 follow_redirects=True, max_bytes=0):
        self.calls.append({"url": url, "method": method, "headers": headers or {}, "data": data, "ua": ua,
                           "follow_redirects": follow_redirects})
        for m, sub, resp in self.routes:
            if m == method and sub in url:
                r = resp(url) if callable(resp) else resp
                if isinstance(r, Exception):
                    raise r
                if r.url == "https://www.example.com/":
                    r.url = url
                return r
        raise AssertionError(f"unexpected request {method} {url}")


class FakeResolver:
    """Stands in for Resolver: returns a canned post with `count` items."""

    def __init__(self, count=1, error=None):
        from savesama_server.media import Item, Resolved, Variant

        self.error = error
        self.calls = 0
        self.res = Resolved(url="https://www.instagram.com/p/Abc123/", platform="instagram", id="Abc123",
                            title="A test: post/with*bad|chars", author="tester",
                            items=[Item(index=i, type="video", thumbnail=f"https://t/{i}.jpg",
                                        variants=[Variant(f"https://scontent.cdninstagram.com/{i}.mp4", 720, 1280)],
                                        qualities=[720], has_audio=True) for i in range(count)])

    def resolve(self, url, fresh=False):
        self.calls += 1
        if self.error:
            raise self.error
        return self.res

    def forget(self, url):
        pass
