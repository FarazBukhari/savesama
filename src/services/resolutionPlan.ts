import { MediaFormat, MediaItem } from '../extraction/types';
import { ResolutionPref, resolutionTargetHeight } from './preferences';

/**
 * The concrete download strategy for a video item given the user's resolution
 * preference:
 *  - `direct`    — the chosen stream is muxed (audio+video); download it as-is.
 *  - `mux`       — the chosen stream is video-only (YouTube 1080p+); download it
 *                  plus `audioUrl` and combine them on-device.
 *  - `transcode` — no stream is at-or-below the target; download the smallest
 *                  muxed stream and downscale it to `targetHeight` so the saved
 *                  file is smaller.
 */
export interface DownloadPlan {
  kind: 'direct' | 'mux' | 'transcode';
  videoUrl: string;
  audioUrl?: string | null;
  targetHeight?: number;
}

/** Normalises an item into a candidate format list (falling back to its single url). */
function candidates(item: MediaItem): MediaFormat[] {
  if (item.formats && item.formats.length > 0) return item.formats;
  return [
    {
      url: item.url,
      width: item.width,
      height: item.height,
      bitrate: null,
      hasAudio: true,
    },
  ];
}

/**
 * The format's resolution in the conventional "1080p/720p" sense: the SHORTER
 * dimension. Portrait videos (Instagram reels, YouTube Shorts) store the long
 * side in `height` (e.g. 1080x1920 for a 1080p reel), so comparing raw height
 * against a target would wrongly reject the correct rendition. When width is
 * unknown, height is the best available guess (landscape assumption).
 */
function effectiveResolution(format: MediaFormat): number | null {
  if (format.height == null) return null;
  if (format.width != null && format.width < format.height) return format.width;
  return format.height;
}

/**
 * Higher resolution wins; formats with unknown dimensions sort first, trusting
 * the source's own ordering (Instagram lists `video_versions` highest-first, and
 * the single-URL fallback is the source's primary stream). At the same
 * resolution prefer a muxed (has-audio) stream so we can download it directly
 * instead of muxing, then higher bitrate.
 */
function byQualityDesc(a: MediaFormat, b: MediaFormat): number {
  const ra = effectiveResolution(a) ?? Number.POSITIVE_INFINITY;
  const rb = effectiveResolution(b) ?? Number.POSITIVE_INFINITY;
  if (rb !== ra) return rb - ra;
  if (a.hasAudio !== b.hasAudio) return a.hasAudio ? -1 : 1;
  return (b.bitrate ?? 0) - (a.bitrate ?? 0);
}

function planFor(format: MediaFormat): DownloadPlan {
  if (format.hasAudio) {
    return { kind: 'direct', videoUrl: format.url };
  }
  return { kind: 'mux', videoUrl: format.url, audioUrl: format.audioUrl ?? null };
}

/**
 * Chooses how to download `item` to satisfy `pref`.
 *
 * Algorithm (all comparisons use the conventional short-side resolution):
 *  - `max`: pick the highest-quality stream. Mux if it's video-only.
 *  - a capped target: pick the largest stream at or below the target (mux if
 *    video-only). If none qualifies — every stream is bigger, or dimensions are
 *    unknown — download the smallest MUXED stream and flag a transcode down to
 *    the target, guaranteeing the output is smaller than the source. The
 *    transcode source must carry audio: a video-only stream would save a silent
 *    video, since the transcode path performs no muxing.
 *
 * Never upscales: a target above everything available just yields the best
 * `direct`/`mux` stream.
 */
export function planVideoDownload(item: MediaItem, pref: ResolutionPref): DownloadPlan {
  const formats = candidates(item).slice().sort(byQualityDesc);
  const best = formats[0];
  const target = resolutionTargetHeight(pref);

  if (target === null) {
    return planFor(best);
  }

  // Largest stream at or below the target (dimensions must be known to qualify).
  const atOrBelow = formats.filter((f) => {
    const resolution = effectiveResolution(f);
    return resolution != null && resolution <= target;
  });
  if (atOrBelow.length > 0) {
    return planFor(atOrBelow[0]);
  }

  // Nothing qualifies: every stream is above the target, or dimensions are
  // unknown. Transcode the smallest muxed stream down to the target (unknown
  // dimensions transcode too, so the result is still smaller than the source —
  // the native side skips the re-encode when the file turns out to already fit).
  const muxed = formats.filter((f) => f.hasAudio);
  const pool = muxed.length > 0 ? muxed : formats;
  const withResolution = pool.filter((f) => effectiveResolution(f) != null);
  const source = withResolution.length > 0 ? withResolution[withResolution.length - 1] : pool[0];
  return { kind: 'transcode', videoUrl: source.url, targetHeight: target };
}
