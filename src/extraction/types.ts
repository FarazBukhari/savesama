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

/**
 * A single downloadable rendition of a video. Sources that expose a quality
 * ladder (YouTube's progressive + adaptive streams, Instagram's `video_versions`)
 * populate `MediaItem.formats` with these so the download layer can honour a
 * user-selected resolution. `hasAudio` is true for muxed/progressive streams and
 * false for YouTube's video-only adaptive streams, which must be paired with
 * `audioUrl` and combined on-device before saving.
 */
export interface MediaFormat {
  url: string;
  width: number | null;
  height: number | null;
  bitrate: number | null;
  hasAudio: boolean;
  /** For adaptive (video-only) formats: the paired audio-only stream to mux in. */
  audioUrl?: string | null;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  /**
   * The default/best single URL. Kept for back-compat and for the common
   * "Max quality" path; resolution-aware downloads consult `formats` instead.
   */
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  /** Which platform produced this item, so the download layer can pick the right preference. */
  platform?: SourcePlatform;
  /**
   * A standalone audio-only stream for this item, when the source publishes one:
   * YouTube's adaptive AAC (itag 140) stream, or the audio `AdaptationSet` in the
   * DASH manifest Instagram and Threads ship on video posts. "Save as Audio" uses
   * it to skip downloading the video entirely — on a 13s reel that is ~105 KB
   * instead of ~1.8 MB. Absent when the source only serves muxed files, in which
   * case the audio track is stripped from the downloaded video as before.
   */
  audioOnlyUrl?: string | null;
  /** Full quality ladder when the source exposes one. Absent for images and single-URL fallbacks. */
  formats?: MediaFormat[];
  /**
   * Handle of the account that posted the media (Instagram/Threads username, YouTube
   * channel name). Used to name the saved file; null when the source doesn't say.
   */
  username?: string | null;
  /** The post's shortcode / video id, so a filename never has to be parsed back out of `id`. */
  postCode?: string;
  /** 1-based position inside a carousel; absent for single-item posts. */
  position?: number;
  /**
   * The full-resolution rendition Meta publishes only in the DASH manifest (VP9 in an
   * fMP4). `video_versions` tops out below the original (716x1274 vs 1088x1936), so
   * this is the only way to save what was uploaded. Set only when it is strictly larger
   * than the best muxed rendition; used when the "original quality" preference is on.
   */
  originalVideo?: OriginalVideo;
}

/** A video-only DASH representation (see `MediaItem.originalVideo`). */
export interface OriginalVideo {
  url: string;
  width: number | null;
  height: number | null;
  codecs: string | null;
  bandwidth: number | null;
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
