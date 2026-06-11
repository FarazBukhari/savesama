export type SourcePlatform = 'instagram' | 'threads';

export type MediaType = 'image' | 'video';

export interface ParsedLink {
  platform: SourcePlatform;
  /** Post shortcode (e.g. "DA1b2C3dEfG"). Null when the link is a redirect that must be resolved first. */
  shortcode: string | null;
  canonicalUrl: string;
  needsResolution: boolean;
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
