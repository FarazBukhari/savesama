import type { Mode, ResolveItem, Resolved } from './api';
import { formatDuration } from './format';

/**
 * A photo post that plays a song lists the soundtrack as a trailing audio item (docs/API.md).
 * It gets its own "also save the sound" row instead of a tile among the pictures. A post that
 * is nothing but audio keeps it as its only tile.
 */
export function splitSound(items: ResolveItem[]): { tiles: ResolveItem[]; sound: ResolveItem | null } {
  const tiles = items.filter((i) => i.type !== 'audio');
  const sound = tiles.length ? (items.find((i) => i.type === 'audio') ?? null) : null;
  return sound ? { tiles, sound } : { tiles: items, sound: null };
}

export function postKind(r: Resolved, item?: ResolveItem): string {
  const { tiles } = splitSound(r.items);
  const one = item ?? tiles[0];
  if (tiles.length > 1) return 'Post';
  if (!one) return 'Post';
  if (one.type === 'image') return 'Photo';
  if (one.type === 'audio') return 'Audio';
  if (r.platform === 'youtube' && /\/shorts\//.test(r.url)) return 'Short';
  if (r.platform === 'instagram' && /\/reels?\//.test(r.url)) return 'Reel';
  return 'Video';
}

export function postMeta(r: Resolved): string {
  const { tiles, sound } = splitSound(r.items);
  const withSound = sound ? 'with sound' : '';
  if (tiles.length > 1) {
    const v = tiles.filter((i) => i.type === 'video').length;
    const p = tiles.filter((i) => i.type === 'image').length;
    const a = tiles.filter((i) => i.type === 'audio').length;
    const parts = [v && `${v} ${v === 1 ? 'video' : 'videos'}`, p && `${p} ${p === 1 ? 'photo' : 'photos'}`, a && `${a} audio`].filter(Boolean);
    return [`Post · ${tiles.length} items`, parts.join(', '), withSound].filter(Boolean).join(' · ');
  }
  const d = tiles[0]?.type === 'image' ? null : (tiles[0]?.duration ?? r.duration);
  return [postKind(r), d ? formatDuration(d) : '', withSound].filter(Boolean).join(' · ');
}

export function ctaLabel(selected: ResolveItem[], mode: Mode, sound: ResolveItem | null = null): string {
  const withSound = !!sound && selected.some((i) => i.index === sound.index);
  const rest = withSound ? selected.filter((i) => i.index !== sound!.index) : selected;
  if (rest.length === 0) return withSound ? 'Save sound' : 'Select something to save';
  let label: string;
  if (rest.length > 1) label = `Save ${rest.length} items`;
  else {
    const t = rest[0].type;
    label = mode === 'audio' && t !== 'image' ? 'Save audio' : t === 'image' ? 'Save photo' : t === 'audio' ? 'Save audio' : 'Save video';
  }
  return withSound ? `${label} + sound` : label;
}
