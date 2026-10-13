# Product

<!-- impeccable:product-schema 1 -->

> Interview note: written unattended. The owner asked for every decision to be made without
> him ("make decisions yourself") and no answer channel existed in this run, so facts below come
> from his brief, `AGENTS.md`, `docs/API.md` and the legacy app at tag `legacy-expo`. Items marked
> *(inferred)* are reasoned from that evidence, not confirmed by the owner.

## Platform

android

## Stack

React Native via Expo (managed workflow, prebuild for native config), TypeScript. Sideloaded APK
built by EAS or GitHub Actions. The phone app is a client of the SaveSama server (`server/`,
Python + yt-dlp + ffmpeg) over the HTTP contract in `docs/API.md`.

## Users

One primary user: the owner (Faraz) and, *(inferred)* the few people he hands the APK to. They
use Instagram, YouTube, TikTok, Facebook and Threads on an Android phone and want to keep a
post, reel, short, video or song on the phone itself. The moment of use is short and
interrupt-driven: they are scrolling another app, hit Share, pick SaveSama, choose what to keep,
and go straight back to scrolling. A second, rarer moment is housekeeping: browsing what was
saved, sharing it on, deleting it, or fixing the server when a platform changes.

They are technical enough to run a server in Termux once, following steps, but setup must not
require them to remember anything.

## Product Purpose

Save public media from five platforms to the phone's gallery at the best available quality, with
no account, no ads and no cloud. Success is: share a link, two taps, the file is in the gallery
(album "SaveSama") a few seconds later, and the server keeps nothing behind.

## Positioning

SaveSama is a personal pair: a download server the owner runs himself (usually Termux on the same
phone, sometimes his PC) and a thin, fast phone client for it. Every other downloader is either a
website full of ads or an app that scrapes from the phone and breaks weekly. SaveSama does the
heavy work (yt-dlp, ffmpeg merges, original-quality renditions) on hardware the owner controls,
can update its extractor with one tap, and never signs in to anything, so no account of his can be
flagged or banned.

## Operating Context

- Entry is almost always the Android share sheet or the clipboard, not typing.
- The server is usually `127.0.0.1:8765` in Termux on the same phone; pairing is by deep link
  (`savesama://pair?...`), QR, or manual entry. Several servers can be saved (phone, PC), one active.
- Termux can be killed by Android battery management; "server offline" is a normal state, not an
  exception, and the app must say how to bring it back.
- Platforms throttle or block datacenter and repeated traffic; `rate_limited`, `network` and
  `login_required` are everyday outcomes.
- Files are transferred from server to phone over HTTP with resume, then deleted on the server
  unless the user keeps a copy.

## Capabilities and Constraints

- Platforms: YouTube, Instagram, TikTok, Facebook, Threads. Nothing else is accepted.
- Modes: media (video/photo as-is) or audio only (`.m4a`). Quality is a short-side pixel value or
  "max".
- Carousels: per-item selection.
- No accounts, ever: no platform login, no cookies, no WebView sessions. Private, age-gated and
  login-walled content cannot be saved, and the app says so plainly.
- No telemetry, no analytics, no ads *(the legacy app removed ads deliberately; kept)*.
- Library is the device gallery album "SaveSama" plus a local history of saved links (used for the
  duplicate warning).
- Android only. Package id and album name continue from the legacy app *(inferred: keeps the
  album the owner already has)*.

## Brand Commitments

- Name: **SaveSama** (one word, capital S twice). Gallery album: "SaveSama". Deep-link scheme:
  `savesama`.
- Voice: plain, direct, a little warm. Says what happened and what to do next. No exclamation
  marks, no "Oops", no hype words.
- No existing logo is binding; the legacy icon is not carried forward *(owner asked for a full
  redesign)*.

## Evidence on Hand

- Real API contract: `docs/API.md` (error codes, job stages, info payload).
- Platform knowledge: `git show legacy-expo:docs/MAINTENANCE.md`.
- No user research, testimonials or usage data exist; none may be invented.
- Mockups use illustrative post titles, authors and thumbnails drawn in CSS; they are synthetic
  and labelled as such in `docs/design/`.

## Product Principles

1. **Share, tap, done.** The common path from the share sheet to a saved file is two taps and never
   asks a question it can answer from settings.
2. **Say where the file is.** Every job shows which side it is on (server, in transit, on the
   phone) until it is in the gallery.
3. **Offline is a state, not an error.** When the server is unreachable the app explains the one
   thing to do (open Termux, run `savesama`) and keeps the link queued in the field.
4. **Never sign in.** Anything needing an account is declined with the reason, not worked around.
5. **The owner's hardware, the owner's files.** Nothing is kept on the server or sent anywhere
   else unless the owner turns it on.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for all text in both themes; 48dp minimum touch targets.
- Type in `sp`, layouts survive 130% system font scale.
- Respect Android "Remove animations"; every animated state has an instant equivalent.
- Every icon-only control has an accessibility label; progress is announced (live region) at
  stage changes, not every percent.
