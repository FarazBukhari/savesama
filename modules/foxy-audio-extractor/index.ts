import { requireNativeModule } from 'expo-modules-core';

export interface TranscodeVideoOptions {
  /** Scale the video to this pixel height, preserving aspect ratio. */
  targetHeight: number;
  /** Video bitrate in bits/s. Omitted → derived from `targetHeight`. */
  videoBitrate?: number;
  /** Audio bitrate in bits/s. Defaults to 128000. */
  audioBitrate?: number;
}

type FoxyAudioExtractorModule = {
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
};

const FoxyAudioExtractor = requireNativeModule<FoxyAudioExtractorModule>('FoxyAudioExtractor');

/**
 * Extracts the audio track from a local video file into an `.m4a` at `destPath`.
 *
 * Implemented with the OS-native muxers (Android `MediaExtractor`/`MediaMuxer`,
 * iOS `AVAssetExportSession` passthrough) so there is no third-party FFmpeg
 * binary and the audio stream is copied without re-encoding. Both paths may be
 * `file://` URIs or bare filesystem paths.
 */
export async function extractAudio(srcPath: string, destPath: string): Promise<void> {
  await FoxyAudioExtractor.extractAudio(srcPath, destPath);
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
  await FoxyAudioExtractor.muxVideoAudio(videoPath, audioPath, destPath);
}

/**
 * Downscales/compresses the video at `srcPath` to a smaller MP4 at `destPath`.
 * Unlike the remux paths this performs a real decode + scale + re-encode, so it
 * is comparatively slow and CPU/battery heavy. Used only when the source offers
 * no rendition at or below the user's chosen resolution.
 */
export async function transcodeVideo(
  srcPath: string,
  destPath: string,
  options: TranscodeVideoOptions
): Promise<void> {
  await FoxyAudioExtractor.transcodeVideo(srcPath, destPath, options);
}
