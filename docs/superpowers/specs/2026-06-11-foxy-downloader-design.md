# Foxy Downloader — Design

**Date:** 2026-06-11
**Status:** Approved (user), implemented

## Goal

An Android app, built with Expo and deployable as an EAS preview APK, that accepts
Instagram and Threads post links (via the native share sheet or paste) and saves the
post's photos/videos to the device gallery. Clean single-screen UI with a reserved
ad banner slot (no ad SDK yet).

## Decisions (user-approved)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Platform | Android only | Preview APK installs directly; iOS needs a paid Apple Developer account. iOS share-extension config is retained by expo-share-intent for a future iOS build. |
| Extraction | On-device | No backend or API keys; app fetches public post data itself. Accepted trade-off: public posts only, occasional breakage when Instagram changes internals. |
| App name | Foxy Downloader | Shows under the icon and in the share sheet. |
| EAS build | Configured but not triggered | User triggers `eas build --profile preview --platform android` themselves. |

## Architecture

- **Stack:** Expo SDK 56, React Native 0.85, TypeScript strict, no router (single screen).
- **Share sheet:** `expo-share-intent` v7 (config plugin adds the Android `ACTION_SEND text/*`
  intent filter; the app appears in Instagram/Threads share sheets). Requires a native
  build — Expo Go is not supported.
- **Flow:** shared/pasted text → `urlParser` (normalize `/p/`, `/reel/`, `/tv/`,
  `@user/post/`, resolve `/share/` and `/t/` redirects) → platform extractor →
  preview cards → `download.ts` (cache download with progress → save to gallery →
  delete cache copy).

### Extraction strategies (ordered fallbacks)

- **Instagram:** (1) public GraphQL endpoint (`doc_id` query, returns
  `xdt_shortcode_media` incl. carousels), (2) embed page JSON regex
  (`video_url`/`display_url`/`EmbeddedMediaImage`), (3) `og:video`/`og:image` tags.
- **Threads:** (1) `data-sjs` JSON script blocks — recursive walk for post objects
  matching the shortcode with `video_versions`/`image_versions2`/`carousel_media`,
  (2) `og:` tags.
- All strategies are pure parse functions over fetched text, unit-tested with fixtures.
  Errors carry a `userMessage` shown in the UI.

### UI

Single screen: header → link input card (Paste + Get media) → state area (fetching
spinner / error notice / media cards with per-item progress and Save-all) → empty-state
how-to → fixed bottom `AdBanner` placeholder (60dp, safe-area aware, swap-in point for
a future AdMob adaptive banner).

## Error handling

- `ExtractionError` / `DownloadError` carry friendly `userMessage`s (private post,
  expired CDN link, permission denied, bad link, no media in post).
- Per-item download state machine: idle → downloading(progress) → done | error(retry).

## Testing & verification

- Jest (`jest-expo`) suites for the URL parser and both platform parsers (35 tests).
- `tsc --noEmit`, `expo-doctor` (21/21), and `expo export --platform android` bundle
  smoke test all pass.

## Out of scope (YAGNI)

Stories/private posts (need login), download history, iOS build, ad SDK integration.
