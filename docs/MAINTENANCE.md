# Foxy Downloader — Maintenance & Operations Notes

Practical, breakage-prone, and operational knowledge for working on this app.
Keep this current as things change.

---

## 1. If Instagram extraction breaks (most likely failure)

Instagram extraction is the one part that depends on Instagram's private internals,
so it's the thing most likely to break when Meta changes something. Everything you'd
need to adjust lives in two files:

- [`src/extraction/instagram.ts`](../src/extraction/instagram.ts)
- [`src/extraction/http.ts`](../src/extraction/http.ts)

**The working recipe (verified June 2026):**

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

The `fetchViaEmbed` fallback **works again** as of June 2026, but only with a **crawler
user-agent** (`CRAWLER_USER_AGENT` = `facebookexternalhit/...` in `http.ts`): the embed
page server-renders media for link-preview bots but ships an empty JS shell to a normal
desktop UA. It's still just a backstop (it can't get a reel's `video_url`, only the poster
image) — the GraphQL path is the one that matters. `fetchViaOgTags` essentially never
succeeds now.

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

Note this is **separate** from "Save as Audio" (§7): that feature extracts the audio
track from a **reel** the user already downloaded — it doesn't touch song-page links.
Saving audio from a reel works today and needs no auth.

---

## 3. Build & release (EAS)

- The project is linked to EAS as **`@farazbukhari/foxy-downloader`**
  (projectId `716a367e-a260-4e84-8e2f-73b8f730762d`, in `app.json` → `extra.eas`).
- Preview APK (sideload on any Android phone):

  ```bash
  eas build --profile preview --platform android
  ```

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
npm test                   # jest (51 tests)
npx expo-doctor            # 21/21 checks
npx expo export --platform android --output-dir /tmp/foxy-check && rm -rf /tmp/foxy-check
```

---

## 6. Ads (when ready)

`AdBanner` ([`src/components/AdBanner.tsx`](../src/components/AdBanner.tsx)) reserves a
60dp slot at the bottom, safe-area aware, so adding ads won't shift the layout. To wire
up AdMob:

1. `npx expo install react-native-google-mobile-ads` and add its config plugin to
   `app.json`.
2. Replace the placeholder `<View>` inside `AdBanner` with
   `<BannerAd size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} ... />`.
3. Keep the outer container so spacing stays identical.

---

## 7. "Save as Audio" (M4A) extraction

The format picker's **Audio · M4A** option strips the video track from a downloaded
clip and saves the audio only. It does **not** use FFmpeg.

**Why not FFmpeg:** `ffmpeg-kit` (and the `ffmpeg-kit-react-native` wrapper) was retired
by Arthenica on Jan 6 2025, and **all binaries were pulled from Maven Central / CocoaPods /
npm on Apr 1 2025**. EAS builds then failed with
`Could not find com.arthenica:ffmpeg-kit-https:6.0-2` because the artifact no longer
resolves anywhere. There is no maintained, reachable binary to point Gradle at.

**What we do instead:** a tiny **local Expo module** at
[`modules/foxy-audio-extractor`](../modules/foxy-audio-extractor) that remuxes the audio
track using only OS-native muxers — no third-party binary, no APK bloat, no re-encode:

- **Android** ([`FoxyAudioExtractorModule.kt`](../modules/foxy-audio-extractor/android/src/main/java/expo/modules/foxyaudioextractor/FoxyAudioExtractorModule.kt)):
  `MediaExtractor` selects the first `audio/*` track and copies its samples into a new
  MP4/M4A container via `MediaMuxer`.
- **iOS** ([`FoxyAudioExtractorModule.swift`](../modules/foxy-audio-extractor/ios/FoxyAudioExtractorModule.swift)):
  `AVAssetExportSession` with `AVAssetExportPresetPassthrough` and `outputFileType = .m4a`
  over an audio-only `AVMutableComposition`.

JS calls `extractAudio(srcUri, destUri)` from
[`modules/foxy-audio-extractor`](../modules/foxy-audio-extractor/index.ts); it's invoked in
Phase 2 of `downloadAudioToGallery` ([`src/services/download.ts`](../src/services/download.ts)).

**Gotchas:**

- The module is **autolinked** because it lives in `modules/`. Any change to its native
  code (or `expo-module.config.json`) needs a **new native build** — Metro/`expo export`
  alone won't pick it up. It also won't run in Expo Go or jest (native module absent), but
  no test imports `download.ts`, so that's fine.
- If extraction ever needs real transcoding (e.g. non-AAC audio → MP3), the passthrough
  approach won't cover it; you'd need an on-device encoder, not a remux. Today Instagram
  serves AAC-in-MP4, which remuxes cleanly into M4A.

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

We pick a **progressive** format (muxed audio + video) from `streamingData.formats`,
highest resolution first. Progressive caps at **itag 22 (720p)**, usually only
**itag 18 (360p)** is served. `adaptiveFormats` (1080p+ video-only / audio-only) are
intentionally ignored — see "HD" below.

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

### HD (1080p+) is a planned follow-up — not yet supported

1080p and above are only offered as **separate** video-only + audio-only adaptive streams.
Combining them needs an on-device **muxer** (video + audio → MP4). The local
`foxy-audio-extractor` module (§7) only *strips* audio out; it can't mux two tracks
together. Adding HD means extending that native module (Android `MediaMuxer` with both an
`audio/*` and a `video/*` track; iOS `AVMutableComposition` with both tracks) and teaching
`youtube.ts` to emit a paired video+audio item plus a new download path that muxes before
saving. Until then, progressive (≤720p) is the intentional ceiling.
