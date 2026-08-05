import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import {
  extractAudio,
  isTranscodeSupported,
  muxVideoAudio,
  transcodeVideo,
} from '../../modules/foxy-audio-extractor';
import { MediaItem } from '../extraction/types';
import { ResolutionPref, loadPreferences, resolutionForPlatform } from './preferences';
import {
  fileSystemDeps,
  probeRangedDownload,
  runRangedDownload,
  shouldSplit,
} from './rangedDownload';
import { DownloadPlan, pickImageUrl, planVideoDownload } from './resolutionPlan';

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

function guessExtension(item: MediaItem, url: string = item.url): string {
  if (item.type === 'video') return 'mp4';
  const path = url.split('?')[0].toLowerCase();
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

async function deleteQuietly(fileUri: string): Promise<void> {
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
}

/**
 * Downloads `url` to `fileUri`, reporting fraction 0→1 through `onProgress`.
 * Throws a friendly DownloadError on network failure or a non-2xx status,
 * deleting any partial file first so failed downloads never leak cache space.
 */
async function downloadFile(
  url: string,
  fileUri: string,
  onProgress: (fraction: number) => void
): Promise<FileSystem.FileSystemDownloadResult> {
  // Large files split across parallel range requests — one connection to
  // googlevideo/fbcdn is often slower than the link allows. Small files, servers
  // that won't report a size, and servers without range support fall through to
  // the single-connection path below.
  const probe = await probeRangedDownload(url);
  if (shouldSplit(probe) && probe.totalBytes !== null) {
    try {
      await runRangedDownload(url, fileUri, probe.totalBytes, onProgress, fileSystemDeps);
      return { uri: fileUri, status: 200, headers: {}, mimeType: null } as FileSystem.FileSystemDownloadResult;
    } catch {
      // Any range/concat problem: start over on one connection rather than fail.
      // runRangedDownload has already removed its parts and partial output.
      onProgress(0);
    }
  }

  const download = FileSystem.createDownloadResumable(url, fileUri, {}, (progress) => {
    if (progress.totalBytesExpectedToWrite > 0) {
      onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
    }
  });

  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await download.downloadAsync();
  } catch (error) {
    await deleteQuietly(fileUri);
    throw new DownloadError(
      `download failed: ${String(error)}`,
      'Download failed. Check your connection and try again.'
    );
  }

  if (!result || result.status < 200 || result.status >= 300) {
    await deleteQuietly(fileUri);
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
 * For videos the resolution decides *how*: the chosen rendition is downloaded
 * directly, an HD (adaptive) rendition is muxed from separate video+audio streams,
 * or — when the source has nothing at or below the target — the smallest rendition
 * is downscaled on-device.
 *
 * `override` is a one-off choice made at save time (the quality row in the format
 * sheet). Without it the platform's saved default from Settings applies.
 */
export async function downloadToGallery(
  item: MediaItem,
  onProgress: (fraction: number) => void,
  override?: ResolutionPref
): Promise<void> {
  await ensureMediaPermission();

  // Await the (idempotent) load so a cold-launch download can't race past the
  // saved preference and silently use the defaults.
  const pref =
    override ?? resolutionForPlatform(await loadPreferences(), item.platform ?? 'instagram');

  if (item.type !== 'video') {
    // Photos honour the preference by picking a smaller rendition from the source's
    // own ladder — Instagram and Threads expose one, so no resizing is involved.
    const url = pickImageUrl(item, pref);
    await downloadDirect(item, url, guessExtension(item, url), onProgress);
    return;
  }

  const plan = planVideoDownload(item, pref);

  switch (plan.kind) {
    case 'direct':
      await downloadDirect(item, plan.videoUrl, 'mp4', onProgress);
      return;
    case 'mux':
      try {
        await downloadMuxed(item, plan, onProgress);
      } catch (error) {
        // The HD path needs two live stream URLs plus an on-device mux — any of
        // which can fail for reasons the progressive stream is immune to. Fall
        // back to the muxed default URL so an HD hiccup never fails a download
        // the pre-HD app would have completed. (Progress restarts from 0.)
        if (plan.videoUrl === item.url) throw error;
        await downloadDirect(item, item.url, 'mp4', onProgress);
      }
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
    await deleteQuietly(result.uri);
  }

  onProgress(1);
}

/**
 * HD path: download the video-only and audio-only streams in parallel, mux them
 * into one MP4 on-device (no re-encode), then save. Progress: downloads 0→0.8
 * (weighted ~video-heavy since it dominates the bytes), mux 0.8→0.9, save
 * 0.9→1.0.
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

    // Both fractions only ever grow, so the combined figure stays monotonic.
    let videoFraction = 0;
    let audioFraction = 0;
    const reportCombined = () => onProgress(0.8 * (0.75 * videoFraction + 0.25 * audioFraction));

    // allSettled (not all) so a failure still waits for the other stream to
    // finish before the finally-cleanup deletes files a live download could
    // otherwise recreate mid-write.
    const [videoSettled, audioSettled] = await Promise.allSettled([
      downloadFile(plan.videoUrl, videoUri, (f) => {
        videoFraction = f;
        reportCombined();
      }),
      downloadFile(plan.audioUrl, audioUri, (f) => {
        audioFraction = f;
        reportCombined();
      }),
    ]);
    if (videoSettled.status === 'rejected') throw videoSettled.reason;
    if (audioSettled.status === 'rejected') throw audioSettled.reason;
    const videoResult = videoSettled.value;
    const audioResult = audioSettled.value;
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
    await Promise.all([deleteQuietly(videoUri), deleteQuietly(audioUri), deleteQuietly(outUri)]);
  }
}

/** True when a native rejection is the module's "not implemented here" code. */
function isTranscodeUnsupportedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_TRANSCODE_UNSUPPORTED'
  );
}

/**
 * Compression path: download the smallest available muxed rendition, downscale
 * it to the target on-device, then save. Progress: download 0→0.6, transcode
 * 0.6→0.9, save 0.9→1.0.
 *
 * On platforms without a transcoder (Android, for now) the native call is
 * skipped entirely and the closest available rendition is saved as-is. A *real*
 * transcode failure on a supported platform surfaces as an error instead of
 * being silently swallowed — otherwise transcoder regressions would be
 * invisible and users would get files far bigger than the size they chose.
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
    if (plan.targetHeight && isTranscodeSupported()) {
      try {
        await transcodeVideo(srcResult.uri, outUri, { targetHeight: plan.targetHeight });
        fileToSave = outUri;
      } catch (error) {
        if (!isTranscodeUnsupportedError(error)) {
          throw new DownloadError(
            `transcode failed: ${String(error)}`,
            'Could not shrink the video to your selected quality. Set the resolution to Max in Settings to save the original.'
          );
        }
        // Capability probe raced/lied — degrade to the closest rendition.
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
    await Promise.all([deleteQuietly(srcUri), deleteQuietly(outUri)]);
  }
}

/**
 * Saves a video item's audio as an M4A.
 *
 * When the source publishes a standalone audio stream (`item.audioOnlyUrl` —
 * YouTube's adaptive AAC, or the audio track of Instagram/Threads' DASH manifest)
 * only that stream is downloaded: for a 13s reel ~105 KB instead of ~1.8 MB, and
 * for a YouTube video a few MB instead of tens. Otherwise the whole video is
 * downloaded and its audio track stripped, as before.
 */
export async function downloadAudioToGallery(
  item: MediaItem,
  onProgress: (fraction: number) => void
): Promise<void> {
  await ensureMediaPermission();

  if (item.audioOnlyUrl) {
    await downloadAudioStream(item, item.audioOnlyUrl, onProgress);
    return;
  }

  const videoUri = cacheUri(item, 'src.mp4');
  const audioUri = cacheUri(item, 'audio.m4a');

  // Phase 1: download video to cache (0 → 70%)
  const videoResult = await downloadFile(item.url, videoUri, (f) => onProgress(0.7 * f));
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
    await deleteQuietly(videoUri);
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
    await deleteQuietly(audioUri);
  }

  onProgress(1);
}

/**
 * Audio-only path: download just the audio stream, then save it as an M4A.
 *
 * The stream is already an audio-only MP4, so the native remux only rewrites the
 * container (no re-encode, and nothing to strip). Meta's DASH audio is *fragmented*
 * MP4 (ftyp + moov + sidx + moof/mdat…) and HE-AAC (`mp4a.40.5`) rather than the
 * AAC-LC the remux path normally sees, so a remux failure falls back to saving the
 * downloaded file as-is: it is a valid audio MP4 either way, and a container
 * preference is not worth failing a download over.
 *
 * Progress: download 0→0.85, remux 0.85→0.9, save 0.9→1.0.
 */
async function downloadAudioStream(
  item: MediaItem,
  url: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  const srcUri = cacheUri(item, 'audiosrc.m4a');
  const outUri = cacheUri(item, 'audio.m4a');

  try {
    const srcResult = await downloadFile(url, srcUri, (f) => onProgress(0.85 * f));
    onProgress(0.85);

    let fileToSave = srcResult.uri;
    try {
      await extractAudio(srcResult.uri, outUri);
      fileToSave = outUri;
    } catch {
      // Keep the downloaded stream: already audio-only, already playable.
    }
    onProgress(0.9);

    try {
      await saveToFoxyAlbum(fileToSave);
    } catch (error) {
      throw new DownloadError(
        `gallery save failed: ${String(error)}`,
        'Downloaded the audio, but saving to your library failed. Check storage permissions.'
      );
    }
    onProgress(1);
  } finally {
    await Promise.all([deleteQuietly(srcUri), deleteQuietly(outUri)]);
  }
}
