import { MediaItem } from '../../extraction/types';
import { planVideoDownload } from '../resolutionPlan';

function videoItem(formats: MediaItem['formats'], fallbackHeight: number | null = null): MediaItem {
  return {
    id: 'v',
    type: 'video',
    url: 'https://example/default.mp4',
    thumbnailUrl: null,
    width: null,
    height: fallbackHeight,
    platform: 'youtube',
    formats,
  };
}

const YT_FORMATS: MediaItem['formats'] = [
  { url: 'https://example/360.mp4', width: 640, height: 360, bitrate: 500000, hasAudio: true },
  { url: 'https://example/720.mp4', width: 1280, height: 720, bitrate: 1500000, hasAudio: true },
  {
    url: 'https://example/1080.mp4',
    width: 1920,
    height: 1080,
    bitrate: 4000000,
    hasAudio: false,
    audioUrl: 'https://example/audio.m4a',
  },
];

describe('planVideoDownload', () => {
  it('max picks the highest muxed stream directly when the best has audio', () => {
    const item = videoItem([
      { url: 'https://example/360.mp4', width: 640, height: 360, bitrate: 500000, hasAudio: true },
      { url: 'https://example/720.mp4', width: 1280, height: 720, bitrate: 1500000, hasAudio: true },
    ]);
    expect(planVideoDownload(item, 'max')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/720.mp4',
    });
  });

  it('max muxes when the highest stream is video-only (adaptive HD)', () => {
    expect(planVideoDownload(videoItem(YT_FORMATS), 'max')).toEqual({
      kind: 'mux',
      videoUrl: 'https://example/1080.mp4',
      audioUrl: 'https://example/audio.m4a',
    });
  });

  it('picks the largest muxed stream at or below the target', () => {
    expect(planVideoDownload(videoItem(YT_FORMATS), '720')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/720.mp4',
    });
    expect(planVideoDownload(videoItem(YT_FORMATS), '480')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/360.mp4',
    });
  });

  it('muxes when the chosen at-or-below stream is video-only', () => {
    expect(planVideoDownload(videoItem(YT_FORMATS), '1080')).toEqual({
      kind: 'mux',
      videoUrl: 'https://example/1080.mp4',
      audioUrl: 'https://example/audio.m4a',
    });
  });

  it('never upscales: target above everything yields the best available', () => {
    const item = videoItem([
      { url: 'https://example/360.mp4', width: 640, height: 360, bitrate: 500000, hasAudio: true },
    ]);
    expect(planVideoDownload(item, '1080')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/360.mp4',
    });
  });

  it('transcodes the smallest rendition when every stream exceeds the target', () => {
    const item = videoItem([
      { url: 'https://example/720.mp4', width: 1280, height: 720, bitrate: 1500000, hasAudio: true },
      { url: 'https://example/1080.mp4', width: 1920, height: 1080, bitrate: 4000000, hasAudio: true },
    ]);
    expect(planVideoDownload(item, '360')).toEqual({
      kind: 'transcode',
      videoUrl: 'https://example/720.mp4',
      targetHeight: 360,
    });
  });

  it('transcodes from a MUXED stream even when a smaller video-only rung exists (no silent videos)', () => {
    // Only a 720p progressive plus adaptive video-only rungs below it: the
    // transcode source must carry audio — the transcode path performs no muxing,
    // so picking the 480p video-only stream would save a soundless file.
    const item = videoItem([
      { url: 'https://example/720.mp4', width: 1280, height: 720, bitrate: 1500000, hasAudio: true },
      {
        url: 'https://example/480-adaptive.mp4',
        width: 854,
        height: 480,
        bitrate: 800000,
        hasAudio: false,
        audioUrl: 'https://example/audio.m4a',
      },
    ]);
    expect(planVideoDownload(item, '360')).toEqual({
      kind: 'transcode',
      videoUrl: 'https://example/720.mp4',
      targetHeight: 360,
    });
  });

  it('judges portrait videos by their short side (reels/Shorts)', () => {
    // A portrait Instagram ladder: "1080p" is 1080x1920. Raw-height comparison
    // would reject the top two rungs for a 1080 target and pick the worst one.
    const portrait = videoItem([
      { url: 'https://example/p1080.mp4', width: 1080, height: 1920, bitrate: null, hasAudio: true },
      { url: 'https://example/p720.mp4', width: 720, height: 1280, bitrate: null, hasAudio: true },
      { url: 'https://example/p480.mp4', width: 480, height: 854, bitrate: null, hasAudio: true },
    ]);
    expect(planVideoDownload(portrait, '1080')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/p1080.mp4',
    });
    expect(planVideoDownload(portrait, '720')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/p720.mp4',
    });
    expect(planVideoDownload(portrait, '360')).toEqual({
      kind: 'transcode',
      videoUrl: 'https://example/p480.mp4',
      targetHeight: 360,
    });
  });

  it("trusts the source's ordering for formats with unknown dimensions under max", () => {
    // Instagram lists video_versions highest-first; a top rendition missing
    // width/height must not lose to a lower rung that has them.
    const item = videoItem([
      { url: 'https://example/top.mp4', width: null, height: null, bitrate: null, hasAudio: true },
      { url: 'https://example/720.mp4', width: 1280, height: 720, bitrate: null, hasAudio: true },
    ]);
    expect(planVideoDownload(item, 'max')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/top.mp4',
    });
  });

  it('transcodes to target when the source height is unknown and a cap is set', () => {
    // Instagram fallback path: single url, no formats, unknown height.
    const item: MediaItem = {
      id: 'ig',
      type: 'video',
      url: 'https://example/ig.mp4',
      thumbnailUrl: null,
      width: null,
      height: null,
      platform: 'instagram',
    };
    expect(planVideoDownload(item, '480')).toEqual({
      kind: 'transcode',
      videoUrl: 'https://example/ig.mp4',
      targetHeight: 480,
    });
  });

  it('prefers the muxed stream over a video-only one at the same resolution', () => {
    // YouTube commonly serves both a progressive 360p (muxed) and an adaptive
    // 360p (video-only). At the target we should pick the muxed one → direct.
    const item = videoItem([
      {
        url: 'https://example/360-adaptive.mp4',
        width: 640,
        height: 360,
        bitrate: 300000,
        hasAudio: false,
        audioUrl: 'https://example/audio.m4a',
      },
      {
        url: 'https://example/360-progressive.mp4',
        width: 640,
        height: 360,
        bitrate: 568000,
        hasAudio: true,
      },
    ]);
    expect(planVideoDownload(item, '360')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/360-progressive.mp4',
    });
  });

  it('downloads directly when height is unknown and preference is max', () => {
    const item: MediaItem = {
      id: 'ig',
      type: 'video',
      url: 'https://example/ig.mp4',
      thumbnailUrl: null,
      width: null,
      height: null,
      platform: 'instagram',
    };
    expect(planVideoDownload(item, 'max')).toEqual({
      kind: 'direct',
      videoUrl: 'https://example/ig.mp4',
    });
  });
});
