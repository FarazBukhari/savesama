import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { extractAudio } from '../../modules/foxy-audio-extractor';
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

/** Dedicated album for everything Foxy saves, so downloads don't land in Camera. */
export const ALBUM_NAME = 'Foxy Downloader';

/**
 * Saves a local file into the app's dedicated album instead of the default
 * Camera folder.
 *
 * On Android the album lives under a media-type-specific root (photos and
 * videos under `Pictures/`, audio under `Music/`), and MediaStore refuses to
 * place a file outside the root allowed for its type. A single shared album
 * therefore can't hold every media type: adding audio to the photo/video
 * album throws. To handle that, we add to the existing album when the type
 * fits, and otherwise spin up the correctly-rooted Foxy folder for that type
 * (`Album.create` derives the root from the asset's own media type).
 */
async function saveToFoxyAlbum(uri: string): Promise<void> {
  const existing = await MediaLibrary.Album.get(ALBUM_NAME);
  if (existing) {
    try {
      // Reuse the album when this media type is allowed in its root. Reusing
      // also avoids creating duplicate same-named albums on iOS.
      await MediaLibrary.Asset.create(uri, existing);
      return;
    } catch {
      // The existing album can't hold this media type (e.g. audio can't live
      // in a Pictures-rooted album on Android) — fall through and give it its
      // own correctly-rooted Foxy folder below.
    }
  }

  // Save the asset first so the download is never lost, then group it into a
  // Foxy folder rooted for its media type. Grouping is best-effort: if it
  // fails the asset still remains saved in the library.
  const asset = await MediaLibrary.Asset.create(uri);
  try {
    await MediaLibrary.Album.create(ALBUM_NAME, [asset]);
  } catch {
    // Saved to the library but couldn't be grouped into the album — acceptable.
  }
}

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
    // (it now throws at runtime). Use the new class-based API instead, routing
    // the asset into Foxy's own album rather than the default Camera folder.
    await saveToFoxyAlbum(result.uri);
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
 * Downloads a video item, extracts the audio track on-device (no re-encode),
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

  // Phase 2: remux the audio track into an .m4a (no re-encode) (70 → 90%)
  try {
    await extractAudio(videoResult.uri, audioUri);
  } catch (error) {
    throw new DownloadError(
      `audio extraction failed: ${String(error)}`,
      'Could not extract audio from the video.'
    );
  } finally {
    await FileSystem.deleteAsync(videoUri, { idempotent: true }).catch(() => undefined);
  }

  onProgress(0.9);

  // Phase 3: save M4A to media library (90 → 100%)
  try {
    await saveToFoxyAlbum(audioUri);
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
