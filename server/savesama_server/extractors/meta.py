"""Turns Instagram/Threads media JSON into Items.

Two payload shapes reach us:
- "api" shape (Threads post pages; Instagram's private API): media_type 1/2/8/19,
  image_versions2.candidates, video_versions, carousel_media, video_dash_manifest.
- "graph" shape (Instagram GraphQL and the embed page's gql_data): __typename,
  display_resources, video_url, edge_sidecar_to_children, dash_info.
"""

from __future__ import annotations

import base64
import json
import re
import urllib.parse

from .. import dash
from ..errors import ApiError
from ..media import Item, Variant, short_side, video_qualities

MEDIA_IMAGE, MEDIA_VIDEO, MEDIA_CAROUSEL, MEDIA_TEXT = 1, 2, 8, 19


def _ratio(w, h) -> float | None:
    return (w / h) if w and h else None


def _full_frame(cands: list[tuple[int, int, str]], orig_w, orig_h) -> list[tuple[int, int, str]]:
    """Drop the square centre-crops Meta lists next to the real ladder.

    A 480x854 rung and a 480x480 crop share a short side; picking the crop would silently
    save a cropped photo. Keep only candidates matching the post's own aspect ratio (or the
    largest candidate's, which is always full-frame).
    """
    cands = [c for c in cands if c[0] and c[1] and c[2]]
    if not cands:
        return []
    target = _ratio(orig_w, orig_h) or _ratio(*max(cands, key=lambda c: c[0] * c[1])[:2])
    keep = [c for c in cands if abs(c[0] / c[1] - target) <= 0.02 * target]
    return keep or cands


def _best_and_thumb(cands: list[tuple[int, int, str]]) -> tuple[tuple | None, str | None]:
    if not cands:
        return None, None
    ordered = sorted(cands, key=lambda c: c[0] * c[1])
    best = ordered[-1]
    thumb = next((c for c in ordered if short_side(c[0], c[1]) >= 320), best)
    return best, thumb[2]


def _audio_and_dash_variants(manifest: str | None) -> tuple[str | None, list[Variant]]:
    audio = dash.audio_url(manifest)
    if not audio:
        return None, []
    return audio, [Variant(u, w, h, has_audio=False) for (w, h, _bw, u) in dash.h264_videos(manifest)]


_RUNG_RE = re.compile(r"[._](\d{3,4})[._]")


def rendition_dims(url: str, width, height) -> tuple:
    """The size of the rendition at url, from Meta's efg tag, else the post's (width, height).

    Progressive URLs carry efg=base64({"vencode_tag": "xpv_progressive.INSTAGRAM.CLIPS.C3.720...."}),
    where the number is the encode's short side. The embed page serves a 640 or 720 encode
    of a 1080x1920 reel while its "dimensions" are the original's.
    """
    try:
        efg = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("efg", [""])[0]
        tag = json.loads(base64.urlsafe_b64decode(efg + "=" * (-len(efg) % 4))).get("vencode_tag") or ""
    except (ValueError, TypeError, AttributeError):
        return width, height
    m = _RUNG_RE.search(tag)
    s = short_side(width, height)
    if not (m and s and width and height):
        return width, height
    rung = int(m.group(1))
    if 144 <= rung < s:
        scale = rung / s
        return round(width * scale), round(height * scale)
    return width, height


def _video_item(index, versions: list[Variant], manifest, thumb, width, height, duration,
                has_audio, can_mux) -> Item:
    audio, dash_variants = _audio_and_dash_variants(manifest)
    variants = list(versions)
    if has_audio:
        variants += dash_variants
    seen, uniq = set(), []
    for v in variants:
        if v.url not in seen:
            seen.add(v.url)
            uniq.append(v)
    mux_ok = can_mux and bool(audio)
    usable = [v for v in uniq if v.short and (mux_ok or v.has_audio)]
    if usable:  # describe the best rendition we can actually save, matching qualities[0]
        top = max(usable, key=lambda v: v.short)
        width, height = top.width, top.height
    return Item(index=index, type="video", thumbnail=thumb, width=width, height=height,
                duration=duration, has_audio=has_audio, variants=uniq,
                qualities=video_qualities(uniq, mux_ok), audio_url=audio if has_audio else None)


# ---- api shape -------------------------------------------------------------------------

def _api_node_item(node: dict, index: int, can_mux: bool) -> Item | None:
    orig_w, orig_h = node.get("original_width"), node.get("original_height")
    cands = [(c.get("width") or 0, c.get("height") or 0, c.get("url"))
             for c in (node.get("image_versions2") or {}).get("candidates") or []]
    if cands and not any(w and h for w, h, _ in cands):
        # Instagram's logged-out GraphQL omits candidate sizes; the first is the full-size original.
        cands = [(orig_w or 0, orig_h or 0, cands[0][2])]
    full = _full_frame(cands, orig_w, orig_h)
    best, thumb = _best_and_thumb(full)
    versions = node.get("video_versions") or []
    if versions or node.get("media_type") == MEDIA_VIDEO:
        if not versions:
            return None
        variants = []
        for v in versions:
            if not v.get("url"):
                continue
            # video_versions often omit dimensions; the encode's efg tag says which rung it is.
            w, h = (v["width"], v["height"]) if v.get("width") and v.get("height") \
                else rendition_dims(v["url"], orig_w, orig_h)
            variants.append(Variant(v["url"], w, h))
        has_audio = node.get("has_audio") is not False
        return _video_item(index, variants, node.get("video_dash_manifest"), thumb,
                           orig_w or (best and best[0]), orig_h or (best and best[1]),
                           node.get("video_duration"), has_audio, can_mux)
    if not best:
        return None
    return Item(index=index, type="image", thumbnail=thumb, width=best[0], height=best[1],
                variants=[Variant(best[2], best[0], best[1], has_audio=False, ext="jpg")])


def sound_from_api(media: dict, index: int) -> Item | None:
    """The song or original sound a photo post plays, as a standalone audio item.

    Meta puts it on the parent media (never on carousel children) as music_metadata: licensed
    songs under music_info.music_asset_info, a creator's own recording under
    original_sound_info. Region-muted tracks carry no URL and get no item. Instagram's logged-out
    answers (GraphQL, post page, embed) leave music_metadata out entirely, checked October 2026
    on a carousel with a song, so in practice this only fires for payloads that do carry it.
    """
    mm = media.get("music_metadata") or {}
    licensed = (mm.get("music_info") or {}).get("music_asset_info") or {}
    original = mm.get("original_sound_info") or {}
    muted = (((mm.get("music_info") or {}).get("music_consumption_info") or {}).get("should_mute_audio")
             or original.get("should_mute_audio"))
    src = licensed if licensed.get("progressive_download_url") or licensed.get(
        "fast_start_progressive_download_url") or licensed.get("web_30s_preview_download_url") else original
    full = src.get("progressive_download_url") or src.get("fast_start_progressive_download_url")
    url = full or src.get("web_30s_preview_download_url")
    if muted or not url:
        return None
    if src is licensed:
        title = " · ".join(t for t in (licensed.get("title"), licensed.get("display_artist")) if t)
        cover = licensed.get("cover_artwork_uri") or licensed.get("cover_artwork_thumbnail_uri")
    else:
        title = " · ".join(t for t in (original.get("original_audio_title"),
                                       (original.get("ig_artist") or {}).get("username")) if t)
        cover = None
    if not full:
        title = f"{title or 'Song'} (30-second preview)"
    ms = src.get("duration_in_ms")
    ext = "mp3" if urllib.parse.urlsplit(url).path.lower().endswith(".mp3") else "m4a"
    return Item(index=index, type="audio", thumbnail=cover, duration=ms / 1000 if ms else None,
                has_audio=True, title=title or None, variants=[Variant(url, has_audio=True, ext=ext)])


def items_from_api(media: dict, can_mux: bool) -> list[Item]:
    if media.get("media_type") == MEDIA_TEXT:
        raise ApiError("unavailable", "This is a text-only post; there's no photo or video to save.")
    nodes = media.get("carousel_media") or [media]
    items = []
    for node in nodes:
        item = _api_node_item(node, len(items), can_mux)
        if item:
            items.append(item)
    if not items:
        raise ApiError("unavailable", "This post has no photo or video to save.")
    # A video's sound is already inside it; only photo posts get the soundtrack as its own item.
    if any(i.type == "image" for i in items):
        sound = sound_from_api(media, len(items))
        if sound:
            items.append(sound)
    return items


def meta_from_api(media: dict) -> dict:
    return {
        "id": media.get("code") or str(media.get("pk") or ""),
        "title": ((media.get("caption") or {}).get("text") or None),
        "author": (media.get("user") or {}).get("username"),
    }


# ---- graph shape -----------------------------------------------------------------------

def _graph_node_item(node: dict, index: int, can_mux: bool) -> Item | None:
    dims = node.get("dimensions") or {}
    w, h = dims.get("width"), dims.get("height")
    cands = [(r.get("config_width") or 0, r.get("config_height") or 0, r.get("src"))
             for r in node.get("display_resources") or []]
    if not cands and node.get("display_url"):
        cands = [(w or 0, h or 0, node["display_url"])]
    full = _full_frame(cands, w, h)
    best, thumb = _best_and_thumb(full)
    thumb = thumb or node.get("display_url")
    if node.get("is_video"):
        if not node.get("video_url"):
            return Item(index=index, type="video", thumbnail=thumb, width=w, height=h,
                        duration=node.get("video_duration"), has_audio=True)  # incomplete
        has_audio = node.get("has_audio") is not False
        manifest = (node.get("dash_info") or {}).get("video_dash_manifest")
        vw, vh = rendition_dims(node["video_url"], w, h)
        return _video_item(index, [Variant(node["video_url"], vw, vh)], manifest, thumb, w, h,
                           node.get("video_duration"), has_audio, can_mux)
    if not best:
        return None
    return Item(index=index, type="image", thumbnail=thumb, width=best[0] or w, height=best[1] or h,
                variants=[Variant(best[2], best[0] or w, best[1] or h, has_audio=False, ext="jpg")])


def items_from_graph(media: dict, can_mux: bool) -> list[Item]:
    edges = ((media.get("edge_sidecar_to_children") or {}).get("edges")) or []
    nodes = [e.get("node") or {} for e in edges] or [media]
    items = []
    for node in nodes:
        item = _graph_node_item(node, len(items), can_mux)
        if item:
            items.append(item)
    if not items:
        raise ApiError("unavailable", "This post has no photo or video to save.")
    return items


def meta_from_graph(media: dict) -> dict:
    edges = ((media.get("edge_media_to_caption") or {}).get("edges")) or []
    caption = ((edges[0].get("node") or {}).get("text") if edges else None) or None
    return {"id": media.get("shortcode") or str(media.get("id") or ""), "title": caption,
            "author": (media.get("owner") or {}).get("username")}


def is_complete(items: list[Item]) -> bool:
    """Every item can be downloaded (directly, or through yt-dlp's entry)."""
    return all(i.variants or i.source == "ytdlp" for i in items)


# ---- page helpers ----------------------------------------------------------------------

_JSON_SCRIPT = re.compile(r'<script type="application/json"[^>]*>(.*?)</script>', re.S)


def find_api_media(html_text: str, code: str) -> dict | None:
    """Find the media dict with this post code inside a page's embedded JSON blobs.

    Post pages also embed replies and related posts; matching the code picks the right one.
    """
    def walk(obj):
        if isinstance(obj, dict):
            if obj.get("code") == code and "media_type" in obj:
                return obj
            for v in obj.values():
                found = walk(v)
                if found is not None:
                    return found
        elif isinstance(obj, list):
            for v in obj:
                found = walk(v)
                if found is not None:
                    return found
        return None

    for blob in _JSON_SCRIPT.findall(html_text):
        if code not in blob:
            continue
        try:
            found = walk(json.loads(blob))
        except ValueError:
            continue
        if found is not None:
            return found
    return None


_OG = re.compile(r'<meta\s+[^>]*?property="og:([a-z:_]+)"[^>]*?content="([^"]*)"', re.I)
_OG_REV = re.compile(r'<meta\s+[^>]*?content="([^"]*)"[^>]*?property="og:([a-z:_]+)"', re.I)


def og_tags(html_text: str) -> dict:
    import html as html_mod

    tags: dict[str, str] = {}
    for k, v in _OG.findall(html_text):
        tags.setdefault(k.lower(), html_mod.unescape(v))
    for v, k in _OG_REV.findall(html_text):
        tags.setdefault(k.lower(), html_mod.unescape(v))
    return tags
