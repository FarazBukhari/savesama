# 🦊 Foxy Downloader

An Android app (Expo SDK 56 + TypeScript) that saves photos, videos, and reels from
**Instagram**, posts from **Threads**, and videos from **YouTube** straight to your gallery.

## Features

- **Share-sheet integration** — tap *Share* on any Instagram post, Threads post, or
  YouTube video and pick *Foxy Downloader*; the app opens and fetches the media
  automatically.
- **Paste a link** — or copy a post/video link and hit *Paste* in the app.
- **Auto-detects the platform** — paste an Instagram, Threads, or YouTube link and the app
  figures out which one it is.
- **Photos, videos, reels, and carousels** — multi-item Instagram and Threads posts show
  one card per item with individual *Save* buttons plus a *Save all* action.
- **Save as video or audio** — for any video (Instagram reel, Threads post, or YouTube),
  pick *Video* (MP4) or *Audio* (M4A). Audio saves download **only** the audio stream where
  the source publishes one, so a 13s reel's audio is ~105 KB instead of ~1.8 MB.
- **Faster downloads** — files over 4MB are fetched as 4 parallel byte ranges and joined,
  since one connection to Google's or Meta's CDN is often slower than the link allows.
- **Download queue that keeps going** — saves are queued and run one at a time, survive tab
  switches, and continue while the app is in the background via an Android foreground service
  with a progress notification. Queued items can be cancelled before they start.
- **Quality per download** — the save sheet has a *Video quality* row that overrides the
  Settings default for that one download.
- **Signs you in when Meta demands it** — Instagram and Threads download through a hidden
  WebView holding your own session, so anything you can view, you can save. The login
  screen appears only when a request comes back logged-out, and the session persists
  across launches. Threads has no anonymous path at all; Instagram falls back to
  anonymous `graphql/query` + embed-page extraction when no WebView is available.
- **On-device extraction** — no backend, no API keys. YouTube comes from the InnerTube
  `player` endpoint (ANDROID_VR client); everything is parsed on the device.
- **Seamless downloads** — progress bars, then saved directly to the device gallery
  via the media library.
- **Reserved ad slot** — the bottom banner space ([src/components/AdBanner.tsx](src/components/AdBanner.tsx))
  is a fixed-height placeholder sized for an AdMob adaptive banner. No ad SDK is
  installed yet; swap the placeholder's inner view for the ad component when ready.

## Limitations

- **Instagram, Threads & YouTube.** Instagram posts, reels, photos, and carousels;
  Threads posts (`/@user/post/<code>`, `/post/<code>`, `/t/<code>`, `/share/<token>`);
  YouTube watch/`youtu.be`/Shorts video links.
- **Threads text-only posts** have nothing to download and say so.
- **Selectable resolution (per platform).** Choose a default download quality for
  Instagram, Threads and YouTube on the **Settings** tab (360p up to 1080p, or "Max"), or
  override it for a single save from the format sheet. Photos pick a smaller rendition from
  the source's own ladder. YouTube picks a lower rung, and assembles 1080p by muxing its
  separate video/audio streams. Instagram and Threads serve only one *usable* (H.264) video
  rendition, so a capped preference there is honoured by downscaling on-device — slower, and
  the short side is what's matched ("480p" = the shorter dimension lands near 480). See
  [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §9, §12–§14.
- **Instagram/Threads video quality is capped below the original.** Meta's DASH manifest
  advertises the full-resolution original (e.g. 1088x1936 where the downloadable rendition is
  716x1274), but only as VP9 — which iOS can't put in an MP4 and Android muxes unevenly. So
  the muxed H.264 rendition is used instead. Deliberate; see
  [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §9.
- **Songs/audio pages aren't supported.** A `/reels/audio/<id>` link shows a clear
  "not supported" message — Instagram walls the audio asset for anonymous clients and
  never serves full licensed tracks (see [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §2b).
- **Whatever your account can see.** Instagram and Threads download as the signed-in
  user, so private accounts you follow work; anything your account can't view doesn't.
  YouTube stays anonymous and may rate-limit some networks ("confirm you're not a bot") —
  the app reports this as a retryable block.
- All three sites change their internals periodically; if extraction breaks, the constants
  in [src/extraction/instagram.ts](src/extraction/instagram.ts) /
  [src/extraction/threadsApi.ts](src/extraction/threadsApi.ts) /
  [src/extraction/youtube.ts](src/extraction/youtube.ts) may need updating.

## Project structure

```
App.tsx                     # Tabs, share-intent wiring, state, layout; mounts one
                            # WebViewSessionResolver per authenticated platform
src/
  components/               # Header, LinkInput, MediaCard, ErrorNotice, EmptyState, AdBanner
    WebViewSessionResolver.tsx  # Hidden session WebView + login modal (both platforms)
    webViewSession.ts       # Per-platform config + login predicates (pure, tested)
  extraction/
    urlParser.ts            # Link detection/normalization (all platforms, pure, tested)
    http.ts                 # fetch helpers + anonymous Instagram CSRF token
    dashManifest.ts         # Reads the audio stream out of Meta's DASH manifest
    instagram.ts            # Instagram extraction (authenticated first, then anonymous)
    instagramApi.ts         # api/v1 media-info mapper, shared with Threads
    threads.ts              # Threads extraction (authenticated only)
    threadsApi.ts           # Threads app id + origin
    youtube.ts              # YouTube extraction (InnerTube player, ANDROID_VR client)
    extract.ts              # Platform dispatcher + share-link redirect resolution
  services/
    mediaSession.ts         # Bridge from extraction to the mounted session WebViews
    download.ts             # Download with progress + save to gallery
    downloadQueue.ts        # Module-level queue; one job at a time, outlives screens
    rangedDownload.ts       # Parallel byte-range downloads + streamed join
    resolutionPlan.ts       # Picks the rendition/plan for a resolution preference
    preferences.ts          # Per-platform resolution defaults, persisted
    library.ts              # Saved-files listing for the Saved tab
  theme.ts                  # Colors, spacing, ad banner height
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # jest (URL parser + extraction parser tests)
```

> Note: `expo-share-intent`, `react-native-webview` and the two local native modules
> (`foxy-audio-extractor`, `foxy-download-service`) all require a native build — the app does
> **not** run in Expo Go. Use a development build (`eas build --profile development`) or the
> preview APK. Adding `foxy-download-service` means an **existing dev build won't pick it up**;
> rebuild.

> 🔧 **Maintaining this app?** See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — what to
> check if Instagram or Threads extraction breaks, how to test extraction fast, why
> song/audio pages aren't supported, EAS build steps, and environment gotchas.

## Build the preview APK (EAS)

The project is already linked to EAS (`@farazbukhari/foxy-downloader`).

```bash
eas build --profile preview --platform android
```

Or via CI ([.github/workflows/build-apk.yml](.github/workflows/build-apk.yml)): pushes and
merges to `main` build the `preview` APK automatically; any other branch builds on demand
from the Actions tab or `gh workflow run build-apk.yml --ref <branch> -f profile=preview`.
The APK lands in the run's artifacts.

When the build finishes, open the build page link (or scan the QR code) on your
Android phone and install the APK. Android will ask you to allow installs from
unknown sources the first time.

## Ads (later)

`AdBanner` reserves a 60dp slot at the bottom of the screen. To integrate AdMob:

1. `npx expo install react-native-google-mobile-ads` and add its config plugin.
2. Replace the placeholder `<View>` inside `AdBanner` with `<BannerAd size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} ... />`.
3. Keep the outer container so the layout doesn't shift.
