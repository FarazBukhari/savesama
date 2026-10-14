import type { ItemType } from '@/lib/api';

// The web build exists for screenshot tests in a browser: there is no gallery, so saves become
// browser downloads and the Library is built from local history.
export const ALBUM = 'SaveSama';
export type GalleryAccess = 'granted' | 'limited' | 'denied' | 'blocked' | 'undetermined';

export async function galleryAccess(): Promise<GalleryAccess> {
  return 'granted';
}

export async function allowAllMedia(): Promise<void> {}

export async function saveToGallery(fileUri: string): Promise<string> {
  return fileUri;
}

export interface GalleryAsset {
  id: string;
  uri: string;
  type: ItemType;
  filename: string;
  duration: number | null;
  createdAt: number;
  width: number | null;
  height: number | null;
}

export async function listGallery(): Promise<GalleryAsset[]> {
  return [];
}

export async function deleteFromGallery(): Promise<void> {}

export const galleryAvailable = false;

export async function shareFile(uri: string, filename: string): Promise<void> {
  const nav = globalThis.navigator as Navigator | undefined;
  if (nav?.share) return nav.share({ title: filename, url: uri });
  throw new Error('sharing unavailable');
}
