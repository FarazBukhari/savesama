import { MediaFormat, MediaItem } from '../extraction/types';
import { ResolutionPref, resolutionTargetHeight } from './preferences';

/**
 * The concrete download strategy for a video item given the user's resolution
 * preference:
 *  - `direct`    — the chosen stream is muxed (audio+video); download it as-is.
 *  - `mux`       — the chosen stream is video-only (YouTube 1080p+); download it
 *                  plus `audioUrl` and combine them on-device.
 *  - `transcode` — no stream is at-or-below the target; download the smallest and
 *                  downscale it to `targetHeight` so the saved file is smaller.
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
 * Higher resolution wins. At the same resolution prefer a muxed (has-audio)
 * stream so we can download it directly instead of muxing, then higher bitrate.
 */
function byQualityDesc(a: MediaFormat, b: MediaFormat): number {
  const heightDiff = (b.height ?? 0) - (a.height ?? 0);
  if (heightDiff !== 0) return heightDiff;
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
 * Algorithm:
 *  - `max`: pick the highest-quality stream. Mux if it's video-only.
 *  - a capped target: pick the largest stream whose height is ≤ target (mux if
 *    video-only). If none qualifies — every stream is bigger, or heights are
 *    unknown — download the smallest available stream and flag a transcode down
 *    to the target, guaranteeing the output is smaller than the source.
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

  // Largest stream at or below the target (heights must be known to qualify).
  const atOrBelow = formats.filter((f) => f.height != null && f.height <= target);
  if (atOrBelow.length > 0) {
    return planFor(atOrBelow[0]);
  }

  // Nothing qualifies. If we know heights, the smallest is still bigger than the
  // target → downscale it. If heights are unknown, transcode the single/best
  // stream to the target so the result is still smaller than the source.
  const withHeights = formats.filter((f) => f.height != null);
  const source = withHeights.length > 0 ? withHeights[withHeights.length - 1] : best;
  return { kind: 'transcode', videoUrl: source.url, targetHeight: target };
}
