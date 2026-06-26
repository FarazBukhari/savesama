import { Album, Asset, AssetInfo, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { ALBUM_NAME } from './download';

export class LibraryError extends Error {
  /** Friendly message safe to show in the UI. */
  readonly userMessage: string;

  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'LibraryError';
    this.userMessage = userMessage;
  }
}

/**
 * A media file Foxy has saved, with its metadata resolved up front. The SDK 56
 * `Asset` class exposes everything through async getters; we resolve them once
 * via `getInfo()` so the UI can render synchronously.
 */
export type SavedAsset = AssetInfo;

/**
 * Requests full read access to the media library so the Saved tab can
 * enumerate Foxy's albums. The save flow only needs add/write access, but
 * listing existing assets requires full access.
 */
export async function ensureReadPermission(): Promise<void> {
  const current = await getPermissionsAsync();
  if (current.granted) return;
  const requested = await requestPermissionsAsync();
  if (!requested.granted) {
    throw new LibraryError(
      'media library read permission denied',
      'Foxy needs permission to read your media to show saved files. Enable Photos and videos access in Settings.'
    );
  }
}

/**
 * Returns every asset Foxy has saved, newest first. On Android the files live
 * in two same-named albums (`Pictures/Foxy Downloader` for photo/video and
 * `Audio/Foxy Downloader` for audio); on iOS there is a single album. Album
 * titles aren't unique, so we fetch all albums and match every one titled
 * {@link ALBUM_NAME} rather than relying on `Album.get`, which returns just one.
 */
export async function listSavedAssets(): Promise<SavedAsset[]> {
  await ensureReadPermission();

  // Every fan-out below uses `allSettled`, not `Promise.all`: `Album.getAll()`
  // returns every bucket on the device, and a single foreign album/asset whose
  // metadata can't be read would otherwise reject the whole load. We drop the
  // rejects and keep going so Foxy's own files always surface.
  const albums = await Album.getAll();

  const titled = await Promise.allSettled(
    albums.map(async (album) => ({ album, title: await album.getTitle() }))
  );
  const foxyAlbums = titled
    .filter((r) => r.status === 'fulfilled' && r.value.title === ALBUM_NAME)
    .map((r) => (r as PromiseFulfilledResult<{ album: Album; title: string }>).value.album);

  const assetGroups = await Promise.allSettled(foxyAlbums.map((album) => album.getAssets()));
  const assets = assetGroups
    .filter((r): r is PromiseFulfilledResult<Asset[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  const settledInfos = await Promise.allSettled(assets.map((asset) => asset.getInfo()));
  const infos = settledInfos
    .filter((r): r is PromiseFulfilledResult<SavedAsset> => r.status === 'fulfilled')
    .map((r) => r.value);

  const reasons = (results: PromiseSettledResult<unknown>[]): string[] =>
    results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason));
  const titleErrors = reasons(titled);
  const assetsErrors = reasons(assetGroups);
  const infoErrors = reasons(settledInfos);
  const skipped = titleErrors.length + assetsErrors.length + infoErrors.length;
  if (skipped > 0) {
    // Break the skips down by stage and include the native error text so we can
    // see exactly what's failing (e.g. audio asset metadata reads).
    console.warn(`[library] skipped ${skipped} entr(ies)`, {
      foxyAlbumsFound: foxyAlbums.length,
      assetsFound: assets.length,
      albumTitleErrors: titleErrors,
      albumGetAssetsErrors: assetsErrors,
      assetGetInfoErrors: infoErrors,
    });
  }

  infos.sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));
  return infos;
}

/** Opens the native share/open sheet for a saved asset. */
export async function openAsset(asset: SavedAsset): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new LibraryError('sharing unavailable', 'Sharing is not available on this device.');
  }
  await Sharing.shareAsync(asset.uri);
}

/** Deletes a saved asset from the device's media store. */
export async function deleteSavedAsset(id: string): Promise<void> {
  try {
    await new Asset(id).delete();
  } catch (error) {
    throw new LibraryError(
      `delete failed: ${String(error)}`,
      'Could not delete this file. Please try again.'
    );
  }
}
