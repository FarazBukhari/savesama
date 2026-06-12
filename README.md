# 🦊 Foxy Downloader

An Android app (Expo SDK 56 + TypeScript) that saves photos, videos, and reels from
**Instagram** posts straight to your gallery.

## Features

- **Share-sheet integration** — tap *Share* on any Instagram post and pick
  *Foxy Downloader*; the app opens and fetches the media automatically.
- **Paste a link** — or copy a post link and hit *Paste* in the app.
- **Photos, videos, reels, and carousels** — multi-item posts show one card per item
  with individual *Save* buttons plus a *Save all* action.
- **On-device extraction** — no backend, no API keys. The app fetches an anonymous CSRF
  token from Instagram's homepage, then queries its public `graphql/query` endpoint and
  parses the post media directly on the device.
- **Seamless downloads** — progress bars, then saved directly to the device gallery
  via the media library.
- **Reserved ad slot** — the bottom banner space ([src/components/AdBanner.tsx](src/components/AdBanner.tsx))
  is a fixed-height placeholder sized for an AdMob adaptive banner. No ad SDK is
  installed yet; swap the placeholder's inner view for the ad component when ready.

## Limitations

- **Instagram only for now.** Threads links show a "not supported yet" message. Threads
  no longer exposes its media in the logged-out page and its private GraphQL `doc_id`
  rotates, so it would require a small backend or an in-app WebView (see
  [the design doc](docs/superpowers/specs/2026-06-11-foxy-downloader-design.md)). Both
  leading downloaders (fastdl.app, threadsdownloader.com) extract Threads server-side.
- Public posts only. Private accounts and Stories require login and are not supported.
- Instagram occasionally changes its internals; if the GraphQL endpoint changes, the
  CSRF/endpoint constants in [src/extraction/instagram.ts](src/extraction/instagram.ts)
  may need updating.

## Project structure

```
App.tsx                     # Single screen: share-intent wiring, state, layout
src/
  components/               # Header, LinkInput, MediaCard, ErrorNotice, EmptyState, AdBanner
  extraction/
    urlParser.ts            # Link detection/normalization (pure, tested)
    http.ts                 # fetch helpers + anonymous Instagram CSRF token
    instagram.ts            # Instagram extraction (graphql/query + CSRF)
    threads.ts              # Threads media mapping (kept for future Threads support)
    extract.ts              # Dispatcher + share-link redirect resolution
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
> check if Instagram extraction breaks, how to test extraction fast, the Threads plan,
> EAS build steps, and environment gotchas.

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
