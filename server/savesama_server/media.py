"""Resolved posts and the quality rule shared by every extractor."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


def short_side(width: int | None, height: int | None) -> int | None:
    """Resolutions are compared by the short side: a 1080x1920 reel is "1080"."""
    if width and height:
        return min(int(width), int(height))
    return int(width or height) if (width or height) else None


def pick_rung(rungs: list[int], quality: str | int) -> int | None:
    """Best rung at/below the target, else the smallest available (docs/API.md)."""
    rungs = sorted({r for r in rungs if r})
    if not rungs:
        return None
    if quality == "max":
        return rungs[-1]
    at_or_below = [r for r in rungs if r <= int(quality)]
    return at_or_below[-1] if at_or_below else rungs[0]


@dataclass
class Variant:
    """One directly downloadable rendition (muxed video, image or audio-only stream)."""

    url: str
    width: int | None = None
    height: int | None = None
    has_audio: bool = True
    ext: str = "mp4"

    @property
    def short(self) -> int | None:
        return short_side(self.width, self.height)


def choose_variant(variants: list[Variant], quality: str | int, can_mux: bool = True) -> Variant | None:
    """Video-only variants are usable only when ffmpeg can mux them with the audio stream."""
    if not can_mux:
        variants = [v for v in variants if v.has_audio]
    if not variants:
        return None
    sized = [v for v in variants if v.short]
    rung = pick_rung([v.short for v in sized], quality)
    if rung is None:
        return variants[0]
    # Same rung: prefer a rendition that carries audio.
    return sorted((v for v in sized if v.short == rung), key=lambda v: not v.has_audio)[0]


@dataclass
class Item:
    index: int
    type: str  # video | image | audio
    thumbnail: str | None = None
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    has_audio: bool = False
    qualities: list[int] = field(default_factory=list)
    # How to fetch it: "direct" (our own extractors) or "ytdlp".
    source: str = "direct"
    variants: list[Variant] = field(default_factory=list)
    audio_url: str | None = None
    entry: dict | None = None  # yt-dlp info dict for this entry
    playlist_index: int | None = None

    def to_api(self) -> dict:
        return {
            "index": self.index,
            "type": self.type,
            "thumbnail": self.thumbnail,
            "width": self.width,
            "height": self.height,
            "duration": self.duration,
            "qualities": sorted(set(self.qualities), reverse=True) if self.type == "video" else [],
            "has_audio": bool(self.has_audio),
        }


@dataclass
class Resolved:
    url: str
    platform: str
    id: str
    title: str | None = None
    author: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    items: list[Item] = field(default_factory=list)
    referer: str | None = None
    # In-memory anonymous session cookies yt-dlp collected (TikTok's CDN wants them back).
    cookies: Any = None
    created: float = field(default_factory=time.time)
    via: str = ""

    def to_api(self) -> dict:
        thumb = self.thumbnail or next((i.thumbnail for i in self.items if i.thumbnail), None)
        duration = self.duration
        if duration is None and len(self.items) == 1:
            duration = self.items[0].duration
        return {
            "url": self.url,
            "platform": self.platform,
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "thumbnail": thumb,
            "duration": duration,
            "items": [i.to_api() for i in self.items],
        }


def video_qualities(variants: list[Variant], can_mux: bool = True) -> list[int]:
    return sorted({v.short for v in variants if v.short and (can_mux or v.has_audio)}, reverse=True)
