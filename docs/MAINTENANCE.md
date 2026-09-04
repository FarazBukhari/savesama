# SaveSama — Maintenance & Operations Notes

Practical, breakage-prone, and operational knowledge for working on this app.
Keep this current as things change.

---

## 1. If Instagram extraction breaks (most likely failure)

Instagram extraction is the one part that depends on Instagram's private internals,
so it's the thing most likely to break when Meta changes something. Everything you'd
need to adjust lives in two files:

- [`src/extraction/instagram.ts`](../src/extraction/instagram.ts)
- [`src/extraction/http.ts`](../src/extraction/http.ts)

**Read this first: the primary path is authenticated, not anonymous.** Since `b7b2b3a`,
`extractInstagram` tries [`WebViewSessionResolver`](../src/components/WebViewSessionResolver.tsx)'s
WebView fetch (`api/v1/media/<pk>/info/` with the user's own session) *before* any
anonymous strategy. Downloads therefore run as the signed-in user, against media that
user's own account is already permitted to view. See §10 for the same mechanism on Threads.

⚠️ **The anonymous fallback does run on device — an earlier version of this note claimed
it couldn't.** [`App.tsx`](../App.tsx) mounts a resolver for both platforms
unconditionally, so `getFetcher('instagram')` is always populated outside tests. But
`extractViaAuthenticatedFetch` returns `null` on any non-2xx body
([`instagram.ts:65`](../src/extraction/instagram.ts)), and `extractInstagram` then falls
straight through to `fetchViaGraphQl` and `fetchViaEmbed`. So the recipe below is reached
whenever an authenticated fetch fails for a reason other than a cancelled login — not only
in the web build, jest, and `scripts/e2e-extract.ts`.

Anonymous status as of **August 2026** (re-probed against live Instagram):

| Strategy | State |
| --- | --- |
| `fetchViaGraphQl` | **Works.** doc_id `10015901848480474` still live; returns full media incl. `video_url`. |
| `fetchViaEmbed` (crawler UA) | Works, **poster image only** — no `video_url`. |
| `fetchViaOgTags` | **Removed.** Post pages serve no `og:` tags to a desktop UA; with a crawler UA they yield only `og:image`, which `fetchViaEmbed` already covers. |

⚠️ The commit message on `b7b2b3a` claims all three anonymous strategies fail. That was
true when the authenticated path was added; GraphQL has since started working again. Meta
flips these back and forth — **re-probe before concluding anything is dead.**

**The working recipe for the anonymous fallback (verified August 2026):**

1. GET `https://www.instagram.com/` and read the anonymous token from the page **body**
   via `csrf_token":"<token>"` (in `getInstagramCsrfToken`, `http.ts`).
   - ⚠️ Do **not** read it from the `Set-Cookie` header — React Native (especially iOS)
     consumes Set-Cookie into the native cookie store and doesn't expose it to `fetch`.
2. POST `https://www.instagram.com/graphql/query` with:
   - body: `variables={"shortcode":"<code>",...}&doc_id=10015901848480474`
   - headers: `X-IG-App-ID: 936619743392459`, `X-CSRFToken: <token>`,
     `Cookie: csrftoken=<token>`

**Constants to check first if it breaks** (top of `instagram.ts`):

| Constant | Current value | What it is |
| --- | --- | --- |
| `GRAPHQL_DOC_ID` | `10015901848480474` | Persisted ID for `PolarisPostActionLoadPostQueryQuery`. Meta rotates it; a retired id makes **every** post fail. (Was `8845758582119845` until June 2026.) |
| `IG_APP_ID` | `936619743392459` | Public web app id. Rarely changes. |

⚠️ **The #1 breakage symptom: a rotated `doc_id`.** When the id is retired,
`/graphql/query` still returns **HTTP 200** but the body is
`{"errors":[{"message":"execution error","severity":"CRITICAL"}],"data":null}` for
*every* post — which surfaces in the app as the generic "Could not read this Instagram
post…" error. Fix = find the current id and bump `GRAPHQL_DOC_ID`. To grab a fresh id:
load a public post in a logged-out desktop browser with devtools open, filter Network for
`graphql/query`, and read the `doc_id` form field off the
`PolarisPostActionLoadPostQueryQuery` request.

**Known dead ends — don't waste time re-trying these:**

- `https://www.instagram.com/api/graphql` — **walled** for anonymous clients (serves a
  ~594 KB logged-out HTML shell, not JSON).
- `og:image` / `og:video` meta tags on logged-out post pages — **removed** by Instagram.
- The mobile `i.instagram.com/api/v1/media/<id>/info/` endpoint — **requires auth** (serves
  the logged-out app shell otherwise).

The `fetchViaEmbed` fallback works only with a **crawler user-agent**
(`CRAWLER_USER_AGENT` = `facebookexternalhit/...` in `http.ts`): the embed page
server-renders media for link-preview bots but ships an empty JS shell to a normal desktop
UA. It's still just a backstop (it can't get a reel's `video_url`, only the poster image) —
of the anonymous strategies, GraphQL is the one that matters.

### How to test extraction fast (no device needed)

There's a manual end-to-end tester that runs the **real** extraction code against live
Instagram from your machine:

```bash
npx tsx scripts/e2e-extract.ts "https://www.instagram.com/p/<shortcode>/"
npx tsx scripts/e2e-extract.ts "https://www.instagram.com/reel/<shortcode>/"
```

It prints the resolved username and each media item's type + URL, or the friendly error.
Use any current public post. If this works but the app doesn't, the problem is
React-Native-specific (headers, cookies); if this fails too, the strategy/constants are
stale.

The regression test [`src/extraction/__tests__/instagram.fetch.test.ts`](../src/extraction/__tests__/instagram.fetch.test.ts)
mocks `fetch` and asserts the GET-token-then-POST-to-`/graphql/query` flow, so an
accidental revert to `/api/graphql` or a dropped CSRF header fails CI.

---

## 2. Song / audio pages (`/reels/audio/<id>`) — intentionally unsupported

Links to a song page (e.g. `https://www.instagram.com/reels/audio/1273422726399305`)
are recognized by `parseLink` (`unsupported: 'audio'`) and rejected in
[`extract.ts`](../src/extraction/extract.ts) with a clear "Downloading songs isn’t
supported" message — **not** a generic failure.

**Why it can't be done on-device (probed June 2026):**

- The audio page is a JS shell — no media/audio data in the logged-out HTML.
- `api/v1/clips/music/` → returns an **empty** body for anonymous clients.
- `api/v1/music/audio_reels_media/?audio_cluster_id=<id>` → `500`/`404` (auth-gated).
- The audio-page GraphQL `doc_id` lives in lazy JS bundles and rotates (fragile).
- Even **with** a logged-in `sessionid`, Instagram serves the **full** asset only for
  *original sounds* (`original_sound_info.progressive_download_url`); licensed/label
  music returns only a short **preview snippet** (`web_30s_preview…`) — a rights wall,
  not a tech wall.

⚠️ Note: `parseLink` must test `IG_AUDIO_PATH` **before** `IG_POST_PATH`, otherwise the
post regex captures the literal `"audio"` as a shortcode. There's a regression test for
this in [`urlParser.test.ts`](../src/extraction/__tests__/urlParser.test.ts).

**If you ever wire up song pages:** a small backend or an in-app WebView using the
user's own session.

Note this is **separate** from "Save as Audio" (§7, §11): that feature saves the audio of a
**reel/video** the user is downloading — it doesn't touch song-page links. It works today and
needs no auth, and as of §11 it downloads only the audio stream rather than the whole video.

---

## 3. Build & release (EAS)

- The project is linked to EAS as **`@farazbukhari/savesama`**
  (projectId `56b9a925-7dc3-4721-bb0d-0cebbe602a50`, in `app.json` → `extra.eas`, and the
  same id in `updates.url` — these two must match or OTA resolves against the wrong project).
- Preview APK (sideload on any Android phone):

  ```bash
  eas build --profile preview --platform android
  ```

- CI ([`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml)) builds the
  APK on **pushes/merges to `main`** automatically, and on demand for any branch:
  `gh workflow run build-apk.yml --ref <branch> -f profile=preview`. A `push` event carries
  no `inputs`, so the workflow's `default: preview` does **not** apply — the job sets
  `PROFILE: ${{ inputs.profile || 'preview' }}` and every step uses `$PROFILE`. Don't
  reintroduce a bare `${{ inputs.profile }}` in a step or push builds get an empty profile.
- Profiles live in [`eas.json`](../eas.json): `preview` and `development` produce an APK
  (`buildType: apk`); `production` is set up for store builds.
- **Expo Go does not work** — `expo-share-intent` needs a native build. Use the preview
  APK or a `development` build.

---

## 4. Environment gotchas

### nvm lazy-loader is broken in non-interactive shells
Calling `node` / `npm` / `npx` / `eas` by bare name spews
`command not found: _lazy_load_nvm` and fails. **Always use full paths:**

```bash
~/.nvm/versions/node/v22.13.1/bin/npm   # also node, npx, eas
```

For commands that spawn child tools, export the bin dir first so children resolve them:

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
```

### Never let tooling write `appExtensions` into `app.json`
`eas init` / some EAS commands try to serialize
`extra.eas.build.experimental.ios.appExtensions` (a duplicated `ShareExtension` block)
into `app.json`. The `expo-share-intent` plugin adds its iOS share extension dynamically,
so a static copy makes `expo config` fail with a duplicate-target error. If `expo config`
or `expo-doctor` starts failing, check for and delete that block.

### `tsconfig.json` needs `"types": ["jest"]`
TypeScript 6 doesn't auto-include `@types/jest`. Without
`compilerOptions.types: ["jest"]`, `tsc --noEmit` errors on `describe`/`it`/`expect` in
test files. (Use `globalThis.fetch`, not `global.fetch`, in tests — `global` isn't in the
restricted `types` scope.)

---

## 5. Verify before shipping

```bash
npm run typecheck          # tsc --noEmit
npm test                   # jest (197 tests)
npx expo-doctor            # 21/21 checks
npx expo export --platform android --output-dir /tmp/savesama-check && rm -rf /tmp/savesama-check
```

---

## 6. Ads — deliberately none

There was an `AdBanner` placeholder reserving 60dp at the bottom of the screen, sized for
an AdMob adaptive banner. It was removed rather than filled, because the plan behind it
does not survive contact with the policies:

- **Google Publisher Policies** (which govern AdMob) prohibit "software … that enable[s]
  unauthorized streaming, sharing, copying, or downloading of copyrighted content …
  including … works by independent artists." That describes this app, and it is not
  YouTube-specific — Instagram and Threads posts are copyrighted by their posters, so
  dropping YouTube support would not change the analysis.
- Enforcement is **account-level**, not app-level: an AdMob strike lands on the Google
  account, taking the Play developer account and payments profile with it.
- Ad size, count, and placement are irrelevant. The clause is about what the app does.

The same reasoning rules out Google Play as a distribution channel (see
§ [Build & release](#3-build--release-eas)). F-Droid has no equivalent copyright clause
and would accept the app, but the AdMob SDK is proprietary and fails F-Droid's free
software requirement — so every channel that would host SaveSama is one where ads are
unavailable.

If revenue is wanted, it has to come from donations or a paid tier, not ads.

---

## 7. The media engine: FFmpeg first, platform codecs as fallback

Everything that rewrites a media file — "Save as Audio" (M4A), the YouTube 1080p mux,
and the downscale for a capped resolution — lives in the local Expo module
[`modules/savesama-audio-extractor`](../modules/savesama-audio-extractor). On Android each
call tries **FFmpeg** first and falls back to the platform implementation when the command
fails; iOS keeps its AVFoundation implementation and has no FFmpeg.

| Function | FFmpeg command (Android) | Fallback |
| --- | --- | --- |
| `extractAudio` | `-vn -map 0:a:0 -c:a copy -f ipod`; retried with `-c:a aac -b:a 160k` if the track isn't MP4-compatible | `MediaExtractor` + `MediaMuxer` |
| `muxVideoAudio` | `-map 0:v:0 -map 1:a:0 -c copy -movflags +faststart -shortest -f mp4` | two `MediaExtractor`s + `MediaMuxer` |
| `transcodeVideo` | `-vf scale=W:H -c:v h264_mediacodec -b:v N -pix_fmt yuv420p -c:a copy` (hardware encoder; bitrate ≈ 2.5 bits/pixel/s, clamped 0.4–12 Mbps) | Media3 Transformer (§9) |
| `ffmpegVersion` | `FFmpegKitConfig.getFFmpegVersion()` — Settings → About shows it | `null` |

Failures are logged under the `SaveSamaMedia` tag with the last 1500 chars of FFmpeg's
own log, so `adb logcat -s SaveSamaMedia` shows why a command fell back.

### Where FFmpeg comes from (and why it isn't the newest)

Arthenica **retired ffmpeg-kit** (Jan 2025) and **pulled every binary** from Maven Central,
CocoaPods and npm on Apr 1 2025 — `com.arthenica:ffmpeg-kit-*` resolves only for people
with a warm Gradle cache. The repo itself was archived Jul 2026. Its successor,
[FFmpegKitNext](https://github.com/arthenica/ffmpeg-kit-next) (FFmpeg **9.0.1** as of
v9.0.0, Aug 2026), is **source-only**: no Maven, no CocoaPods, no npm, and the Android build
goes through Nix and takes hours.

What the app uses instead (verified Sept 2026, by downloading and inspecting the AAR):

```
implementation "com.moizhassan.ffmpeg:ffmpeg-kit-16kb:6.1.1"   // module build.gradle
```

- On **Maven Central**, so EAS cloud builds resolve it with no download script.
- ffmpeg-kit 6.x wrapper around **FFmpeg 6.0** (`libavutil` reports `n6.0`), built with
  `--enable-gpl`, `libvpx`, `libaom`, `dav1d`, `libmp3lame`, `libopus`, `libopenh264`,
  `--enable-mediacodec` (so `h264_mediacodec` / `hevc_mediacodec` encoders exist) — the
  `full-gpl` feature set minus x264/x265.
- Every `.so` has `PT_LOAD` alignment **16384**: it loads on Android 15+ devices booted with
  16 KB pages. The other community forks checked (`@nikhil-cephei/ffmpeg-kit-react-native`,
  `kroog-ffmpeg-kit-react-native`, `ffmpeg-kit-react-native-community`) ship 4 KB-aligned
  libs and crash there.
- Four ABIs, 84 MB AAR; the preview profile's `reactNativeArchitectures` filter packages
  only arm64-v8a + armeabi-v7a, so the APK grows by roughly 40 MB.

⚠️ **Licence:** this build is GPL (the `--enable-gpl` flag). The app is MIT and sideload-only,
which is compatible, but the resulting APK is a GPL-licensed distribution. Don't ship it
to a store that objects to that without switching to an LGPL build.

⚠️ **`libc++_shared.so` collision.** ffmpeg-kit bundles its own `libc++_shared.so`, and so
does React Native. `app.json` carries
`["expo-build-properties", { android: { packagingOptions: { pickFirst: ["**/libc++_shared.so"] } } }]`
for that reason. Remove it and `:app:mergeReleaseNativeLibs` fails with a duplicate-file error.

**Upgrading to a newer FFmpeg core** means building FFmpegKitNext yourself:
`nix-android.sh` in that repo emits an AAR; publish it to a local Maven repo (or check it
into `modules/savesama-audio-extractor/android/libs` with a `flatDir`), swap the
`implementation` line, and keep the `--enable-gpl`/mediacodec/libvpx flags so the three
commands above keep working. The Java API (`FFmpegKit.executeWithArguments`, `ReturnCode`)
is unchanged between 6.x and Next.

### Gotchas

- The module is **autolinked** because it lives in `modules/`. Any change to its native
  code, `build.gradle` or `expo-module.config.json` needs a **new native build** — Metro or
  `expo export` alone won't pick it up. It also won't run in Expo Go or jest (native module
  absent); no test imports `download.ts`, so that's fine.
- `transcodeVideo` runs FFmpeg on Expo's worker thread and only hops to the main looper for
  the Media3 fallback (Transformer must be built, started and listened to on one Looper).
- Meta's DASH audio is HE-AAC in a fragmented MP4. FFmpeg's `-c:a copy` into `ipod` handles
  it; the old MediaMuxer path sometimes didn't, which is why `downloadAudioStream` still
  saves the raw stream if both fail.

---

## 8. YouTube extraction

YouTube support lives in [`src/extraction/youtube.ts`](../src/extraction/youtube.ts) and is
wired into the same flow as Instagram: `parseLink` detects the link, `extractMedia`
dispatches to `extractYouTube`, and the result is a single video `MediaItem` that flows
through the normal download / "Save as video|audio" path. No native or download changes
were needed — the audio remux (§7) reads the AAC track straight out of the YouTube MP4.

**The working recipe (verified June 2026):**

1. POST `https://www.youtube.com/youtubei/v1/visitor_id` with the ANDROID_VR client context
   and read `responseContext.visitorData` — an anonymous session token (cached per process).
2. POST `https://www.youtube.com/youtubei/v1/player` (no API key) with the **ANDROID_VR**
   client context, the `videoId`, **and that `visitorData`** (sent both in
   `context.client.visitorData` and the `X-Goog-Visitor-Id` header).

Mobile/VR clients return progressive stream URLs **directly** in
`streamingData.formats[].url` — not signature-ciphered — so no player-JS deciphering is
needed and extraction stays fully on-device.

⚠️ **The `visitorData` token is not optional.** Without it, YouTube bot-checks *many* videos
(`LOGIN_REQUIRED` / "confirm you're not a bot") **even on residential IPs** — this is what
made real-device downloads fail before the token was added. It's the YouTube analogue of
Instagram's anonymous CSRF token (§1): fetch a session token first, send it with every call.
If the player response still comes back as a bot-check, `extractYouTube` refreshes the
`visitorData` once and retries before surfacing an error.

The default `MediaItem.url` is still a **progressive** format (muxed audio + video)
from `streamingData.formats`, highest resolution first — progressive caps at **itag 22
(720p)**, usually only **itag 18 (360p)** is served. As of the resolution-selection
feature, `mapPlayerResponse` *also* attaches a full `formats` ladder via `buildFormats`:
progressive streams (`hasAudio: true`) plus **adaptive H.264/MP4 video-only** streams
(1080p+, `hasAudio: false`) each paired with the best **adaptive AAC/M4A audio** stream
(`audioUrl`). The download layer selects a rung from this ladder per the user's
per-platform preference and muxes the HD pairs on-device — see §9. VP9/Opus/WebM adaptive
variants are excluded because they can't passthrough into an MP4 container.

**Constants to check first if it breaks** (top of `youtube.ts`):

| Constant | Current value | What it is |
| --- | --- | --- |
| `CLIENT_NAME` | `ANDROID_VR` | InnerTube client. The plain web/`ANDROID`/`IOS` clients now fail an attestation/PoToken "precondition check" or omit progressive formats for anonymous callers. |
| `CLIENT_VERSION` | `1.60.19` | ANDROID_VR app version. Bump if requests start failing. |
| `CLIENT_NAME_ID` | `28` | `X-YouTube-Client-Name` for ANDROID_VR. |

**Known dead ends — don't waste time re-trying these:**

- Calling `player` **without `visitorData`** → `LOGIN_REQUIRED` "confirm you're not a bot"
  on many videos, regardless of IP. (Fetch the token first — see step 1.)
- `clientName: "ANDROID"` (key `AIzaSy…39w`) → **400 "Precondition check failed"** for
  anonymous callers (now needs a PoToken/attestation).
- `clientName: "IOS"` → returns **no progressive** formats (everything in `adaptiveFormats`).
- The web client → progressive URLs are **signature-ciphered** (need player-JS `s`/`n`
  deciphering) — not feasible on-device without a JS engine.

**If a bot-check persists** even after the token refresh, `playabilityError` reports it as a
**retryable** block ("YouTube is temporarily blocking… try again"), distinct from genuine
age-restricted/private videos ("needs sign-in"). A persistent bot-check on a residential IP
likely means YouTube now demands a real **PoToken** for that video — which needs BotGuard JS
(a WebView or a backend), the point at which the no-backend approach reaches its limit.

### How to test fast (no device needed)

```bash
npx tsx scripts/e2e-extract.ts "https://www.youtube.com/watch?v=<id>"
npx tsx scripts/e2e-extract.ts "https://youtu.be/<id>"
```

Prints the channel, item count, and the resolved `googlevideo.com` URL — or the friendly
error. The progressive URL is a plain MP4 served with 302→206; `FileSystem`'s downloader
follows the redirect automatically, so no special headers are needed on the download.

The mocked regression tests are
[`youtube.test.ts`](../src/extraction/__tests__/youtube.test.ts) (pure format-picking:
prefers 720p, ignores adaptive/ciphered) and
[`youtube.fetch.test.ts`](../src/extraction/__tests__/youtube.fetch.test.ts) (asserts the
ANDROID_VR POST and the bot/login error branches).

### HD (1080p+) — supported via on-device muxing

1080p and above are only offered as **separate** video-only + audio-only adaptive streams,
so the app downloads both and combines them with an on-device **muxer** (video + audio →
MP4, no re-encode). This lives in `savesama-audio-extractor` (§7) as `muxVideoAudio` (Android
`MediaMuxer` with both a `video/*` and `audio/*` track; iOS `AVMutableComposition` + a
passthrough export). `youtube.ts` `buildFormats` only ever pairs an **H.264/MP4 video-only**
stream with the **AAC/M4A (itag 140) audio-only** stream so the passthrough mux is valid;
VP9/Opus/WebM are excluded. See §9 for how the resolution preference drives it.

---

## 9. Resolution selection & the Settings screen

Users pick a **default download resolution per platform** (Instagram / YouTube) on the
**Settings** tab. Preferences persist to `${documentDirectory}savesama-preferences.json` via
`src/services/preferences.ts` (a module singleton + `useSyncExternalStore` hook,
`src/hooks/usePreferences.ts`). `loadPreferences()` is **idempotent** (one disk read,
cached promise) and is both warmed at launch in `App.tsx` and awaited by
`downloadToGallery`, so a cold-launch download can't race past the saved value; a save
made while the initial read is still in flight wins over the disk contents (`dirty` flag).
Default is `'max'`. Note `'max'` on YouTube now prefers a 1080p adaptive pair (muxed
on-device) over the 720p progressive stream — with an automatic **fallback to the
progressive `item.url`** if the HD downloads or the mux fail, so no video that downloaded
before the feature can fail because of it.

**Resolution semantics: targets are the conventional short side.** Portrait videos
(reels, Shorts) store the long side in `height` (a "1080p" reel is 1080x1920), so all
comparisons use `min(width, height)` when both are known (`effectiveResolution` in
`resolutionPlan.ts`), and `targetHeight` handed to the native transcoder means "short
side". Formats with unknown dimensions sort first under `'max'`, trusting the source's
highest-first ordering.

At download time `src/services/resolutionPlan.ts` `planVideoDownload` turns the item's
`formats` ladder + the preference into one of three strategies, executed in
`src/services/download.ts`:

- **`direct`** — chosen rung is muxed (progressive / Instagram `video_versions`): download it.
- **`mux`** — chosen rung is a YouTube adaptive video-only stream: download video + its
  paired audio **in parallel** and `muxVideoAudio` them (see §8); falls back to the
  progressive stream on any failure.
- **`transcode`** — the source has no rung at/below the target: download the smallest
  **muxed** rung (never a video-only stream — the transcode path does no muxing, so that
  would save a silent video) and downscale it with `transcodeVideo`.

`transcodeVideo` is a real decode+scale+re-encode (not a remux). On **iOS** it uses
`AVAssetExportSession` presets chosen so the *fitted output's short side* covers the
target for the source's actual orientation (up to `1920x1080`), and it **copies the file
through unchanged** when the source is already at/below the target — no pointless lossy
re-encode (this covers the Instagram embed/og fallback paths, whose dimensions are
unknown at plan time). **Android** uses **Media3 Transformer** (`androidx.media3:media3-transformer`,
pinned with `media3-effect`/`media3-common` at one version in the module's `build.gradle`),
so `isTranscodeSupported()` is now `true` on both platforms.

⚠️ **`targetHeight` means the SHORT side**, not the literal height — "480p" = shorter
dimension near 480, whatever the orientation. `resolutionPlan.ts` (`effectiveResolution`),
the Swift, and the Kotlin all agree on this, and they must keep agreeing. Media3's
`Presentation.createForHeight` is *height*-based, so it is deliberately **not** used: a
portrait 716x1274 reel at a 480 target would come out 270x480 — over-shrunk by the aspect
ratio. The Kotlin instead reads orientation-corrected dimensions via
`MediaMetadataRetriever` (a 90°/270° rotation means swapping raw width/height), computes an
even-pixel output box, and passes it to `Presentation.createForWidthAndHeight(..., LAYOUT_SCALE_TO_FIT)`.
Odd dimensions are rounded down to even because many H.264 encoders reject them.

Other Android specifics worth not rediscovering:

- Transformer must be built, started, and listened to on **one Looper thread**; Expo runs
  `AsyncFunction` bodies off the main thread, so the call hops to the main looper first.
- Nearly every Transformer/effect class is `@UnstableApi`, so the Kotlin needs
  `@OptIn(UnstableApi::class)` or it won't compile.
- `ExportException`s whose `errorCode` is a decoder/encoder capability failure are
  re-reported as **`ERR_TRANSCODE_UNSUPPORTED`**, which `downloadTranscoded` degrades on
  (saves the original rather than failing the download). Any other export failure surfaces
  as a real `DownloadError`, so transcoder regressions stay visible.

**Instagram/Threads video: `video_versions` is not a ladder, but a ladder does exist.**

`video_versions` looks like a quality ladder and is not — its entries are the *same*
resolution, differing only by `type` (101/102/103). Verified August 2026:

```
pk 3956341135589369127: original 480x600   → video_versions [480x600 t101, 480x600 t102, 480x600 t103]
pk 3956124961814886073: original 1088x1936 → video_versions [716x1274 t101, 716x1274 t102, 716x1274 t103]
```

A real ladder *is* published, in the `video_dash_manifest` field on the same payload — and
it includes the full original the muxed renditions don't expose:

```
video_versions → 716x1274 only
DASH manifest  → 540x960 @203kbps, 716x1274 @302/408/591/823/1129/1609kbps, 1088x1936 @2612kbps
```

⚠️ We deliberately do **not** take video from the manifest. Those representations are
**VP9**: iOS cannot carry VP9 in an MP4 at all, Android's `MediaMuxer` support for it is
uneven, and gallery/player compatibility varies. Using them would mean either muxing
VP9+AAC (compatibility risk) or transcoding to H.264 (slow) — so video still comes from
`video_versions`, and a test in `instagramApi.test.ts` pins that.

**Known, deliberately-deferred limitation:** because of the above, "Max" tops out at
716x1274 for these posts even though a 1088x1936 rendition exists. Lifting that ceiling
means solving the VP9 container problem first. This is a choice, not an oversight.

Consequence for capped preferences: since only one muxed rendition is served, a target
below it can only be honoured by re-encoding — which is exactly why the feature appeared to
do nothing on Android before the transcoder existed. Only the manifest's *audio* stream is
used (see §11).


### Photos honour the preference without any re-encoding

`image_versions2.candidates` *is* a real ladder (640x1138, 480x854, 320x569, 240x427), so
`pickImageUrl` just picks a rung — no transcoder involved. But the candidate list also
contains **square centre-crops at the same short-side sizes** (640x640, 480x480, 320x320,
240x240, 150x150). Ranking by size alone ties 480x854 with 480x480 for a 480 target, and
choosing the crop would silently save a *cropped* photo. `buildImageFormats`
(`instagramApi.ts`) therefore keeps only candidates whose aspect ratio matches the post's
own (`original_width`/`original_height`, falling back to the largest candidate, which is
always full-frame). There is a regression test asserting no crop is ever selected.

Note the largest candidate is typically 640px on the short side, so a 720 or 1080 *photo*
preference is a no-op that returns the original — correct, but don't describe it as
"1080p photos".

---

## 10. Threads extraction (authenticated only)

Threads has **no anonymous path at all** — do not spend time looking for one. A logged-out
client gets:

- post pages → 302 to the Instagram OAuth login,
- `api/v1/media/<pk>/info/` → the HTML app shell at **status 200** (this is what
  `isLoginRequired` detects by sniffing a leading `<`).

So [`extractThreads`](../src/extraction/threads.ts) always goes through
[`WebViewSessionResolver`](../src/components/WebViewSessionResolver.tsx)'s WebView, which holds
the user's threads.com session. With no resolver mounted (web build, jest, `scripts/e2e-extract.ts`) it
fails fast with "Threads downloads need the app's sign-in view".

**The working recipe (verified August 2026):**

1. Decode the post code to the numeric media id with `shortcodeToMediaId` — Threads uses the
   **same** url-safe-base64 encoding as Instagram shortcodes
   (`DblSWtPD9-n` → `3955648572951617447`).
2. From a page loaded on the **threads.com** origin, `fetch`
   `https://www.threads.com/api/v1/media/<pk>/info/` with header
   `X-IG-App-ID: 238260118697367` and `credentials: 'include'`.
3. The payload is Instagram's private-API shape verbatim, so `mapMediaInfo` is shared —
   only `platform` differs. `media_type`: 1 = image, 2 = video, 8 = carousel
   (`carousel_media`), **19 = text-only post** (no media; surfaced as "no photo or video
   to download").

| Constant | Current value | What it is |
| --- | --- | --- |
| `THREADS_APP_ID` | `238260118697367` | Threads web app id (`threadsApi.ts`). Stable, unlike a doc_id. |

⚠️ **Wrong-app-id failure signature:** sending Instagram's `936619743392459` to the Threads
endpoint returns `400 {"message":"Media not found or unavailable","status":"fail"}` — which
reads like a deleted post but is an app-id error. The reverse also holds: a Threads pk on
`instagram.com/api/v1/...` fails the same way. The two graphs are separate.

### Share links need a crawler user-agent

The Threads app's share sheet emits `https://www.threads.com/share/<token>/`, which carries
no post code. Resolving it is **UA-dependent**:

- desktop UA → `200` + logged-out app shell, **no redirect**, code never revealed;
- crawler UA (`facebookexternalhit/...`) → `302 Location:
  https://www.threads.com/@user/post/<code>`.

Hence `resolveShareLink` in [`extract.ts`](../src/extraction/extract.ts) passes
`CRAWLER_USER_AGENT` for Threads and the desktop UA for Instagram. The resolved URL carries
tracking params (`?xmt=…&slof=1`) that `parseLink` strips.

### The login predicate is the fragile part

Threads sign-in is an OAuth round trip **through instagram.com**:

```
threads.com/login
  -> instagram.com/accounts/login/?…&next=instagram.com/oauth/oidc/?redirect_uri=threads.com/login/oidc/
  -> threads.com/login/oidc/?code=…
  -> threads.com/
```

The "signed in" predicate must therefore return **false for every instagram.com URL**. If it
matches mid-OAuth, the modal closes early, the retry hits a still-unauthenticated
threads.com origin, gets the HTML shell, and **re-opens the modal in a loop**. Bare
`threads.com/` counts as signed in only *before* the instagram.com hop (the "already had a
session, `/login` bounced to the feed" case) — that's what the `sawInstagram` flag guards.
If a user reports the login sheet reopening forever, this predicate is the first suspect.

### How to test fast

`scripts/e2e-extract.ts` can't extract Threads (no WebView), but the two halves are testable
separately:

- URL parsing + share resolution: `urlParser.test.ts` / `extract.test.ts`.
- The media-info call: open threads.com logged-in in a desktop browser and run the `fetch`
  from step 2 in the devtools console. If that returns JSON but the app doesn't, the problem
  is in the WebView/session layer, not the recipe.

---

## 11. Audio-only downloads

"Save as Audio" used to download the whole video and strip the track out. Both sources
publish a standalone audio stream, so it now fetches only that — `item.audioOnlyUrl`.

| Source | Where the audio stream comes from |
| --- | --- |
| YouTube | the adaptive AAC stream (itag 140), already parsed for the HD mux path |
| Instagram / Threads | the `audio` AdaptationSet inside `video_dash_manifest` (AAC, ~62kbps) |

Verified August 2026: a plain GET of Meta's audio `BaseURL` returns a **complete fragmented
MP4** — `ftyp + moov + sidx + moof/mdat×7`, 105,100 bytes for 62.3kbps × 13.374s. So despite
the `SegmentBase indexRange` attribute, **no range-driven segment assembly is needed**. That
turns a 13s reel's audio save from ~1.8MB into ~105KB.

[`dashManifest.ts`](../src/extraction/dashManifest.ts) reads the manifest with plain string
matching — React Native has no `DOMParser` and one field doesn't justify an XML dependency.
Tests use the verbatim tag shape from a live manifest.

⚠️⚠️ **Decode the XML entities in `<BaseURL>`.** The manifest is XML, so every `&` in the
signed query string arrives as `&amp;`. A URL with 11 of them answers **403**; decoded, the
same URL answers 200. This shipped broken once precisely because a browser devtools probe
uses `DOMParser`, which decodes entities implicitly — so the probe passed while the app's
regex-extracted URL failed. YouTube audio was unaffected because its URL comes from JSON.
If Instagram/Threads audio downloads start failing again, check this first.

Fallbacks that must stay:

- Posts with `is_dash_eligible: 0` carry no manifest → `audioOnlyUrl` is absent and the old
  download-then-strip path runs.
- Meta's DASH audio is **HE-AAC** (`mp4a.40.5`) in a *fragmented* MP4, not the AAC-LC the
  native remux normally sees. If `extractAudio` fails on it, the downloaded stream is saved
  as-is — it is already a valid audio MP4, and a container preference isn't worth failing a
  download over.

⚠️ Regex gotcha when reading manifests: `width="` also matches inside `bandwidth="`. Use a
`\b` word boundary (this bug produced nonsense dimensions during the original probe).

---

## 12. Download speed: parallel range requests

A single connection to `googlevideo` / `fbcdn` is often slower than the link allows, so an
85MB 1080p video takes far longer than its size suggests.
[`rangedDownload.ts`](../src/services/rangedDownload.ts) splits anything over **4MB** into
**4 concurrent byte ranges** and joins them. A 1-byte `Range: bytes=0-0` probe establishes
size and range support first; without a `206` and a `content-range` total, the download falls
back to one connection.

⚠️ **Unmeasured.** The speedup is a reasoned expectation, not a benchmark — YouTube's bot
check blocked repeated throughput probes from the dev machine. If a user reports no
improvement, the bottleneck may simply be their bandwidth, in which case more connections
move the same bytes in the same time.

Two correctness traps, both already handled — don't reintroduce them:

- **Never join parts as base64.** Base64 pads each part to a 4-character boundary, so
  concatenating encoded parts corrupts everything after the first unless every part length is
  a multiple of 3. Parts are streamed into one writer via SDK 56's
  `File.readableStream()` / `writableStream()`, which also keeps peak memory at one chunk
  instead of holding the whole file in JS.
- **A server that ignores `Range` answers `200` with the whole file.** Concatenating that
  with sibling parts yields a corrupt video, so a `200` on any range past the first is
  treated as a failure.

Any failure deletes every part *and* the partial output, then retries on a single connection.

---

## 13. The download queue and the background service

[`downloadQueue.ts`](../src/services/downloadQueue.ts) owns download state at module level.
`DownloadScreen` subscribes through `useDownloadJobs`, so progress survives tab switches and
re-renders, and "Save all" queues everything at once instead of awaiting a loop.

- **Jobs run one at a time on purpose.** Each download already fans out into 4 parallel
  range requests; concurrent jobs would compete for the same bandwidth and make all of them
  slower.
- **Both queued and in-flight jobs can be cancelled.**
  [`cancellation.ts`](../src/services/cancellation.ts) provides a token per job:
  in-flight `expo-file-system` transfers register their `cancelAsync` with it and abort
  immediately, while native mux/transcode calls — which cannot be interrupted mid-call — are
  bracketed by `throwIfCancelled()` checkpoints, so a cancel during a transcode takes effect
  when it returns and the file is simply never saved. Each path's existing `finally` blocks
  delete the cache files, so nothing is left behind. A cancelled job is marked `cancelled`,
  not `error` — it is the user's own doing.
- Two subtleties the token handles: registering an abort **after** cancellation aborts
  immediately (a transfer starting in that window must not run unsupervised), and completed
  transfers **unregister** so a later cancel doesn't call `cancelAsync` on a finished handle.
- Job identity is `item.id` for photos and `item.id:<format>` for videos, so a video's audio
  and video saves are independent jobs.

[`savesama-download-service`](../modules/savesama-download-service) is an Android **foreground
service** that keeps the process alive while the queue drains. It downloads nothing: on
Android the RN JS thread keeps running while backgrounded, and it is *process death* that
interrupts a transfer. The notification a foreground service must post doubles as progress
UI (silent LOW-importance channel).

- No new npm dependency — the notification is built with `NotificationCompat` in Kotlin, so
  `expo-notifications` isn't needed.
- The service spans the whole drain, not each job, so the notification doesn't flicker and
  the process is never briefly unprotected during hand-off to a follow-up runner.
- `START_NOT_STICKY`: downloads are driven from JS, so a service restarted without that JS
  state would show progress for work that isn't happening.
- `requireNativeModule` is resolved **lazily**, not at import time. It throws when the native
  side is absent (under jest, and in any dev build predating this module), and an import-time
  throw would take down the whole queue.
- **iOS is an explicit no-op** (`isSupported()` → false): backgrounded JS is suspended there,
  so the equivalent needs a background `URLSession` owning the transfer.
- `app.json` needs `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and
  `POST_NOTIFICATIONS`. Without the last one (Android 13+) the notification is silently not
  shown, but the service still runs and downloads are unaffected.

⚠️ This module means **a new dev build is required** — autolinking a native module can't be
picked up by an existing one.

---

## 14. Settings screen contents and per-download quality override

Settings shows four sections: **Appearance** (theme mode), **Default resolution** (per
platform), **Accounts** (per-platform sign out), and **Where files are saved**.

The save locations are **display-only by design**, not an unfinished control. Android's
MediaStore roots an album by media type, so photos/videos live under `Pictures/` and audio
under `Music/` — they cannot share one folder, and SaveSama only chooses the album *name*
(`ALBUM_NAME` in `download.ts`), never the parent directory. Both rows derive their text from
that constant, so renaming the album updates the screen automatically. See the
`saveToAppAlbum` comment for why two albums exist.

**Accounts** lists the two platforms that need a session. The signed-in state shown there is
a *hint*, not the truth: the cookie lives inside the hidden WebView and there is no API to
read it, so `instagramSignedIn` / `threadsSignedIn` in preferences are written when a login
completes and cleared on sign out. The next authed request is the real test — if the hint is
stale, the login modal simply appears as it always did.

**Sign out drives the site's own logout page.** `react-native-webview` exposes no
cookie-clearing API, so `WebViewSessionResolver` registers a `signOut` handler with
`mediaSession`, which points the hidden WebView's `source` at `config.logoutUrl` and, on the
following `onLoadEnd`, back at `config.homeUrl` so the injected fetch stays same-origin. It
steers through `source` rather than injecting `location.replace` because injection silently
no-ops before the WebView's first load has finished. Adding a platform means adding its
logout URL to the `SessionConfig`.

> `THREADS_SESSION.logoutUrl` (`/logout`) has not been confirmed against a real device. If
> signing out of Threads leaves the session alive, that URL is the thing to check first.

When a platform is added, `PLATFORM_ROWS` and `ACCOUNT_ROWS` in `SettingsScreen.tsx` both
need an entry — plus the user-facing copy in `EmptyState.tsx` (steps + note),
`LinkInput.tsx` (placeholder) and `extract.ts`'s "unrecognized link" message. Threads
shipped without those for a while, which is how the app ended up supporting a platform it
never mentioned.

### Per-download quality override

Settings holds the per-platform default; the format sheet's "Video quality" row overrides it
for one save. The override travels as `job.resolution` into `downloadToGallery(item,
onProgress, override?)`, and is cleared when the sheet closes so it can't leak into the next
save or into Settings. The row reads "Default · tap to change" or "Just this download" so the
active mode is unambiguous.

Audio gets no quality choice — the source serves one audio stream.

**The format sheet stays open after an audio save, and closes after a video save.** That
asymmetry is deliberate: a video has a card row that takes over showing progress once the
sheet closes, whereas audio has no row of its own, so closing would leave the download with
nowhere to report. The Audio row shows its own percentage and ✓ Saved state instead.

**A finished job re-runs when the quality changes.** `enqueueDownload` ignores a re-queue of
a completed job so "Save all" doesn't re-download everything, but it makes two exceptions:
an explicit `force` (the user pressed Save deliberately) and a differing `resolution`, since
saving the same video at another quality is a different download. The "✓ Saved" badge stays
pressable for this reason — for videos it re-opens the format sheet, for photos it saves
again. Without that, changing the resolution after a save was a dead end.

**Download failures must be surfaced from the job, not from the call site.** Since downloads
moved into the queue, `DownloadScreen` no longer awaits them, so a failing download only
appears as `job.error`. The screen reads that into its ErrorNotice — when it didn't, a broken
audio URL looked exactly like "nothing happens".

---

## 15. YouTube bot-check backoff

`extractYouTube` retries a "confirm you're not a bot" response with a fresh `visitorData` and
a **backoff** (800ms, then 2500ms), bounded to ~3.3s of extra latency. The check is IP-based
rate limiting, so the previous instant retry usually hit the same wall. Non-bot-check
failures (age/privacy walls) still fail immediately — retrying can't clear those.

The wait is injectable (`extractYouTube(id, { sleep })`) so tests don't sleep for real.

**The durable fix is a signed-in YouTube session**, which is now plumbable via
`WebViewSessionResolver` (see §1/§10). Backoff only widens the window. Reproduction is easy:
run a handful of extractions from one IP in quick succession.


---

## 16. Theming

`theme.ts` exports `lightTheme` and `darkTheme` filling one `Theme` interface, plus the
theme-independent scales (`spacing`, `radius`, `typography`, `fonts`)
which stay plain module exports — a component that only needs spacing shouldn't need a hook.

`ThemeProvider` resolves which one is active from `preferences.themeMode`, falling back to
`useColorScheme()` when that's `'auto'`. Components read it two ways:

```ts
const theme = useTheme();                       // for inline values and icon colors
const styles = useThemedStyles(makeStyles);     // for StyleSheets
```

`makeStyles` **must** be declared at module scope. `useThemedStyles` memoises on
`[makeStyles, theme]`, so a factory defined inside the component changes identity every
render and the memo never hits.

Two rules the palette encodes:

- **Depth is a hairline, not a shadow.** `theme.shadows` has one recipe, `raised`, and only
  modals and sheets use it. Everything else separates with `borderColor: theme.colors.border`
  at `StyleSheet.hairlineWidth`. Shadows read wrong on a dark ground and needed two sets of
  values; a hairline needs one token.
- **The accent changes hue between themes.** Dark uses `#FF7A3D`; light drops to `#D04E19`
  because the brighter orange only reaches 3.1:1 on white, which fails for the small bold
  figures it sits on. Anything referencing the accent must go through the token, never a
  literal.

**Machine output is monospace.** URLs, resolutions, durations, file counts and dates use
`fonts.mono` (`Menlo` on iOS, `monospace` on Android). Human-written copy stays in the system
UI face. It's the fastest way to tell, at a glance, what SaveSama found versus what SaveSama said.

Icons are Feather from `@expo/vector-icons`. The font loads asynchronously, so `App.tsx`
gates the first render on `useFonts(Feather.font)` — without it every icon is a blank box
for the first frames.


---

## 17. The rename (Foxy Downloader → SaveSama)

The app was called *Foxy Downloader* until it was renamed, before it ever
shipped. Because there were no installs to carry forward, the rename was a
clean break rather than a migration — **nothing kept a legacy identifier**:

| Renamed | To |
|---|---|
| App name / slug / scheme | `SaveSama` / `savesama` |
| Package + bundle id | `com.foxysama.savesama` |
| Gallery album | `SaveSama` |
| Saved-file prefix | `savesama_` |
| Preferences file | `savesama-preferences.json` |
| Local native modules | `modules/savesama-*`, `expo.modules.savesama*`, `SaveSama*Module` |
| Notification channel | `savesama_downloads` |

**If the app is ever renamed again after a real release, none of this can be
repeated as-is.** Four of those are user-data bindings, and changing them on a
live install silently destroys state:

- **The album title.** `listSavedAssets()` finds files by matching the album's
  *title*. Rename it and every previously saved file disappears from the Saved
  tab — the files stay on disk, the app just stops looking where they are.
- **The saved-file prefix.** `SAVED_FILENAME` in `savedName.ts` parses it back
  into a readable row title; unmatched files fall back to the raw filename.
- **`savesama-preferences.json`.** A new path reads as a missing file, which
  resets every preference to its default.
- **The package id.** A different id is a different app: sideloaded users get a
  second icon rather than an upgrade.

The fix in each case is to accept both the old and new values rather than
replace — match a list of album titles, alternate the prefix regex, and read
the old preferences path when the new one is absent.

---

## 18. Original quality (VP9) for Instagram / Threads

§9 explains why the default download tops out at the muxed H.264 rendition: the true
original exists only in `video_dash_manifest`, as VP9 video-only. With FFmpeg in the build
that ceiling is now optional. `pickDashVideo` (`dashManifest.ts`) returns the manifest's
largest video representation; `mapMediaInfo` attaches it as `MediaItem.originalVideo` **only
when its short side beats the muxed rendition's**. `downloadToGallery` then, when the
resolution is `max` *and* `preferences.preferOriginalQuality` is on *and* the item has both
`originalVideo` and `audioOnlyUrl`, runs the mux path on the DASH video + DASH audio; FFmpeg
`-c copy` puts VP9 + HE-AAC into an MP4. Any failure falls through to the normal plan, so the
switch can never make a download fail that used to work.

Why it is **off by default** (Settings → Default resolution → *Original quality*):

- VP9-in-MP4 plays in every Android gallery and Chrome, but **not** on iPhones, and not in
  QuickTime or some Windows players. Anyone who shares files to iOS friends wants it off.
- The DASH `BaseURL` is fetched with a plain GET like the audio one (§11). Verified to return
  a complete fMP4 for audio; assumed for video — if Meta ever serves only the index range,
  the mux fails and the fallback saves the H.264 rendition.
- The switch is disabled when `ffmpegVersion()` is null (iOS, or a build without the libs),
  because MediaMuxer can't carry VP9 in MP4.

---

## 19. Keeping the account off Meta's automation radar

Two Instagram suspensions ("we suspect automated behavior", which also locks Threads since
it is the same account) prompted a review of everything the app does with the session.
The failure modes were all on our side, not a Meta API change — the endpoint and payload
are unchanged and `THREADS_APP_ID`/`IG_APP_ID` still work. What changed (Sept 2026):

| Before | Problem | Now |
| --- | --- | --- |
| Both hidden WebViews loaded `instagram.com/` and `threads.com/` at **every app launch** and kept them alive | Two Meta sessions running feed polling, realtime and logging JS from a background page nobody looked at, on every launch — with no clicks, scrolls or views ever following | `WebViewSessionResolver` starts on `about:blank`, loads the site only when a fetch needs it, and parks again after 90 s idle (`IDLE_UNLOAD_MS`) |
| Hidden WebView was **1×1 px** | The page's own telemetry reported a 1×1 viewport: a headless signature | Screen-sized, transparent, `zIndex: -1` |
| `api/v1/media/<pk>/info/` sent only `X-IG-App-ID` + `X-Requested-With` | The web client always sends `X-CSRFToken`, `X-IG-WWW-Claim`, `X-ASBD-ID` too; a session whose API calls don't match its own JS is the textbook "third-party client" fingerprint | `buildFetchJs` reads `csrftoken` from `document.cookie`, `www-claim-v2` from `sessionStorage` (and stores the `x-ig-set-www-claim` response header back), and sends `X-ASBD-ID: 359341` |
| Fetches fired the instant a link arrived, back-to-back on "Save all"/retries | Metronomic bursts | `sessionThrottle.waitForSlot`: ≥2.5 s + 0–1.5 s jitter between calls per platform |
| Any 4xx/HTML answer opened the **login sheet**, re-opened on every retry | A `checkpoint_required` arrives as 400/403 → we showed sign-in → the user re-authenticated an account Instagram had just flagged, repeatedly | `classifyBlock` runs before `isLoginRequired`; `checkpoint`/`challenge`/`feedback_required`/429 start a **cooldown** (5/15/30 min) and surface a plain-language message; the login sheet opens at most **once per request** |
| Authed failure → anonymous GraphQL (desktop UA) → embed (crawler UA), same IP, same second | Three client fingerprints from one device in a burst | Anonymous fallbacks run only when the user has **never signed in** on that platform (`instagramSignedIn` hint) |

Things deliberately **not** changed, and why:

- **The WebView user agent** still identifies as Android WebView (`; wv`). Spoofing a Chrome
  UA makes the UA disagree with the client hints and JS-visible properties, which is a worse
  signal than being an embedded browser (Meta's own apps are one).
- **The endpoint.** `api/v1/media/<pk>/info/` is what instagram.com's own reels/stories code
  calls; switching to GraphQL `PolarisPostActionLoadPostQueryQuery` would add a rotating
  `doc_id` dependency (§1) for no fingerprint gain.

If a suspension happens again, the first things to check are `adb logcat` for
`SaveSamaMedia`/WebView errors around the time, whether the cooldown messages ever appeared
(the user will have seen them), and whether Meta started demanding a header we don't send —
compare a real browser's `api/v1/media` request headers in devtools against `buildFetchJs`.

Recovery advice for the user, since the app can't do it: stop using the app for 48 h, use
the Instagram app normally, change the password (which invalidates the WebView session —
the app will simply ask to sign in again).

---

## 20. Saved-file names, the viewer, and rename

**Names.** `savedName.ts` owns the scheme: `<poster> - <code>[ - <n>][ - audio].<ext>`.
`buildSavedFilename` builds it from `MediaItem.username` / `postCode` / `position` (set by
every mapper: `mapMediaInfo`, `mapGraphqlMedia`, `parseEmbedHtml`, `mapPlayerResponse`);
`prettyName` parses it back, still accepting the legacy `savesama_<code>_<ts>_dl` form. The
caption is never used — it is long, emoji-laden and the same across a carousel. ` - ` is
the separator because neither handles nor base64url codes contain it; `sanitizePoster`
strips it from channel names. Working files keep their ugly timestamped names; `download.ts`
moves the finished file to `cache/savesama_outbox/<gallery name>` immediately before
`saveToAppAlbum`, because the media library keeps the on-disk name. MediaStore de-duplicates
with ` (1)`, which the parser ignores.

**Viewer.** `MediaViewer` is a full-screen `Modal` over a horizontal paging `FlatList` of the
currently filtered assets. Photos: `expo-image` in a pinch/pan/double-tap `GestureDetector`.
Videos: `expo-video` `VideoView` with native controls, `loop`, paused when not the visible
page. Audio: `expo-audio` player with a tappable track. `windowSize={3}` so only neighbours
own native players. Share, Rename, Delete are toolbar buttons; the long-press menu
(`AssetActionsSheet`) offers the same. `Sharing.shareAsync` is no longer what a tap does.

**Rename** is `renameMediaAsset(assetId, displayName)` in the native module. On Android
expo-media-library's asset id **is** the MediaStore `_ID`, so the module updates
`DISPLAY_NAME` on `MediaStore.Files` (API 29+: MediaStore moves the file; the app owns the
row, so no `RecoverableSecurityException`), or renames on disk and rewrites `DATA` on older
devices. The extension is never editable (`RenameDialog` shows it read-only) so the MIME type
stays right. iOS rejects with `ERR_RENAME_UNSUPPORTED` — a `PHAsset` has no filename a user
sees. The library screen patches the row's `filename` from the returned name and then
refreshes, because the asset's `uri` changes with it.

**List performance.** Tiles and rows are `React.memo`; thumbnails use `expo-image` with
`cachePolicy="memory-disk"`, `recyclingKey` and `allowDownscaling`; the FlatList has
`removeClippedSubviews`, `windowSize={7}`, `initialNumToRender` 12/10. Together with the
WebViews no longer loading two Meta sites at launch, cold start and Saved-tab scrolling are
noticeably lighter — unmeasured beyond eyeballing, like §12.
