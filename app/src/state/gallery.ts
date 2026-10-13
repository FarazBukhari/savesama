import { Album, Asset, getPermissionsAsync, MediaType, presentPermissionsPicker, Query, requestPermissionsAsync } from 'expo-media-library';
import { Linking } from 'react-native';

import type { ItemType } from '@/lib/api';

export const ALBUM = 'SaveSama';

export type GalleryAccess = 'granted' | 'limited' | 'denied' | 'blocked' | 'undetermined';

export async function galleryAccess(request = false): Promise<GalleryAccess> {
  try {
    const res = request ? await requestPermissionsAsync() : await getPermissionsAsync();
    if (res.granted) return res.accessPrivileges === 'limited' ? 'limited' : 'granted';
    if (res.status === 'undetermined') return 'undetermined';
    return res.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

export async function allowAllMedia(): Promise<void> {
  try {
    await presentPermissionsPicker();
  } catch {
    await Linking.openSettings();
  }
}

async function savesamaAlbums(): Promise<Album[]> {
  const all = await Album.getAll();
  const titled = await Promise.all(all.map(async (a) => ((await a.getTitle().catch(() => '')) === ALBUM ? a : null)));
  return titled.filter((a): a is Album => a !== null);
}

/**
 * Puts a local file into a "SaveSama" album. Android keeps photos/videos (DCIM) and audio (Music)
 * in different folders, so there can be two buckets named SaveSama; try each, else create one.
 */
export async function saveToGallery(fileUri: string): Promise<string> {
  const albums = await savesamaAlbums();
  for (const album of albums) {
    try {
      const asset = await Asset.create(fileUri, album);
      return asset.id;
    } catch {
      // wrong media folder for this file type; try the next album
    }
  }
  const album = await Album.create(ALBUM, [fileUri], false);
  const name = decodeURIComponent(fileUri.split('/').pop() ?? '');
  const assets = await album.getAssets();
  for (const a of assets) {
    if ((await a.getFilename().catch(() => '')) === name) return a.id;
  }
  return assets[assets.length - 1]?.id ?? '';
}

export interface GalleryAsset {
  id: string;
  uri: string;
  type: ItemType;
  filename: string;
  /** seconds */
  duration: number | null;
  createdAt: number;
  width: number | null;
  height: number | null;
}

const typeOf = (t: MediaType): ItemType => (t === MediaType.VIDEO ? 'video' : t === MediaType.AUDIO ? 'audio' : 'image');

export async function listGallery(): Promise<GalleryAsset[]> {
  const albums = await savesamaAlbums();
  const lists = await Promise.all(albums.map((a) => new Query().album(a).exeForMetadata().catch(() => [])));
  return lists
    .flat()
    .map((m) => ({
      id: m.id,
      uri: m.id,
      type: typeOf(m.mediaType),
      filename: m.filename ?? '',
      duration: m.duration != null ? m.duration / 1000 : null,
      createdAt: m.creationTime ?? m.modificationTime ?? 0,
      width: m.width,
      height: m.height,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteFromGallery(ids: string[]): Promise<void> {
  await Asset.delete(ids.map((id) => new Asset(id)));
}

export const galleryAvailable = true;
