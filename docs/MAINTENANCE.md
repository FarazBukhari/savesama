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
   - body: `variables={"shortcode":"<code>"}&doc_id=8845758582119845`
   - headers: `X-IG-App-ID: 936619743392459`, `X-CSRFToken: <token>`,
     `Cookie: csrftoken=<token>`

**Constants to check first if it breaks** (top of `instagram.ts`):

| Constant | Current value | What it is |
| --- | --- | --- |
| `GRAPHQL_DOC_ID` | `8845758582119845` | Persisted ID for `PolarisPostActionLoadPostQueryQuery`. Stable for a long time, but Meta *can* rotate it. |
| `IG_APP_ID` | `936619743392459` | Public web app id. Rarely changes. |

**Known dead ends — don't waste time re-trying these:**

- `https://www.instagram.com/api/graphql` — **walled** for anonymous clients (serves a
  ~594 KB logged-out HTML shell, not JSON).
- `og:image` / `og:video` meta tags on logged-out post pages — **removed** by Instagram.
- The `/embed/captioned/` page server-rendered JSON — **gone** (now a JS shell).
- The mobile `i.instagram.com/api/v1/media/<id>/info/` endpoint — **requires auth**.

The `fetchViaEmbed` / `fetchViaOgTags` fallbacks in `instagram.ts` are kept only as a
last-ditch backstop; they essentially never succeed now. The GraphQL path is the one
that matters.

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

## 2. Threads status (deferred)

Threads is **intentionally not supported yet**. Threads links show a "not supported yet"
message (see the `platform === 'threads'` branch in
[`src/extraction/extract.ts`](../src/extraction/extract.ts)).

**Why it's hard:** Threads media isn't in the logged-out HTML, its GraphQL `doc_id`
rotates and isn't reachable without running the page's JS, and the mobile media-info
endpoint needs auth. Reverse-engineering the two leading downloaders confirmed there is
no pure on-device path:

- **fastdl.app** → posts to a Cloudflare Workers "worker hub" `/api/convert`, gated by a
  Cloudflare CAPTCHA (`wh-cf-token`).
- **threadsdownloader.com** → posts to `api-tp.threadsdownloader.com/threads/post/media`,
  gated by Cloudflare Turnstile.

**To add Threads later, two options:**

1. **Small backend** (what the big sites do) — a free Cloudflare Worker that extracts
   Threads server-side; the app calls it.
2. **In-app hidden `react-native-webview`** — load the post so Threads' own page makes the
   authenticated request, and intercept the media response with an injected
   `fetch`/`XHR` patch.

Either way, the intercepted/returned JSON has the same `image_versions2` /
`video_versions` / `carousel_media` shape that `mapThreadsPost` in
[`src/extraction/threads.ts`](../src/extraction/threads.ts) already parses — that module
is kept unwired for exactly this reason.

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
npm test                   # jest (38 tests)
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
