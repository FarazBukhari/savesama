# SaveSama

Save videos, photos and audio from YouTube, Instagram, TikTok, Facebook, Threads and Reddit to your
phone's gallery. No accounts: nothing ever logs in to a platform, so nothing can get flagged.

Two parts:

- **Server** (`server/`): a small Python program built on yt-dlp and ffmpeg that does the
  downloading. It runs on your phone in Termux, or on a Windows/Mac computer.
- **App** (`app/`): the Android app. Share a post to it (or paste a link), pick what to save,
  and it pulls the finished file from the server into the `SaveSama` album.

## Get started

1. **Build the app**: [docs/BUILD.md](docs/BUILD.md). The quickest route is the GitHub Actions
   *Android APK* run for this branch: download its artifact and install the APK.
2. **Install the server in Termux**: [docs/SERVER.md](docs/SERVER.md).
3. Start the server (`savesama`). On the same phone it opens the app and pairs automatically;
   from a PC, scan the QR code it prints in the app's Server tab.

## Docs

| | |
| --- | --- |
| [docs/SERVER.md](docs/SERVER.md) | install, run, pair, update and troubleshoot the server |
| [docs/BUILD.md](docs/BUILD.md) | build the APK with GitHub Actions, EAS, or locally |
| [docs/API.md](docs/API.md) | the app ↔ server contract |
| [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md) | design system and product brief; mockups in `docs/design/` |

## Development

```sh
# server
python3 -m venv .venv && .venv/bin/pip install -e server
.venv/bin/python -m unittest discover -s server/tests

# app
cd app && npm ci && npm run typecheck && npm test
```

The previous Expo-only app is preserved at tag `legacy-expo`.
