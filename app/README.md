# SaveSama app (Android)

Expo SDK 57 / React Native 0.86 client for the SaveSama server (`../server`). The design spec is
`../DESIGN.md`; the server contract is `../docs/API.md`. No accounts, no cookies: the app only
talks to your own server.

## Build

The app uses native modules (share intent, camera, media library), so it needs a native build;
Expo Go can't run it.

```sh
cd app
npm ci
npx eas-cli@latest build --platform android --profile preview   # APK on EAS (project 56b9a925-…)
# or locally, with the Android SDK installed:
npx expo prebuild --platform android && cd android && ./gradlew assembleRelease
```

Identity: `com.foxysama.savesama`, scheme `savesama`, EAS owner `farazbukhari`.

## Develop and check

```sh
npm run typecheck   # tsc, strict
npm test            # jest: API client, link parsing, pairing links, quality choice, job/transfer states
npm run lint        # expo lint
npx expo export --platform web   # the web build runs against a real server for screenshot tests
```

The web build swaps native-only pieces (gallery, share intent, camera, clipboard suggestion,
Termux launcher) for safe fallbacks: saves become browser downloads and the Library is built
from local history. `screenshots/` holds captures of that build at 412 x 915 against a live
server (Library and some Activity rows use fixture data and CC0 stand-in photos).

## How it works

- `src/app/` routes (expo-router): tabs Grab, Activity, Library, Server, Settings; onboarding,
  viewer, QR scan, manual pairing, Termux guide; `pair` handles `savesama://pair?...`.
- `src/state/`: stores (settings, servers, history, jobs, UI overlays), polling and the transfer
  pipeline: finished server jobs are downloaded with Range resume into the cache, written to the
  "SaveSama" album (Android keeps photos/videos and audio in separate SaveSama folders), recorded
  in history, then `DELETE`d on the server unless "Keep a copy on the server" is on.
- `src/lib/`: pure logic with tests. `src/components/`: design-system components.
- Icons: `npm i --no-save playwright-core && node scripts/render-icons.mjs` re-renders
  `assets/*.png` from `assets/src/mark.svg`.
