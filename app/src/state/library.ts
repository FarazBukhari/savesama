import { Platform as RNPlatform } from 'react-native';

import type { ItemType } from '@/lib/api';
import type { Platform } from '@/lib/links';

import { createStore } from './createStore';
import { deleteFromGallery, galleryAccess, listGallery, type GalleryAccess } from './gallery';
import { forgetSaves } from './history';
import { historyStore, type SavedFile } from './stores';

export interface LibraryItem {
  key: string;
  assetId: string | null;
  uri: string;
  type: ItemType;
  title: string;
  author: string | null;
  platform: Platform | null;
  url: string | null;
  thumbnail: string | null;
  savedAt: number;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string;
}

export interface LibraryState {
  items: LibraryItem[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  access: GalleryAccess | null;
}

export const libraryStore = createStore<LibraryState>({ items: [], status: 'idle', access: null });

function fromSave(s: SavedFile): LibraryItem {
  return {
    key: s.assetId ?? `job:${s.jobId}`,
    assetId: s.assetId,
    uri: s.uri ?? s.thumbnail ?? '',
    type: s.type,
    title: s.title || s.name,
    author: s.author,
    platform: s.platform,
    url: s.url,
    thumbnail: s.thumbnail,
    savedAt: s.savedAt,
    size: s.size,
    width: null,
    height: null,
    duration: null,
    filename: s.name,
  };
}

/** Gallery assets in the SaveSama album(s), joined with local history by asset id. */
export async function loadLibrary(request = false): Promise<void> {
  libraryStore.set((s) => ({ status: s.items.length ? s.status : 'loading' }));
  if (RNPlatform.OS === 'web') {
    libraryStore.set({ items: historyStore.get().saves.map(fromSave), status: 'ready', access: 'granted' });
    return;
  }
  const access = await galleryAccess(request);
  libraryStore.set({ access });
  if (access !== 'granted' && access !== 'limited') {
    libraryStore.set({ status: 'ready', items: [] });
    return;
  }
  try {
    const assets = await listGallery();
    const byAsset = new Map(historyStore.get().saves.filter((s) => s.assetId).map((s) => [s.assetId!, s]));
    const items = assets.map((a): LibraryItem => {
      const s = byAsset.get(a.id);
      return {
        key: a.id,
        assetId: a.id,
        uri: a.uri,
        type: a.type,
        title: s?.title || a.filename.replace(/\.[^.]+$/, ''),
        author: s?.author ?? null,
        platform: s?.platform ?? null,
        url: s?.url ?? null,
        thumbnail: a.type === 'audio' ? (s?.thumbnail ?? null) : a.uri,
        savedAt: s?.savedAt ?? a.createdAt,
        size: s?.size ?? null,
        width: a.width,
        height: a.height,
        duration: a.duration,
        filename: a.filename,
      };
    });
    libraryStore.set({ items, status: 'ready' });
  } catch {
    libraryStore.set({ status: 'error' });
  }
}

export async function deleteItems(keys: string[]): Promise<void> {
  const items = libraryStore.get().items.filter((i) => keys.includes(i.key));
  const assetIds = items.map((i) => i.assetId).filter((x): x is string => !!x);
  if (assetIds.length) await deleteFromGallery(assetIds);
  forgetSaves((s) => keys.includes(s.assetId ?? `job:${s.jobId}`));
  libraryStore.set((s) => ({ items: s.items.filter((i) => !keys.includes(i.key)) }));
}

export function findItem(key: string): LibraryItem | null {
  return libraryStore.get().items.find((i) => i.key === key) ?? null;
}

export function typeName(t: ItemType): string {
  return t === 'image' ? 'Photo' : t === 'audio' ? 'Audio' : 'Video';
}
