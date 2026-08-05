export type SourcePlatform = 'instagram' | 'threads' | 'youtube';

export type MediaType = 'image' | 'video';

export interface ParsedLink {
  platform: SourcePlatform;
  /**
   * Content id for the link. For Instagram and Threads this is the post shortcode
   * (e.g. "DA1b2C3dEfG"); for YouTube it is the 11-char video id.
   * Null when the link is a redirect that must be resolved first.
   */
  shortcode: string | null;
  canonicalUrl: string;
  needsResolution: boolean;
  /**
   * Set when the link is recognized but intentionally not downloadable.
   * 'audio' = an Instagram song/audio page (/reels/audio/<id>): Instagram walls the
   * audio asset for anonymous clients and never serves full licensed tracks, so we
   * surface a clear "not supported" message instead of a generic failure.
   */
  unsupported?: 'audio';
}

export interface MediaItem {
  id: string;
  type: MediaType;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface ExtractionResult {
  platform: SourcePlatform;
  shortcode: string;
  items: MediaItem[];
  username: string | null;
  caption: string | null;
}

export class ExtractionError extends Error {
  /** Friendly message safe to show in the UI. */
  readonly userMessage: string;

  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'ExtractionError';
    this.userMessage = userMessage;
  }
}
