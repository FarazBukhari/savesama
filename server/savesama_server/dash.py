"""Reads Meta's per-post DASH manifest (video_dash_manifest) for its audio-only stream.

The <BaseURL> is a signed URL whose '&' arrive as '&amp;'; an XML parser decodes them. A
plain GET of the audio BaseURL returns a complete fragmented MP4 (HE-AAC), no segment
assembly needed.
"""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _representations(manifest: str):
    root = ET.fromstring(manifest)
    for aset in root.iter():
        if _local(aset.tag) != "AdaptationSet":
            continue
        set_kind = (aset.get("contentType") or aset.get("mimeType") or "").split("/")[0]
        for rep in aset:
            if _local(rep.tag) != "Representation":
                continue
            kind = (rep.get("mimeType") or "").split("/")[0] or set_kind
            base = next((c.text for c in rep if _local(c.tag) == "BaseURL" and c.text), None)
            if base:
                yield kind, rep, base.strip()


def h264_videos(manifest: str | None) -> list[tuple[int, int, int, str]]:
    """H.264 video-only representations as (width, height, bandwidth, url), best first.

    VP9/AV1 representations are skipped: they don't play in every Android gallery.
    """
    if not manifest:
        return []
    out = []
    try:
        for kind, rep, base in _representations(manifest):
            if kind != "video" or not (rep.get("codecs") or "").startswith("avc1"):
                continue
            w, h = int(rep.get("width") or 0), int(rep.get("height") or 0)
            if w and h:
                out.append((w, h, int(rep.get("bandwidth") or 0), base))
    except (ET.ParseError, ValueError):
        return []
    return sorted(out, key=lambda r: (min(r[0], r[1]), r[2]), reverse=True)


def audio_url(manifest: str | None) -> str | None:
    """URL of the highest-bandwidth audio representation, or None."""
    if not manifest:
        return None
    try:
        best = None
        for kind, rep, base in _representations(manifest):
            if kind != "audio":
                continue
            bw = int(rep.get("bandwidth") or 0)
            if best is None or bw > best[0]:
                best = (bw, base)
        return best[1] if best else None
    except ET.ParseError:
        # Last resort for a malformed manifest: regex, then decode entities ourselves.
        m = re.search(r'contentType="audio".*?<BaseURL>([^<]+)</BaseURL>', manifest, re.S)
        return html.unescape(m.group(1)).strip() if m else None
