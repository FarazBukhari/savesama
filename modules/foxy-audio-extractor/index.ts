import { requireNativeModule } from 'expo-modules-core';

type FoxyAudioExtractorModule = {
  /**
   * Remuxes the first audio track of the video at `srcPath` into `destPath`
   * (an `.m4a`), copying the encoded audio without re-encoding. Resolves when
   * the file has been written; rejects on failure (e.g. no audio track).
   */
  extractAudio(srcPath: string, destPath: string): Promise<void>;
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
