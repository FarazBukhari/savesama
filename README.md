# 🦊 Foxy Downloader

An Android app (Expo SDK 56 + TypeScript) that saves photos, videos, and reels from
**Instagram** posts and videos from **YouTube** straight to your gallery.

## Features

- **Share-sheet integration** — tap *Share* on any Instagram post or YouTube video and
  pick *Foxy Downloader*; the app opens and fetches the media automatically.
- **Paste a link** — or copy a post/video link and hit *Paste* in the app.
- **Auto-detects the platform** — paste an Instagram or YouTube link and the app figures
  out which one it is.
- **Photos, videos, reels, and carousels** — multi-item Instagram posts show one card per
  item with individual *Save* buttons plus a *Save all* action.
- **Save as video or audio** — for any video (Instagram reel or YouTube), pick *Video*
  (MP4) or *Audio* (M4A); the audio track is extracted on-device.
- **On-device extraction** — no backend, no API keys. Instagram media comes from an
  anonymous `graphql/query` call; YouTube comes from the InnerTube `player` endpoint
  (ANDROID_VR client), both parsed directly on the device.
- **Seamless downloads** — progress bars, then saved directly to the device gallery
  via the media library.
- **Reserved ad slot** — the bottom banner space ([src/components/AdBanner.tsx](src/components/AdBanner.tsx))
  is a fixed-height placeholder sized for an AdMob adaptive banner. No ad SDK is
  installed yet; swap the placeholder's inner view for the ad component when ready.

## Limitations

- **Instagram & YouTube.** Instagram posts, reels, photos, and carousels; YouTube
  watch/`youtu.be`/Shorts video links.
- **YouTube quality is capped at ~720p.** Extraction uses *progressive* streams (one file
  with audio + video, usually 360p, sometimes 720p). 1080p+ is only served as separate
  video/audio streams that would need on-device muxing — a planned follow-up
  (see [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §8).
- **Songs/audio pages aren't supported.** A `/reels/audio/<id>` link shows a clear
  "not supported" message — Instagram walls the audio asset for anonymous clients and
  never serves full licensed tracks (see [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §2b).
- Public content only. Private/age-restricted Instagram or YouTube items require login
  and are not supported. YouTube may also rate-limit anonymous requests from some
  networks ("confirm you're not a bot") — the app reports this as a retryable block.
- Both sites change their internals periodically; if extraction breaks, the constants in
  [src/extraction/instagram.ts](src/extraction/instagram.ts) /
  [src/extraction/youtube.ts](src/extraction/youtube.ts) may need updating.

## Project structure

```
App.tsx                     # Single screen: share-intent wiring, state, layout
src/
  components/               # Header, LinkInput, MediaCard, ErrorNotice, EmptyState, AdBanner
  extraction/
    urlParser.ts            # Link detection/normalization (Instagram + YouTube, pure, tested)
    http.ts                 # fetch helpers + anonymous Instagram CSRF token
    instagram.ts            # Instagram extraction (graphql/query + CSRF)
    youtube.ts              # YouTube extraction (InnerTube player, ANDROID_VR client)
    extract.ts              # Platform dispatcher + share-link redirect resolution
  services/
    download.ts             # Download with progress + save to gallery
  theme.ts                  # Colors, spacing, ad banner height
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # jest (URL parser + extraction parser tests)
```

> Note: `expo-share-intent` requires a native build — the app does **not** run in Expo Go.
> Use a development build (`eas build --profile development`) or the preview APK.

> 🔧 **Maintaining this app?** See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — what to
> check if Instagram extraction breaks, how to test extraction fast, why song/audio
> pages aren't supported, EAS build steps, and environment gotchas.

## Build the preview APK (EAS)

The project is already linked to EAS (`@farazbukhari/foxy-downloader`).

```bash
eas build --profile preview --platform android
```

When the build finishes, open the build page link (or scan the QR code) on your
Android phone and install the APK. Android will ask you to allow installs from
unknown sources the first time.

## Ads (later)

`AdBanner` reserves a 60dp slot at the bottom of the screen. To integrate AdMob:

1. `npx expo install react-native-google-mobile-ads` and add its config plugin.
2. Replace the placeholder `<View>` inside `AdBanner` with `<BannerAd size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} ... />`.
3. Keep the outer container so the layout doesn't shift.
