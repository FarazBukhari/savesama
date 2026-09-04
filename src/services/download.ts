import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import {
  extractAudio,
  isTranscodeSupported,
  muxVideoAudio,
  transcodeVideo,
} from '../../modules/savesama-audio-extractor';
import { buildSavedFilename } from '../components/savedName';
import { MediaItem } from '../extraction/types';
import { CancelToken, isCancelledError } from './cancellation';
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

/** Dedicated album for everything the app saves, so downloads don't land in Camera. */
export const ALBUM_NAME = 'SaveSama';

/**
 * Saves a local file into the app's dedicated album instead of the default
 * Camera folder.
 *
 * On Android the album lives under a media-type-specific root (photos and
 * videos under `Pictures/`, audio under `Music/`), and MediaStore refuses to
 * place a file outside the root allowed for its type. A single shared album
 * therefore can't hold every media type: adding audio to the photo/video
 * album throws. To handle that, we add to the existing album when the type
 * fits, and otherwise spin up the correctly-rooted album for that type
 * (`Album.create` derives the root from the asset's own media type).
 */
async function saveToAppAlbum(uri: string): Promise<void> {
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
      // own correctly-rooted album below.
    }
  }

  // Save the asset first so the download is never lost, then group it into a
  // an album rooted for its media type. Grouping is best-effort: if it
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
      'SaveSama needs permission to save media. Enable Photos and videos access in Settings.'
    );
  }
}

/**
 * Prefix on every file the app writes. Saved files keep their cache name, so
 * this is what a user sees in their gallery — and what `prettyName` parses back
 * into a readable title.
 */
export const FILE_PREFIX = 'savesama_';

function cacheUri(item: MediaItem, suffix: string): string {
  const safeId = item.id.replace(/[^A-Za-z0-9_-]/g, '');
  return `${FileSystem.cacheDirectory}${FILE_PREFIX}${safeId}_${Date.now()}_${suffix}`;
}

/**
 * Directory a finished file is moved into under its gallery name just before the
 * save. The media library keeps the on-disk name, so the name of the cache file *is*
 * the name the user sees — and the working files above are deliberately ugly
 * (timestamped, suffixed) so two concurrent jobs can't collide.
 */
const OUTBOX_DIR = `${FileSystem.cacheDirectory}${FILE_PREFIX}outbox/`;

/**
 * Moves `fileUri` to the outbox under the gallery-facing name
 * (`<poster> - <code>.<ext>`, see savedName.ts) and returns the new uri. The caller
 * saves that and deletes it afterwards. Jobs run one at a time, so a same-named
 * leftover can only be an earlier crash — it is replaced.
 */
async function withGalleryName(
  fileUri: string,
  item: MediaItem,
  format: 'video' | 'audio' | 'image',
  extension: string
): Promise<string> {
  await FileSystem.makeDirectoryAsync(OUTBOX_DIR, { intermediates: true }).catch(() => undefined);
  const target = `${OUTBOX_DIR}${buildSavedFilename(item, format, extension)}`;
  await deleteQuietly(target);
  await FileSystem.moveAsync({ from: fileUri, to: target });
  return target;
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
  onProgress: (fraction: number) => void,
  allowSplit = true,
  token?: CancelToken
): Promise<FileSystem.FileSystemDownloadResult> {
  token?.throwIfCancelled();
  // Large files split across parallel range requests — one connection to
  // googlevideo/fbcdn is often slower than the link allows. Small files, servers
  // that won't report a size, and servers without range support fall through to
  // the single-connection path below.
  //
  // `allowSplit` is false for transfers already known to be small (photos, audio
  // streams): the probe costs a full round-trip, which for a ~100KB file can cost
  // more than the split saves.
  if (allowSplit) {
    const probe = await probeRangedDownload(url);
    if (shouldSplit(probe) && probe.totalBytes !== null) {
      try {
        await runRangedDownload(
          url,
          fileUri,
          probe.totalBytes,
          onProgress,
          fileSystemDeps,
          undefined,
          token
        );
        // The joined file is returned by path rather than by a real download result.
        // Verify it actually landed: downstream callers hand this uri to the native
        // mux/transcode calls, and a missing or unreadable file there would fail in a
        // much more confusing place.
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists && (info.size ?? 0) > 0) {
          return {
            uri: fileUri,
            status: 200,
            headers: {},
            mimeType: null,
          } as FileSystem.FileSystemDownloadResult;
        }
      } catch {
        // Fall through to the single-connection path.
      }
      // Any range/concat problem, or a missing joined file: start over on one
      // connection rather than fail. runRangedDownload already removed its parts.
      await deleteQuietly(fileUri);
      onProgress(0);
    }
  }

  const download = FileSystem.createDownloadResumable(url, fileUri, {}, (progress) => {
    if (progress.totalBytesExpectedToWrite > 0) {
      onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
    }
  });

  // Cancelling the token aborts the transfer itself rather than waiting for it.
  const unregister = token?.onCancel(() => {
    void download.cancelAsync().catch(() => undefined);
  });

  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await download.downloadAsync();
  } catch (error) {
    await deleteQuietly(fileUri);
    // A cancelled transfer rejects; report the cancellation, not a network failure.
    token?.throwIfCancelled();
    throw new DownloadError(
      `download failed: ${String(error)}`,
      'Download failed. Check your connection and try again.'
    );
  } finally {
    unregister?.();
  }

  // cancelAsync can also resolve with a partial file rather than rejecting.
  if (token?.cancelled) {
    await deleteQuietly(fileUri);
    token.throwIfCancelled();
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
  override?: ResolutionPref,
  token?: CancelToken
): Promise<void> {
  await ensureMediaPermission();
  token?.throwIfCancelled();

  // Await the (idempotent) load so a cold-launch download can't race past the
  // saved preference and silently use the defaults.
  const prefs = await loadPreferences();
  const pref = override ?? resolutionForPlatform(prefs, item.platform ?? 'instagram');

  if (item.type !== 'video') {
    // Photos honour the preference by picking a smaller rendition from the source's
    // own ladder — Instagram and Threads expose one, so no resizing is involved.
    const url = pickImageUrl(item, pref);
    await downloadDirect(item, url, guessExtension(item, url), onProgress, token);
    return;
  }

  // Opt-in: Meta's true original lives only in the DASH manifest as VP9 video-only,
  // so it is downloaded alongside the audio stream and muxed by FFmpeg (`-c copy`).
  // Anything going wrong falls through to the normal muxed rendition below.
  if (pref === 'max' && prefs.preferOriginalQuality && item.originalVideo && item.audioOnlyUrl) {
    try {
      await downloadMuxed(
        item,
        { kind: 'mux', videoUrl: item.originalVideo.url, audioUrl: item.audioOnlyUrl },
        onProgress,
        token
      );
      return;
    } catch (error) {
      if (isCancelledError(error)) throw error;
      onProgress(0);
    }
  }

  const plan = planVideoDownload(item, pref);

  switch (plan.kind) {
    case 'direct':
      await downloadDirect(item, plan.videoUrl, 'mp4', onProgress, token);
      return;
    case 'mux':
      try {
        await downloadMuxed(item, plan, onProgress, token);
      } catch (error) {
        // The HD path needs two live stream URLs plus an on-device mux — any of
        // which can fail for reasons the progressive stream is immune to. Fall
        // back to the muxed default URL so an HD hiccup never fails a download
        // the pre-HD app would have completed. (Progress restarts from 0.)
        if (plan.videoUrl === item.url) throw error;
        // Don't "recover" from a cancellation by starting a different download.
        token?.throwIfCancelled();
        await downloadDirect(item, item.url, 'mp4', onProgress, token);
      }
      return;
    case 'transcode':
      await downloadTranscoded(item, plan, onProgress, token);
      return;
  }
}

/** Single-URL path: download → save to album → clean up. */
async function downloadDirect(
  item: MediaItem,
  url: string,
  extension: string,
  onProgress: (fraction: number) => void,
  token?: CancelToken
): Promise<void> {
  // Photos are ~100KB-1MB; only video is worth probing for a range split.
  const result = await downloadFile(
    url,
    cacheUri(item, `dl.${extension}`),
    onProgress,
    item.type === 'video',
    token
  );

  let fileToSave = result.uri;
  try {
    token?.throwIfCancelled();
    fileToSave = await withGalleryName(
      result.uri,
      item,
      item.type === 'video' ? 'video' : 'image',
      extension
    );
    // SDK 56 removed the legacy `saveToLibraryAsync` from the main entrypoint
    // (it now throws at runtime). Use the new class-based API instead, routing
    // the asset into the app's own album rather than the default Camera folder.
    await saveToAppAlbum(fileToSave);
  } catch (error) {
    if (isCancelledError(error)) throw error;
    throw new DownloadError(
      `save to gallery failed: ${String(error)}`,
      'Downloaded, but saving to your gallery failed. Check storage permissions.'
    );
  } finally {
    await Promise.all([deleteQuietly(result.uri), deleteQuietly(fileToSave)]);
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
  onProgress: (fraction: number) => void,
  token?: CancelToken
): Promise<void> {
  const videoUri = cacheUri(item, 'v.mp4');
  const audioUri = cacheUri(item, 'a.m4a');
  const outUri = cacheUri(item, 'hd.mp4');
  let named: string | null = null;

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
      downloadFile(
        plan.videoUrl,
        videoUri,
        (f) => {
          videoFraction = f;
          reportCombined();
        },
        true,
        token
      ),
      // The audio stream is a fraction of the video's size — not worth a probe.
      downloadFile(
        plan.audioUrl,
        audioUri,
        (f) => {
          audioFraction = f;
          reportCombined();
        },
        false,
        token
      ),
    ]);
    if (videoSettled.status === 'rejected') throw videoSettled.reason;
    if (audioSettled.status === 'rejected') throw audioSettled.reason;
    const videoResult = videoSettled.value;
    const audioResult = audioSettled.value;
    onProgress(0.8);

    // The mux can't be interrupted once started, so check here instead.
    token?.throwIfCancelled();
    try {
      await muxVideoAudio(videoResult.uri, audioResult.uri, outUri);
    } catch (error) {
      throw new DownloadError(
        `mux failed: ${String(error)}`,
        'Could not combine the HD video and audio streams. Try a lower resolution in Settings.'
      );
    }
    onProgress(0.9);

    token?.throwIfCancelled();
    try {
      named = await withGalleryName(outUri, item, 'video', 'mp4');
      await saveToAppAlbum(named);
    } catch (error) {
      if (isCancelledError(error)) throw error;
      throw new DownloadError(
        `save to gallery failed: ${String(error)}`,
        'Downloaded, but saving to your gallery failed. Check storage permissions.'
      );
    }
    onProgress(1);
  } finally {
    await Promise.all([
      deleteQuietly(videoUri),
      deleteQuietly(audioUri),
      deleteQuietly(outUri),
      named ? deleteQuietly(named) : Promise.resolve(),
    ]);
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
  onProgress: (fraction: number) => void,
  token?: CancelToken
): Promise<void> {
  const srcUri = cacheUri(item, 'src.mp4');
  const outUri = cacheUri(item, 'small.mp4');
  let named: string | null = null;

  try {
    const srcResult = await downloadFile(
      plan.videoUrl,
      srcUri,
      (f) => onProgress(0.6 * f),
      true,
      token
    );
    onProgress(0.6);

    // A transcode can take a while and can't be interrupted; a cancel arriving
    // during it takes effect when it returns, and the file is never saved.
    token?.throwIfCancelled();
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

    token?.throwIfCancelled();
    try {
      named = await withGalleryName(fileToSave, item, 'video', 'mp4');
      await saveToAppAlbum(named);
    } catch (error) {
      if (isCancelledError(error)) throw error;
      throw new DownloadError(
        `save to gallery failed: ${String(error)}`,
        'Downloaded, but saving to your gallery failed. Check storage permissions.'
      );
    }
    onProgress(1);
  } finally {
    await Promise.all([
      deleteQuietly(srcUri),
      deleteQuietly(outUri),
      named ? deleteQuietly(named) : Promise.resolve(),
    ]);
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
  onProgress: (fraction: number) => void,
  token?: CancelToken
): Promise<void> {
  await ensureMediaPermission();
  token?.throwIfCancelled();

  if (item.audioOnlyUrl) {
    await downloadAudioStream(item, item.audioOnlyUrl, onProgress, token);
    return;
  }

  const videoUri = cacheUri(item, 'src.mp4');
  const audioUri = cacheUri(item, 'audio.m4a');

  // Phase 1: download video to cache (0 → 70%)
  const videoResult = await downloadFile(
    item.url,
    videoUri,
    (f) => onProgress(0.7 * f),
    true,
    token
  );
  onProgress(0.7);

  // Phase 2: remux the audio track into an .m4a (no re-encode) (70 → 90%)
  try {
    token?.throwIfCancelled();
    await extractAudio(videoResult.uri, audioUri);
  } catch (error) {
    if (isCancelledError(error)) throw error;
    throw new DownloadError(
      `audio extraction failed: ${String(error)}`,
      'Could not extract audio from the video.'
    );
  } finally {
    await deleteQuietly(videoUri);
  }

  onProgress(0.9);

  // Phase 3: save M4A to media library (90 → 100%)
  let named: string | null = null;
  try {
    token?.throwIfCancelled();
    named = await withGalleryName(audioUri, item, 'audio', 'm4a');
    await saveToAppAlbum(named);
  } catch (error) {
    if (isCancelledError(error)) throw error;
    throw new DownloadError(
      `gallery save failed: ${String(error)}`,
      'Extracted audio, but saving to your library failed. Check storage permissions.'
    );
  } finally {
    await Promise.all([deleteQuietly(audioUri), named ? deleteQuietly(named) : Promise.resolve()]);
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
  onProgress: (fraction: number) => void,
  token?: CancelToken
): Promise<void> {
  const srcUri = cacheUri(item, 'audiosrc.m4a');
  const outUri = cacheUri(item, 'audio.m4a');
  let named: string | null = null;

  try {
    // Audio-only streams are small (a 13s reel's is ~105KB): skip the range probe.
    const srcResult = await downloadFile(url, srcUri, (f) => onProgress(0.85 * f), false, token);
    onProgress(0.85);
    token?.throwIfCancelled();

    let fileToSave = srcResult.uri;
    try {
      await extractAudio(srcResult.uri, outUri);
      fileToSave = outUri;
    } catch {
      // Keep the downloaded stream: already audio-only, already playable.
    }
    onProgress(0.9);

    try {
      token?.throwIfCancelled();
      named = await withGalleryName(fileToSave, item, 'audio', 'm4a');
      await saveToAppAlbum(named);
    } catch (error) {
      if (isCancelledError(error)) throw error;
      throw new DownloadError(
        `gallery save failed: ${String(error)}`,
        'Downloaded the audio, but saving to your library failed. Check storage permissions.'
      );
    }
    onProgress(1);
  } finally {
    await Promise.all([
      deleteQuietly(srcUri),
      deleteQuietly(outUri),
      named ? deleteQuietly(named) : Promise.resolve(),
    ]);
  }
}
