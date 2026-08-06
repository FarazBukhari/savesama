import { requireNativeModule } from 'expo-modules-core';

export interface TranscodeVideoOptions {
  /**
   * Target SHORT-side resolution in pixels, preserving aspect ratio: 480 means
   * the shorter dimension ends up near 480 whatever the orientation. Named
   * `targetHeight` for the conventional "480p" reading, not because the height
   * specifically is scaled — portrait video would be over-shrunk by the aspect
   * ratio if it were. Both native implementations read it this way.
   */
  targetHeight: number;
}

type SaveSamaAudioExtractorModule = {
  /**
   * Remuxes the first audio track of the video at `srcPath` into `destPath`
   * (an `.m4a`), copying the encoded audio without re-encoding. Resolves when
   * the file has been written; rejects on failure (e.g. no audio track).
   */
  extractAudio(srcPath: string, destPath: string): Promise<void>;
  /**
   * Combines a video-only stream and an audio-only stream into a single MP4 at
   * `outPath` without re-encoding (passthrough remux of both tracks). Inputs
   * must be MP4-container-compatible codecs (H.264 video + AAC audio).
   */
  muxVideoAudio(videoPath: string, audioPath: string, outPath: string): Promise<void>;
  /**
   * Decodes, downscales, and re-encodes the video at `srcPath` into a smaller
   * MP4 at `outPath` per `options`. Slower and CPU-heavy (a full transcode).
   */
  transcodeVideo(
    srcPath: string,
    outPath: string,
    options: TranscodeVideoOptions
  ): Promise<void>;
  /** Whether `transcodeVideo` is implemented on this platform. */
  isTranscodeSupported(): boolean;
};

const SaveSamaAudioExtractor = requireNativeModule<SaveSamaAudioExtractorModule>('SaveSamaAudioExtractor');

/**
 * Extracts the audio track from a local video file into an `.m4a` at `destPath`.
 *
 * Implemented with the OS-native muxers (Android `MediaExtractor`/`MediaMuxer`,
 * iOS `AVAssetExportSession` passthrough) so there is no third-party FFmpeg
 * binary and the audio stream is copied without re-encoding. Both paths may be
 * `file://` URIs or bare filesystem paths.
 */
export async function extractAudio(srcPath: string, destPath: string): Promise<void> {
  await SaveSamaAudioExtractor.extractAudio(srcPath, destPath);
}

/**
 * Combines a separate video-only and audio-only file into a single MP4 at
 * `destPath` without re-encoding, using OS-native muxers (Android `MediaMuxer`
 * with both tracks, iOS `AVMutableComposition` + passthrough export). Used for
 * YouTube 1080p+, which is only served as split adaptive streams. Inputs must be
 * H.264 video + AAC audio so they passthrough into an MP4 container.
 */
export async function muxVideoAudio(
  videoPath: string,
  audioPath: string,
  destPath: string
): Promise<void> {
  await SaveSamaAudioExtractor.muxVideoAudio(videoPath, audioPath, destPath);
}

/**
 * Downscales/compresses the video at `srcPath` to a smaller MP4 at `destPath`.
 * Unlike the remux paths this performs a real decode + scale + re-encode, so it
 * is comparatively slow and CPU/battery heavy. Used only when the source offers
 * no rendition at or below the user's chosen resolution — which for Instagram and
 * Threads is *always*, since their `video_versions` ladder is a fake (the entries
 * are the same resolution, differing only in `type`).
 *
 * `targetHeight` is the conventional SHORT-side resolution: "480p" means the
 * shorter dimension ends up near 480 whatever the orientation. Both native
 * implementations and `resolutionPlan.ts` agree on that reading; a source already
 * at or below the target is copied through without re-encoding.
 */
export async function transcodeVideo(
  srcPath: string,
  destPath: string,
  options: TranscodeVideoOptions
): Promise<void> {
  await SaveSamaAudioExtractor.transcodeVideo(srcPath, destPath, options);
}

/**
 * Whether on-device downscaling is available (both platforms: iOS via
 * AVAssetExportSession, Android via Media3 Transformer). Lets the download layer
 * skip a doomed native call and the UI describe capped presets honestly. A device
 * whose codecs can't handle a given clip still rejects at call time with
 * ERR_TRANSCODE_UNSUPPORTED, which the download layer degrades on.
 */
export function isTranscodeSupported(): boolean {
  try {
    return SaveSamaAudioExtractor.isTranscodeSupported();
  } catch {
    return false;
  }
}
