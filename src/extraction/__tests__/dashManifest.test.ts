import { pickDashAudioUrl, pickDashVideo } from '../dashManifest';

// Trimmed from a live Threads `video_dash_manifest` (August 2026). The attribute
// names, ordering and nesting are verbatim; only the signed BaseURLs and the long
// FB* attributes are replaced.
const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" minBufferTime="PT2S" type="static" mediaPresentationDuration="PT13.374694S"><Period id="0" duration="PT13.374694S"><AdaptationSet id="0" contentType="video" subsegmentAlignment="true" par="9:16"><Representation id="18075920843485211v" bandwidth="203348" codecs="vp09.00.30.08.00.01.01.01.00" mimeType="video/mp4" sar="1088:1089" width="540" height="960"><BaseURL>https://cdn/video-540.mp4</BaseURL><SegmentBase indexRange="818-885" timescale="30000"><Initialization range="0-817"/></SegmentBase></Representation><Representation id="18075920846485211v" bandwidth="2612000" codecs="vp09.00.40.08.00.01.01.01.00" mimeType="video/mp4" width="1088" height="1936"><BaseURL>https://cdn/video-1088.mp4</BaseURL><SegmentBase indexRange="818-885" timescale="30000"><Initialization range="0-817"/></SegmentBase></Representation></AdaptationSet><AdaptationSet id="1" contentType="audio" subsegmentStartsWithSAP="1" subsegmentAlignment="true"><Representation id="18075768467485211a" bandwidth="62303" codecs="mp4a.40.5" mimeType="audio/mp4" audioSamplingRate="44100"><AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/><BaseURL>https://cdn/audio-62k.m4a</BaseURL><SegmentBase indexRange="824-939" timescale="44100"><Initialization range="0-823"/></SegmentBase></Representation></AdaptationSet></Period></MPD>`;

describe('pickDashAudioUrl', () => {
  it('returns the audio AdaptationSet BaseURL', () => {
    expect(pickDashAudioUrl(MANIFEST)).toBe('https://cdn/audio-62k.m4a');
  });

  it('never returns a video representation, even the highest-bandwidth one', () => {
    // The video reps are VP9 (iOS cannot carry that in MP4, MediaMuxer support is
    // patchy), so they must not leak into the audio path.
    const url = pickDashAudioUrl(MANIFEST);
    expect(url).not.toContain('video');
    expect(url).not.toContain('1088');
  });

  it('picks the highest-bandwidth audio rendition when several exist', () => {
    const multi = MANIFEST.replace(
      '<BaseURL>https://cdn/audio-62k.m4a</BaseURL><SegmentBase indexRange="824-939" timescale="44100"><Initialization range="0-823"/></SegmentBase></Representation>',
      '<BaseURL>https://cdn/audio-62k.m4a</BaseURL></Representation>' +
        '<Representation id="x" bandwidth="128000" codecs="mp4a.40.2" mimeType="audio/mp4"><BaseURL>https://cdn/audio-128k.m4a</BaseURL></Representation>'
    );
    expect(pickDashAudioUrl(multi)).toBe('https://cdn/audio-128k.m4a');
  });

  it('falls back to the codecs string when contentType is absent', () => {
    const noContentType = MANIFEST.replace('contentType="audio" ', '');
    expect(pickDashAudioUrl(noContentType)).toBe('https://cdn/audio-62k.m4a');
  });

  it('returns null for a manifest with no audio set', () => {
    const videoOnly = MANIFEST.replace(
      /<AdaptationSet id="1"[\s\S]*?<\/AdaptationSet>/,
      ''
    );
    expect(pickDashAudioUrl(videoOnly)).toBeNull();
  });

  it('returns null for absent, empty or non-string manifests', () => {
    // Posts with is_dash_eligible = 0 carry no manifest at all.
    expect(pickDashAudioUrl(undefined)).toBeNull();
    expect(pickDashAudioUrl(null)).toBeNull();
    expect(pickDashAudioUrl('')).toBeNull();
    expect(pickDashAudioUrl(42)).toBeNull();
  });

  it('survives a truncated manifest without throwing', () => {
    expect(pickDashAudioUrl(MANIFEST.slice(0, MANIFEST.length / 2))).toBeNull();
  });
});

describe('pickDashAudioUrl — XML entity decoding', () => {
  // Meta's real BaseURLs are signed and carry query strings, so every `&` arrives
  // escaped as `&amp;`. Leaving them encoded makes the CDN answer 403 — verified
  // against a live manifest whose raw URL had 11 of them.
  const SIGNED = `<MPD><Period><AdaptationSet contentType="audio">
    <Representation bandwidth="62303" codecs="mp4a.40.5" mimeType="audio/mp4">
      <BaseURL>https://cdn.fbcdn.net/v/audio.m4a?efg=eyJ2IjoxfQ&amp;_nc_ht=cdn&amp;oh=00_AbC&amp;oe=68A1</BaseURL>
    </Representation></AdaptationSet></Period></MPD>`;

  it('decodes &amp; so the signed URL is usable', () => {
    const url = pickDashAudioUrl(SIGNED);
    expect(url).toBe(
      'https://cdn.fbcdn.net/v/audio.m4a?efg=eyJ2IjoxfQ&_nc_ht=cdn&oh=00_AbC&oe=68A1'
    );
    expect(url).not.toContain('&amp;');
  });

  it('decodes the other XML entities and numeric references', () => {
    const manifest = SIGNED.replace(
      'oe=68A1',
      'a=&lt;&gt;&quot;&apos;&#61;&#x41;'
    );
    expect(pickDashAudioUrl(manifest)).toContain('a=<>"\'=A');
  });

  it('does not double-decode: &amp;lt; stays a literal &lt;', () => {
    const manifest = SIGNED.replace('oe=68A1', 'q=&amp;lt;');
    expect(pickDashAudioUrl(manifest)).toContain('q=&lt;');
  });
});

describe('pickDashVideo', () => {
  it('returns the largest video representation with decoded url and dimensions', () => {
    expect(pickDashVideo(MANIFEST)).toEqual({
      url: 'https://cdn/video-1088.mp4',
      width: 1088,
      height: 1936,
      codecs: 'vp09.00.40.08.00.01.01.01.00',
      bandwidth: 2612000,
    });
  });

  it('returns null for missing manifests', () => {
    expect(pickDashVideo(null)).toBeNull();
    expect(pickDashVideo('')).toBeNull();
  });
});
