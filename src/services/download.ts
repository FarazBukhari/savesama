import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

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
    await MediaLibrary.saveToLibraryAsync(result.uri);
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
