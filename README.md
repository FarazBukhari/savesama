# 🦊 SaveSama

An Android app (Expo SDK 56 + TypeScript) that saves photos, videos, and reels from
**Instagram**, posts from **Threads**, and videos from **YouTube** straight to your gallery.

## Supported apps

| App | What it saves |
| --- | --- |
| **Instagram** | Posts, reels, photos and carousels |
| **Threads** | Video posts, photos and carousels |
| **YouTube** | Videos and Shorts, up to 1080p |

Instagram and Threads download as the account you sign in to, so anything your account can
view, you can save. YouTube is anonymous. The same list is shown in the app's **Settings**
tab.

## Where files are saved

| Media | Location |
| --- | --- |
| Photos & videos | `Pictures/SaveSama` |
| Audio | `Music/SaveSama` |

Not configurable: Android's MediaStore roots an album by media type, so photos/videos and
audio can't share one folder — SaveSama only names the album. Both paths are shown in Settings.

## Features

- **Share-sheet integration** — tap *Share* on any Instagram post, Threads post, or
  YouTube video and pick *SaveSama*; the app opens and fetches the media
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
- **Files named after the poster** — saves land as `<poster> - <code>.mp4`
  (`natgeo - DblSWtPD9-n.mp4`, `natgeo - DblSWtPD9-n - 3.jpg` for the third carousel
  photo, `… - audio.m4a` for a soundtrack). The caption is never used. Rename any file
  from the Saved tab.
- **Built-in viewer** — tap a saved file to open it: photos pinch-zoom, videos play with
  the native controls, audio gets a transport. Swipe between files. Share, Rename and
  Delete sit on the viewer's toolbar and on the long-press menu — sharing is no longer
  what a tap does.
- **FFmpeg engine** — audio extraction, HD muxing and downscaling run through FFmpeg
  (ffmpeg-kit 6.x, FFmpeg 6.0, 16 KB page-aligned) on Android, with the platform codecs
  as a fallback. See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §7.
- **Original quality (opt-in)** — Settings → *Original quality* saves Instagram/Threads
  video from Meta's DASH manifest (the true upload, VP9, ~1.5x the pixels of the normal
  rendition) when the quality is "Highest". Android-only in practice; see §18.
- **Careful with your account** — Instagram and Threads requests are shaped like the
  site's own, paced with a jittered gap, and back off for minutes when Meta answers
  with a rate limit, a checkpoint or an automation flag. The hidden session WebViews
  load on demand and are parked after 90 s idle. See §19 for why.

## Limitations

- **Instagram, Threads & YouTube.** Instagram posts, reels, photos, and carousels;
  Threads posts (`/@user/post/<code>`, `/post/<code>`, `/t/<code>`, `/share/<token>`);
  YouTube watch/`youtu.be`/Shorts video links.
- **Threads text-only posts** have nothing to download and say so.
- **Light and dark themes.** Settings → Appearance switches between them or follows the
  phone. Dark is the fallback when the OS hasn't reported a preference yet.
- **Saved opens as a grid, with a list view one tap away.** The choice persists. List rows
  show poster, kind, length, date and post code; byte size and resolution aren't in the
  media-library record, so they aren't shown. Renaming is Android-only (iOS photo
  assets have no user-visible filename).
- **Sign out per platform.** Settings → Accounts drops the Instagram or Threads session.
  The signed-in state shown there is a cached hint — see
  [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §14.
- **Selectable resolution (per platform).** Choose a default download quality for
  Instagram, Threads and YouTube on the **Settings** tab (360p up to 1080p, or "Max"), or
  override it for a single save from the format sheet. Photos pick a smaller rendition from
  the source's own ladder. YouTube picks a lower rung, and assembles 1080p by muxing its
  separate video/audio streams. Instagram and Threads serve only one *usable* (H.264) video
  rendition, so a capped preference there is honoured by downscaling on-device — slower, and
  the short side is what's matched ("480p" = the shorter dimension lands near 480). See
  [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §9, §12–§14.
- **Instagram/Threads video quality is capped below the original by default.** Meta's DASH
  manifest advertises the full-resolution original (e.g. 1088x1936 where the downloadable
  rendition is 716x1274), but only as VP9. The default download is the muxed H.264
  rendition; the *Original quality* switch in Settings muxes the VP9 original through
  FFmpeg instead. See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §9 and §18.
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
  components/               # Header, LinkInput, MediaCard, ErrorNotice, EmptyState
    WebViewSessionResolver.tsx  # On-demand session WebView + login modal (both platforms)
    webViewSession.ts       # Per-platform config, fetch script, login/block predicates (tested)
    MediaViewer.tsx         # Full-screen photo/video/audio viewer with Share/Rename/Delete
    AssetActionsSheet.tsx   # Long-press menu on a saved file
    RenameDialog.tsx        # Cross-platform rename prompt
    savedName.ts            # Saved-file naming scheme + parser (tested)
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
    sessionThrottle.ts      # Request pacing + cooldowns for Meta sessions (tested)
    download.ts             # Download with progress + save to gallery
    downloadQueue.ts        # Module-level queue; one job at a time, outlives screens
    rangedDownload.ts       # Parallel byte-range downloads + streamed join
    resolutionPlan.ts       # Picks the rendition/plan for a resolution preference
    preferences.ts          # Resolution defaults, theme mode, library view, session hints
    library.ts              # Saved-files listing, share, rename, delete
  theme.ts                  # lightTheme / darkTheme + spacing, radius, type scales
  ThemeProvider.tsx         # Resolves the active theme; useTheme / useThemedStyles
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # jest (URL parser + extraction parser tests)
```

> Note: `expo-share-intent`, `react-native-webview`, `expo-video`, `expo-audio` and the two
> local native modules (`savesama-audio-extractor`, `savesama-download-service`) all require a
> native build — the app does **not** run in Expo Go. Use a development build
> (`eas build --profile development`) or the preview APK. The FFmpeg engine, the rename
> function and the two players were added to native code, so **an existing dev build won't
> pick them up**; rebuild.

> 🔧 **Maintaining this app?** See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — what to
> check if Instagram or Threads extraction breaks, how to test extraction fast, why
> song/audio pages aren't supported, EAS build steps, and environment gotchas.

## Build the preview APK (EAS)

The project is already linked to EAS (`@farazbukhari/savesama`).

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

## Distribution

Sideload only, via GitHub Releases. SaveSama is not on Google Play and will not be:
Play's [Intellectual Property policy](https://support.google.com/googleplay/android-developer/answer/9888072)
prohibits apps that download copyrighted content from third-party services without
authorization, and the [Google Publisher Policies](https://support.google.com/admob/answer/10502938)
behind AdMob prohibit serving ads in one. Both rule out an ad-funded store build, so the
app carries no ad SDK.
