import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { extractAudio, muxVideoAudio, transcodeVideo } from '../../modules/foxy-audio-extractor';
import { MediaItem } from '../extraction/types';
import { getPreferences, resolutionForPlatform } from './preferences';
import { DownloadPlan, planVideoDownload } from './resolutionPlan';

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

function cacheUri(item: MediaItem, suffix: string): string {
  const safeId = item.id.replace(/[^A-Za-z0-9_-]/g, '');
  return `${FileSystem.cacheDirectory}foxy_${safeId}_${Date.now()}_${suffix}`;
}

/**
 * Downloads `url` to `fileUri`, reporting fraction 0→1 through `onProgress`.
 * Throws a friendly DownloadError on network failure or a non-2xx status.
 */
async function downloadFile(
  url: string,
  fileUri: string,
  onProgress: (fraction: number) => void
): Promise<FileSystem.FileSystemDownloadResult> {
  const download = FileSystem.createDownloadResumable(url, fileUri, {}, (progress) => {
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

  return result;
}

/**
 * Downloads a media item to the app cache, saves it into the device gallery,
 * then removes the cached copy.
 *
 * For videos the user's per-platform resolution preference decides *how*: the
 * chosen rendition is downloaded directly, an HD (adaptive) rendition is muxed
 * from separate video+audio streams, or — when the source has nothing at or
 * below the target — the smallest rendition is downscaled on-device.
 */
export async function downloadToGallery(
  item: MediaItem,
  onProgress: (fraction: number) => void
): Promise<void> {
  await ensureMediaPermission();

  if (item.type !== 'video') {
    await downloadDirect(item, item.url, guessExtension(item), onProgress);
    return;
  }

  const pref = resolutionForPlatform(getPreferences(), item.platform ?? 'instagram');
  const plan = planVideoDownload(item, pref);

  switch (plan.kind) {
    case 'direct':
      await downloadDirect(item, plan.videoUrl, 'mp4', onProgress);
      return;
    case 'mux':
      await downloadMuxed(item, plan, onProgress);
      return;
    case 'transcode':
      await downloadTranscoded(item, plan, onProgress);
      return;
  }
}

/** Single-URL path: download → save to album → clean up. */
async function downloadDirect(
  item: MediaItem,
  url: string,
  extension: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  const result = await downloadFile(url, cacheUri(item, `dl.${extension}`), onProgress);

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
 * HD path: download the video-only and audio-only streams, mux them into one MP4
 * on-device (no re-encode), then save. Progress: video 0→0.55, audio 0.55→0.8,
 * mux 0.8→0.9, save 0.9→1.0.
 */
async function downloadMuxed(
  item: MediaItem,
  plan: DownloadPlan,
  onProgress: (fraction: number) => void
): Promise<void> {
  const videoUri = cacheUri(item, 'v.mp4');
  const audioUri = cacheUri(item, 'a.m4a');
  const outUri = cacheUri(item, 'hd.mp4');

  try {
    if (!plan.audioUrl) {
      throw new DownloadError(
        'mux plan missing audio url',
        'Could not download this video in HD. Try a lower resolution in Settings.'
      );
    }

    const videoResult = await downloadFile(plan.videoUrl, videoUri, (f) => onProgress(0.55 * f));
    onProgress(0.55);
    const audioResult = await downloadFile(plan.audioUrl, audioUri, (f) =>
      onProgress(0.55 + 0.25 * f)
    );
    onProgress(0.8);

    try {
      await muxVideoAudio(videoResult.uri, audioResult.uri, outUri);
    } catch (error) {
      throw new DownloadError(
        `mux failed: ${String(error)}`,
        'Could not combine the HD video and audio streams. Try a lower resolution in Settings.'
      );
    }
    onProgress(0.9);

    try {
      await saveToFoxyAlbum(outUri);
    } catch (error) {
      throw new DownloadError(
        `save to gallery failed: ${String(error)}`,
        'Downloaded, but saving to your gallery failed. Check storage permissions.'
      );
    }
    onProgress(1);
  } finally {
    await Promise.all([
      FileSystem.deleteAsync(videoUri, { idempotent: true }).catch(() => undefined),
      FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => undefined),
      FileSystem.deleteAsync(outUri, { idempotent: true }).catch(() => undefined),
    ]);
  }
}

/**
 * Compression path: download the smallest available rendition, downscale it to
 * the target height on-device, then save. Progress: download 0→0.6, transcode
 * 0.6→0.9, save 0.9→1.0.
 *
 * On-device transcoding isn't available on every platform yet; if it fails we
 * fall back to saving the downloaded rendition as-is so the download still
 * succeeds (just without the extra size reduction).
 */
async function downloadTranscoded(
  item: MediaItem,
  plan: DownloadPlan,
  onProgress: (fraction: number) => void
): Promise<void> {
  const srcUri = cacheUri(item, 'src.mp4');
  const outUri = cacheUri(item, 'small.mp4');

  try {
    const srcResult = await downloadFile(plan.videoUrl, srcUri, (f) => onProgress(0.6 * f));
    onProgress(0.6);

    let fileToSave = srcResult.uri;
    if (plan.targetHeight) {
      try {
        await transcodeVideo(srcResult.uri, outUri, { targetHeight: plan.targetHeight });
        fileToSave = outUri;
      } catch {
        // Transcoding unavailable/failed on this platform — save the source
        // rendition rather than failing the whole download.
        fileToSave = srcResult.uri;
      }
    }
    onProgress(0.9);

    try {
      await saveToFoxyAlbum(fileToSave);
    } catch (error) {
      throw new DownloadError(
        `save to gallery failed: ${String(error)}`,
        'Downloaded, but saving to your gallery failed. Check storage permissions.'
      );
    }
    onProgress(1);
  } finally {
    await Promise.all([
      FileSystem.deleteAsync(srcUri, { idempotent: true }).catch(() => undefined),
      FileSystem.deleteAsync(outUri, { idempotent: true }).catch(() => undefined),
    ]);
  }
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
