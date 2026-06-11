# 🦊 Foxy Downloader

An Android app (Expo SDK 56 + TypeScript) that saves photos and videos from
**Instagram** and **Threads** posts straight to your gallery.

## Features

- **Share-sheet integration** — tap *Share* on any post in Instagram or Threads and
  pick *Foxy Downloader*; the app opens and fetches the media automatically.
- **Paste a link** — or copy a post link and hit *Paste* in the app.
- **Photos, videos, and carousels** — multi-item posts show one card per item with
  individual *Save* buttons plus a *Save all* action.
- **On-device extraction** — no backend, no API keys. The app reads the post's public
  data directly. Layered fallback strategies keep it working when one breaks:
  - Instagram: GraphQL endpoint → embed page → `og:` meta tags
  - Threads: embedded page JSON (`data-sjs` blocks) → `og:` meta tags
- **Seamless downloads** — progress bars, then saved directly to the device gallery
  via the media library.
- **Reserved ad slot** — the bottom banner space ([src/components/AdBanner.tsx](src/components/AdBanner.tsx))
  is a fixed-height placeholder sized for an AdMob adaptive banner. No ad SDK is
  installed yet; swap the placeholder's inner view for the ad component when ready.

## Limitations

- Public posts only. Private accounts and Stories require login and are not supported.
- Instagram/Threads occasionally change their internals; the fallback chain and error
  messages are designed for graceful failure when that happens.

## Project structure

```
App.tsx                     # Single screen: share-intent wiring, state, layout
src/
  components/               # Header, LinkInput, MediaCard, ErrorNotice, EmptyState, AdBanner
  extraction/
    urlParser.ts            # Link detection/normalization (pure, tested)
    instagram.ts            # Instagram strategies (GraphQL / embed / og)
    threads.ts              # Threads strategies (data-sjs JSON / og)
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
