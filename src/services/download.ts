import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

import { MediaItem } from '../extraction/types';

export class DownloadError extends Error {
  /** Friendly message safe to show in the UI. */
  readonly userMessage: string;

  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'DownloadError';
    this.userMessage = userMessage;
  }
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'] as const;

function guessExtension(item: MediaItem): string {
  if (item.type === 'video') return 'mp4';
  const path = item.url.split('?')[0].toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (path.endsWith(`.${ext}`)) return ext;
  }
  return 'jpg';
}

async function ensureMediaPermission(): Promise<void> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return;
  const requested = await MediaLibrary.requestPermissionsAsync();
  if (!requested.granted) {
    throw new DownloadError(
      'media library permission denied',
      'Foxy needs permission to save media. Enable Photos and videos access in Settings.'
    );
  }
}

/**
 * Downloads a media item to the app cache, saves it into the device gallery,
 * then removes the cached copy.
 */
export async function downloadToGallery(
  item: MediaItem,
  onProgress: (fraction: number) => void
): Promise<void> {
  await ensureMediaPermission();

  const extension = guessExtension(item);
  const safeId = item.id.replace(/[^A-Za-z0-9_-]/g, '');
  const fileUri = `${FileSystem.cacheDirectory}foxy_${safeId}_${Date.now()}.${extension}`;

  const download = FileSystem.createDownloadResumable(item.url, fileUri, {}, (progress) => {
    if (progress.totalBytesExpectedToWrite > 0) {
      onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
    }
  });

  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await download.downloadAsync();
  } catch (error) {
    throw new DownloadError(
      `download failed: ${String(error)}`,
      'Download failed. Check your connection and try again.'
    );
  }

  if (!result || result.status < 200 || result.status >= 300) {
    throw new DownloadError(
      `download returned status ${result ? result.status : 'unknown'}`,
      'The media link has expired. Fetch the post again and retry.'
    );
  }

  try {
    // SDK 56 removed the legacy `saveToLibraryAsync` from the main entrypoint
    // (it now throws at runtime). Use the new class-based API instead.
    await MediaLibrary.Asset.create(result.uri);
  } catch (error) {
    throw new DownloadError(
      `save to gallery failed: ${String(error)}`,
      'Downloaded, but saving to your gallery failed. Check storage permissions.'
    );
  } finally {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
  }

  onProgress(1);
}

/**
 * Downloads a video item, extracts the audio track with FFmpeg (no re-encode),
 * saves the resulting M4A to the device library, then removes all cache files.
 */
export async function downloadAudioToGallery(
  item: MediaItem,
  onProgress: (fraction: number) => void
): Promise<void> {
  await ensureMediaPermission();

  const safeId = item.id.replace(/[^A-Za-z0-9_-]/g, '');
  const ts = Date.now();
  const videoUri = `${FileSystem.cacheDirectory}foxy_${safeId}_${ts}_src.mp4`;
  const audioUri = `${FileSystem.cacheDirectory}foxy_${safeId}_${ts}.m4a`;

  // Phase 1: download video to cache (0 → 70%)
  const download = FileSystem.createDownloadResumable(item.url, videoUri, {}, (progress) => {
    if (progress.totalBytesExpectedToWrite > 0) {
      onProgress(0.7 * (progress.totalBytesWritten / progress.totalBytesExpectedToWrite));
    }
  });

  let videoResult: FileSystem.FileSystemDownloadResult | undefined;
  try {
    videoResult = await download.downloadAsync();
  } catch (error) {
    throw new DownloadError(
      `download failed: ${String(error)}`,
      'Download failed. Check your connection and try again.'
    );
  }

  if (!videoResult || videoResult.status < 200 || videoResult.status >= 300) {
    throw new DownloadError(
      `download returned status ${videoResult ? videoResult.status : 'unknown'}`,
      'The media link has expired. Fetch the post again and retry.'
    );
  }

  onProgress(0.7);

  // Phase 2: strip video track with FFmpeg, copy audio codec (70 → 90%)
  try {
    const session = await FFmpegKit.execute(
      `-i "${videoResult.uri}" -vn -acodec copy -y "${audioUri}"`
    );
    const returnCode = await session.getReturnCode();
    if (!ReturnCode.isSuccess(returnCode)) {
      throw new DownloadError(
        `ffmpeg exited with code ${String(returnCode)}`,
        'Could not extract audio from the video.'
      );
    }
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(
      `ffmpeg error: ${String(error)}`,
      'Could not extract audio from the video.'
    );
  } finally {
    await FileSystem.deleteAsync(videoUri, { idempotent: true }).catch(() => undefined);
  }

  onProgress(0.9);

  // Phase 3: save M4A to media library (90 → 100%)
  try {
    await MediaLibrary.Asset.create(audioUri);
  } catch (error) {
    throw new DownloadError(
      `gallery save failed: ${String(error)}`,
      'Extracted audio, but saving to your library failed. Check storage permissions.'
    );
  } finally {
    await FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => undefined);
  }

  onProgress(1);
}
