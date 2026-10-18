# SaveSama app design

The binding visual and interaction spec for the Android app in `app/`. Product truth lives in
`PRODUCT.md`; the server contract lives in `docs/API.md`. If this file and a mockup disagree,
this file wins. Rendered mockups: `docs/design/screens/` (412 x 915 dp, light and dark);
their source: `docs/design/mockups/`.

Every number here is in dp (layout) or sp (type). Every colour is a token; components never use a
literal hex. Every user-facing string is in §13 and §14; components never invent copy.

---

## 1. Concept: the deck and the tape

SaveSama does one thing the way people once taped songs off the radio: it catches something
passing through a feed and keeps a copy. The design borrows three things from that world and
nothing else (no reels, no cassette drawings, no skeuomorphism):

1. **The label colour.** A saturated tape-label yellow, **Deck yellow**, is the one brand colour.
   It owns the top of the Grab screen as a full-bleed block (the *deck*), marks whatever is
   selected (nav indicator, chips, segments, carousel picks) and fills progress in dark mode.
   Everything else is near-neutral ground and ink. Action is ink-black, never yellow, so "chosen"
   and "do it" never look alike.
2. **The record button.** The primary Save action carries a small red **REC dot** before its
   label, and a running job shows the same dot as a live lamp. Red appears nowhere else except
   errors, which always also carry an icon and words.
3. **The tape line (signature).** Every job shows one track split into three spans, sized 6:3:1
   and named underneath: **Server · To phone · Saved**. The fill runs left to right through the
   spans as the file moves from the server's disk, over the network, into the gallery. It answers
   the question this product creates ("where is my file right now?") at a glance, everywhere a job
   appears: Grab, Activity, and the onboarding progress.

Type: a wide, audio-gear display face (**Michroma**) only for the wordmark and one- or two-word
screen titles; a narrow-shouldered newspaper grotesk (**Schibsted Grotesk**) for everything else; its compact width plays against Michroma's breadth, with tabular figures for
every number that changes.

What this design refuses (from the legacy audit, §16, and the skills' slop lists): warm near-black
with an orange accent (the legacy look and the category default), cream + rust, purple/blue
gradients, glass, glows, cards with hairline borders, shadows on anything at rest, tiny tracked
uppercase labels, monospace as decoration, eyebrow labels, step numbers as ornament, emoji, and
a centred-everything layout.

## 2. Principles

1. **Share, tap, done.** The common path (share sheet → preview → Save) is two taps. Defaults
   come from Settings; the sheet never asks what it can already answer.
2. **Say where the file is.** Every job shows its span on the tape line until it is in the gallery.
3. **Offline is a state.** Server down is normal (Termux gets killed). Every place that needs the
   server explains the one fix, keeps the user's input, and retries on its own when the app
   returns to the foreground.
4. **Never sign in.** Content that needs an account is declined with the reason (§13).
5. **One left edge.** Text starts 20 dp from the screen edge on every screen; cards sit 8 dp from
   the edge with 12 dp inner padding so their text lands on the same 20 dp edge.

## 3. Colour tokens

Two schemes with the same token names. The app resolves `system | light | dark` from Settings;
`system` follows `useColorScheme()`. No Material You dynamic colour: the deck yellow is the
identity and must not be replaced by wallpaper colours.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `ground` | `#F3F3EF` | `#111110` | Screen background |
| `surface` | `#FFFFFF` | `#1C1C1A` | Cards, sheets, nav bar, dialogs, list groups |
| `sunk` | `#E7E7E1` | `#262624` | Wells: search/form fields, tonal buttons, chips, skeletons, code blocks |
| `pressed` | `#DCDCD5` | `#31312E` | Pressed fill for rows and tonal controls |
| `ink` | `#15140F` | `#F2F1EA` | Primary text and icons |
| `ink2` | `#56554D` | `#A9A89E` | Secondary text and inactive icons |
| `ink3` | `#6B6A61` | `#8F8E85` | Placeholders, disabled labels, pending tape legend |
| `deck` | `#FFD12E` | `#F0C52B` | Grab deck block, onboarding deck (dark is ~10% darker for night use) |
| `onDeck` | `#15140F` | `#15140F` | Text/icons directly on `deck` (both themes: the deck stays yellow) |
| `onDeck2` | `#4F4A2A` | `#4A4524` | Secondary text on `deck` |
| `deckWell` | `#FFFFFF` | `#1C1C1A` | Paste field and clipboard chip inside the deck; content inside uses `ink`/`ink2`/`ink3` |
| `action` | `#15140F` | `#F2F1EA` | Primary button fill, snackbar fill |
| `onAction` | `#FFFFFF` | `#15140F` | Primary button label |
| `select` | `#FFD12E` | `#FFD12E` | Selected chip/segment/nav indicator/carousel check, switch track on |
| `onSelect` | `#15140F` | `#15140F` | Content on `select` |
| `tapeTrack` | `#D6D5CD` | `#33332F` | Unfilled tape span |
| `tapeFill` | `#15140F` | `#FFD12E` | Filled tape span |
| `rec` | `#E0301A` | `#FF5A43` | REC lamp dot on `surface`/`ground` |
| `recOnAction` | `#E0301A` | `#C42B17` | REC dot inside the primary button |
| `badge` | `#E0301A` | `#C42B17` | Activity count badge fill (label `#FFFFFF`) |
| `ok` | `#1A6E43` | `#6FD49B` | Online dot, success icon/text |
| `okOnDeck` | `#1A6E43` | `#1A6E43` | Online dot on the deck |
| `okSoft` | `#DDEFE3` | `#1D3326` | Success banner fill |
| `warn` | `#8A5A00` | `#F5C062` | Warning icon/text (duplicate, rate limit) |
| `warnSoft` | `#F7EBCF` | `#3A2F14` | Warning banner fill |
| `err` | `#B3261E` | `#FFB4AB` | Error icon/text, destructive text buttons |
| `errSoft` | `#F9DEDC` | `#3D1E1B` | Error banner fill, danger button fill |
| `snackAction` | `#FFD12E` | `#8A5A00` | Snackbar action label |
| `scrim` | `rgba(21,20,15,0.42)` | `rgba(0,0,0,0.60)` | Behind sheets and dialogs |
| `mediaScrim` | `rgba(10,10,8,0.62)` | `rgba(0,0,0,0.62)` | Pills on top of thumbnails (duration, type), viewer chrome |
| `mediaInk` | `#FFFFFF` | `#FFFFFF` | Text/icons on `mediaScrim` and in the viewer |
| `viewerBg` | `#000000` | `#000000` | Full-screen viewer only |

Measured WCAG 2.x contrast for every text/background pair the screens use (computed with the
relative-luminance formula; ≥4.5 for text, ≥3 for large text and non-text marks):

| Pair | Light | Dark |
| --- | --- | --- |
| `ink` on `ground` / `surface` / `sunk` / `pressed` | 16.58 / 18.44 / 14.85 / 13.38 | 16.69 / 15.07 / 13.39 / 11.52 |
| `ink2` on `ground` / `surface` / `sunk` | 6.74 / 7.49 / 6.04 | 7.90 / 7.14 / 6.34 |
| `ink3` on `surface` / `ground` / `sunk` | 5.44 / 4.89 / 4.38 (not used for text on `sunk` in light) | 5.18 / 5.74 / 4.60 |
| `onDeck` on `deck` | 12.65 | 11.17 |
| `onDeck2` on `deck` | 6.14 | 5.87 |
| `okOnDeck` dot on `deck` (non-text) | 4.30 | 3.79 (on `#F0C52B`) |
| `onAction` on `action` | 18.44 | 16.28 |
| `onSelect` on `select` | 12.65 | 12.65 |
| `recOnAction` dot on `action` (non-text) | 4.05 | 5.01 |
| `rec` dot on `surface` (non-text) | 4.56 | 5.52 |
| `#FFFFFF` on `badge` | 4.56 | 5.67 |
| `tapeFill` on `tapeTrack` (non-text) | 12.52 | 8.71 |
| `ok` on `ground` / `surface` / `okSoft` | 5.63 / 6.26 / 5.22 | 10.41 / 9.40 / 7.44 |
| `warn` on `warnSoft` / `surface` | 5.01 / 5.93 | 7.89 / 10.24 |
| `err` on `errSoft` / `surface` / `ground` | 5.14 / 6.54 / 5.88 | 8.83 / 10.05 / 11.13 |
| `ink` on `okSoft` / `warnSoft` / `errSoft` | 15.39 / 15.58 / 14.50 | 11.94 / 11.62 / 13.25 |
| `ground` on `action` (snackbar text) | 16.58 | 16.69 |
| `snackAction` on `action` | 12.65 | 5.23 |
| `mediaInk` on `mediaScrim` over mid-grey media | ≥10.9 | ≥10.9 |

Rules:
- Placeholder text only sits on `surface`/`deckWell` in light (5.44); on `sunk` fields use `ink2`
  for placeholders in light (6.04). In dark, `ink3` passes on all wells.
- Yellow is never text on a light background and never a button fill.
- Platform logos are monochrome `ink` (no brand colours): five brand colours would drown the one
  identity colour and fight it on the deck.
- Status bar icons: dark on the deck in both themes (the deck is yellow); otherwise dark in
  light, light in dark. Navigation bar: transparent, button style follows the theme.

## 4. Typography

Fonts (all OFL, all from Expo's font packages):

- `@expo-google-fonts/michroma` → `Michroma_400Regular`
- `@expo-google-fonts/schibsted-grotesk` → `SchibstedGrotesk_400Regular`,
  `SchibstedGrotesk_500Medium`, `SchibstedGrotesk_600SemiBold`, `SchibstedGrotesk_700Bold`
  (Geist was the first pick; the impeccable detector flags it as an overused AI default, so it
  was replaced with a face that has the same `tnum` support)
- Code blocks only: platform `monospace`.

Load all with `useFonts` and keep the splash screen up until they resolve. On Android, a custom
font's weight is selected by family name, never by `fontWeight`; set `fontWeight` only on the
monospace style. Schibsted Grotesk has a `tnum` feature: set `fontVariant: ['tabular-nums']` on every role
marked "tnum" below.

| Role | Family | Size / line (sp) | Letter spacing | Used for |
| --- | --- | --- | --- | --- |
| `display` | Michroma | 26 / 32 | -0.5 | Large top app bar titles (Activity, Library, Server, Settings), onboarding wordmark |
| `wordmark` | Michroma | 19 / 24 | -0.3 | "SaveSama" on the Grab deck |
| `headline` | Schibsted Grotesk SemiBold | 24 / 30 | -0.3 | Onboarding headlines, dialog titles, Server device name, guide title |
| `title` | Schibsted Grotesk SemiBold | 18 / 24 | -0.1 | Section titles, sheet titles, post titles in preview, small top bar title |
| `bodyLarge` | Schibsted Grotesk Regular | 17 / 24 | 0 | Paste field text |
| `body` | Schibsted Grotesk Regular | 16 / 24 | 0 | Body copy, list primary text |
| `bodyStrong` | Schibsted Grotesk Medium | 16 / 24 | 0 | List primary text that needs weight (job titles) |
| `label` | Schibsted Grotesk Medium | 15 / 20 | 0 | Buttons, segments |
| `meta` | Schibsted Grotesk Regular | 14 / 20 | 0 | Secondary lines, helper text (tnum) |
| `metaStrong` | Schibsted Grotesk Medium | 14 / 20 | 0 | Chips, field labels, list secondary that needs weight (tnum) |
| `caption` | Schibsted Grotesk Medium | 12 / 16 | +0.2 | Nav labels, tape legend, duration pills (tnum) |
| `code` | monospace | 14 / 20 | 0 | Copyable commands, tokens in the guide |

Rules: sentence case everywhere (titles too). Michroma never sets more than 14 characters and
never wraps; any longer title uses `headline`. Nothing is smaller than 12 sp. Body measure in
sheets and guides caps at ~60 characters (that is the screen width at 16 sp; no extra constraint
needed). Titles get `numberOfLines` (post titles 2, row titles 1) with tail ellipsis. All `Text`
uses `maxFontSizeMultiplier={1.6}`; `display` and `wordmark` use 1.3 so a wide title cannot
push the app bar out of shape.

## 5. Layout, spacing, touch

- Spacing scale: `2, 4, 8, 12, 16, 20, 24, 32, 40, 56`. Nothing off-scale.
- Screen text edge: **20**. Cards and list groups: **8** from the screen edge, **12** inner
  horizontal padding, **14** vertical. Section title: 24 above, 8 below.
- Edge-to-edge (Expo SDK 53+ default, `react-native-edge-to-edge` behaviour): draw under the
  status and navigation bars; pad with `useSafeAreaInsets()`. The deck paints under the status
  bar. Keyboard: `KeyboardAvoidingView behavior="height"` on forms; the preview sheet footer
  rides above the IME.
- Touch: every target ≥ **48 x 48** with ≥ 8 between targets. Controls painted smaller (chips 36,
  carousel check 24, icon glyphs) get `hitSlop` to reach 48.
- Width: designed at 412 (Pixel 8). Must hold from 360 to 480: rows ellipsize, the deck stays
  full-bleed, the Library grid stays 3 columns (4 columns at ≥ 600 width; tablets are not a target
  but must not break).
- Orientation: portrait only, except the viewer, which rotates freely.

## 6. Shape and depth

- Radii: `xs 4` (Library tiles, duration pills), `sm 10` (chips, small thumbnails in carousel
  strips), `md 14` (form fields, code blocks, 56 dp row thumbnails use 12), `lg 20` (cards, list
  groups, paste field, banners use 16), `sheet 28` (sheet top corners, dialogs), `pill 999`
  (buttons, segmented, status pills, nav indicator).
- Depth is a tone step, never a line: `ground` → `surface` → `sunk`. No hairlines, no outlined
  cards. Inside a list group, rows are separated by a 2 dp gap of `ground`.
- Shadow exists only on things that float over content: sheets
  (`elevation 8`, light `shadowColor #15140F` opacity 0.14 radius 28 offset y -8; dark opacity
  0.5), dialogs (`elevation 6`) and the snackbar (`elevation 6`).
- Focus rings (hardware keyboard / switch access): 2 dp `ink` ring with 2 dp offset on every
  pressable; inputs show the same ring when focused.

## 7. Icons

`phosphor-react-native` (needs `react-native-svg`). One family everywhere. Default weight
`regular`, active nav item `fill`, checks inside selected chips/carousel `bold`. Sizes: 24
default, 20 inline with `label`/`body`, 18 in chips, 16 next to `meta`/`caption`. Colour from the
text colour of the context. Every icon-only control has `accessibilityLabel` (§14).

| Meaning | Phosphor name |
| --- | --- |
| Grab tab | `Link` |
| Activity tab | `Pulse` |
| Library tab | `Images` |
| Server tab | `HardDrives` |
| Settings tab | `Gear` |
| YouTube / Instagram / TikTok / Facebook / Threads | `YoutubeLogo` / `InstagramLogo` / `TiktokLogo` / `FacebookLogo` / `ThreadsLogo` |
| Paste | `ClipboardText` |
| Close, cancel job, dismiss | `X` |
| Retry | `ArrowCounterClockwise` |
| Update extractor | `ArrowsClockwise` |
| Share | `ShareNetwork` |
| Delete | `Trash` |
| Info | `Info` |
| Search | `MagnifyingGlass` |
| Video / Photo / Audio | `FilmStrip` / `ImageSquare` / `MusicNotes` |
| Already saved | `ClockCounterClockwise` |
| Needs account | `Lock` |
| Unsupported link | `Prohibit` |
| Not found | `LinkBreak` |
| Rate limited | `HourglassMedium` |
| Platform unreachable | `CloudSlash` |
| Server offline | `Plugs` |
| Server online | `PlugsConnected` |
| Generic error | `WarningCircle` |
| Success | `CheckCircle` |
| Scan QR | `QrCode` |
| Enter details | `Keyboard` |
| This phone / PC | `DeviceMobile` / `Desktop` |
| Copy | `Copy` |
| Terminal / guide | `Terminal` |
| Open elsewhere | `ArrowSquareOut` |
| Back | `ArrowLeft` |
| More | `DotsThreeVertical` |
| Camera | `Camera` |
| Play / Pause | `Play` / `Pause` (fill weight) |
| Vibration | `Vibrate` |
| Spinner | not an icon: `ActivityIndicator` coloured from context |

## 8. Motion

Tokens: `short 120`, `medium 240`, `long 400`, `pulse 1600` ms. Easing: `standard`
`cubic-bezier(0.2, 0, 0, 1)`, `decelerate` `(0.05, 0.7, 0.1, 1)`, `accelerate` `(0.3, 0, 0.8,
0.15)`. Use Reanimated (`withTiming`, `withSpring`, layout transitions); never animate layout
properties other than through Reanimated layout transitions.

| What | Motion | Why |
| --- | --- | --- |
| Press on buttons, chips, tiles | scale 0.97 in 90 ms `standard`, back in 160 ms; rows use `android_ripple` `ink` at 10% instead of scale | Confirms the touch landed |
| Preview / any sheet | enter: translateY 100% → 0, `long` `decelerate`; scrim 0 → 1 `medium`; exit `medium` `accelerate`. Drag to dismiss: release past 35% height or > 900 dp/s; otherwise `withSpring({damping: 26, stiffness: 260})` back | Keeps the source screen in place underneath |
| Sheet loading → content | crossfade `medium` | No jump between skeleton and content |
| Tape fill | to the new value over 900 ms linear after each 1 s poll; never moves backwards except a retry, which resets to 0 instantly | Reads as continuous motion from discrete polls |
| Stage change | finishing span completes in `medium`; the next legend label goes `ink3` → `ink` in `medium`; status line crossfades `short` | Makes the hand-over visible |
| Processing (ffmpeg) / saving to gallery | the active span is full and its opacity breathes 1 → 0.5 → 1 over `pulse` | Work with no percentage still shows life, without a fake number |
| Saved | last span fills, 400 ms hold, then the tape collapses (height 6 → 0, opacity → 0, `medium`) while a `CheckCircle` scales 0.6 → 1 `medium` `decelerate`; the row moves to Done with `LinearTransition` `medium` | The signature's payoff |
| REC lamp and Activity badge | opacity 1 → 0.35 → 1 over `pulse`, `easeInOut`, only while a job is running or transferring | "Recording" without motion elsewhere |
| Clipboard suggestion | fade + translateY 8 → 0, `medium` `decelerate` | Arrives without shoving the layout (space is reserved) |
| Tab change | fade-through: out 90 ms, in 210 ms with scale 0.98 → 1 | Material fade-through |
| Snackbar | translateY 16 → 0 + fade, `medium`; auto-hide after 4 s (6 s with an action) | |
| Library select | tile scales to 0.92 and the check pops in, `short` | |
| Skeleton | opacity 0.55 ↔ 1 over `pulse` | |

Reduced motion (`useReducedMotion()` / Android "Remove animations"): no scale, no translate, no
pulse; sheets and tabs crossfade in `short`; tape fill jumps to the new value; skeletons are
static.

## 9. Haptics

`expo-haptics`, all gated by Settings → Vibration (default on).

| Event | Call |
| --- | --- |
| Chip, segment, carousel item toggled | `selectionAsync()` |
| Paste tapped, Save tapped | `impactAsync(Light)` |
| Library long-press enters selection | `impactAsync(Medium)` |
| A file lands in the gallery (app in foreground; at most one per 1.5 s) | `notificationAsync(Success)` |
| Resolve error shown, job fails while app is in foreground | `notificationAsync(Error)` |

## 10. Components

Every pressable: `Pressable` with the press motion of §8, the focus ring of §6, and
`accessibilityRole`. "Disabled" never relies on opacity alone.

### 10.1 Button
| Variant | Fill / label | Size |
| --- | --- | --- |
| `primary` | `action` / `onAction` | 48 high (56 for the sheet CTA, full width), padding 20, radius pill, `label` |
| `tonal` | `sunk` / `ink` (inside the deck well: `sunk`) | 48, padding 20 |
| `text` | none / `ink`, underlined 1 dp, offset 4 | 48 tall hit, padding 12 |
| `danger` | `errSoft` / `err` | 48 |
| `icon` | none (or `sunk` when tonal) / `ink` | 48 circle, glyph 24 |

States: pressed = scale 0.97 + `pressed` overlay (primary: label/fill unchanged, overlay
`onAction` at 12%); disabled = fill `sunk`, label `ink3`, no REC dot, not focusable as action
(`accessibilityState.disabled`); loading = `ActivityIndicator` 20 in label colour replaces the
leading icon/dot, label switches to its gerund form (§14), width never shrinks; error = buttons
don't show errors, the surrounding context does.

The Save CTA is `primary` with a leading 12 dp `recOnAction` circle.

### 10.2 Paste field (Grab)
`TextInput multiline`, `bodyLarge`, fill `deckWell`, radius 20, padding 16, min 3 lines, max 6
lines then scrolls, placeholder `ink3`, cursor and selection handles `ink`, selection highlight
`select` at 45%. Clear button (`X`, icon variant) top-right when it has text. Footer row inside
the well, right-aligned: tonal **Paste**, primary **Get**. Under the well: validation message
(`meta`, `err` with `WarningCircle` 16) or the parsed count (`meta`, `onDeck2`).
`autoCorrect={false}`, `autoCapitalize="none"`, `keyboardType="url"` is not used (multi-line).

### 10.3 Clipboard suggestion
Row in `deckWell`, radius 16, padding 8/8/8/14: platform icon 24, two lines ("Link on your
clipboard" `metaStrong` `ink`; the link without scheme/`www.`, `meta` `ink2`, 1 line, middle
ellipsis), primary button **Get it** (40 paint / 48 hit, padding 16) and an `X` icon button
(dismiss for this exact link). Space for it is reserved only when it shows; it appears with §8
motion.

### 10.4 Chip (choice and filter)
Paint 36, hit 48, radius 10, padding 14, `metaStrong`. Off: `sunk`/`ink`. On: `select`/`onSelect`
with a leading `Check` 16 bold. Disabled: `sunk`/`ink3`, not focusable. Pressed: `pressed` fill.
Single-select groups use `accessibilityRole="radio"`; filters use `checkbox`.

### 10.5 Segmented button
Container `sunk`, radius pill, padding 4, height 48. Segments equal width, 40 high, radius pill,
`label`. Selected `select`/`onSelect`; unselected transparent/`ink2`. 2 or 3 segments only.
`accessibilityRole="radio"` per segment.

### 10.6 Tape line (signature)
- Track: row of three spans, flex `6 : 3 : 1`, 3 dp gaps, 6 dp tall, radius 3, `tapeTrack`.
- Fill: `tapeFill`, radius 3, left-anchored; animated with `scaleX` on a full-width child
  (transform origin left) so it stays on the UI thread.
- Legend: same flex row under the track (6 dp gap), `caption`: "Server", "To phone", "Saved"
  (last right-aligned). The current span's label is `ink`, finished spans `ink2`, pending `ink3`.
- Mapping from job state (server `status` + local transfer state):

| State | Span 1 Server | Span 2 To phone | Span 3 Saved |
| --- | --- | --- | --- |
| `queued` | 0, label `ink` | 0 | 0 |
| `running` | `progress` (0 when null: breathing pulse) | 0 | 0 |
| `processing` | full, breathing | 0 | 0 |
| done on server, transfer not started | full | 0, label `ink` | 0 |
| transferring | full | received / total | 0 |
| writing to gallery | full | full | full, breathing |
| saved | full | full | full → collapse (§8) |
| `error` | fill stays where it stopped, recoloured `err`; failed span label `err` | | |
| `cancelled` | all `tapeTrack`, labels `ink3` | | |

- Accessibility: `accessibilityRole="progressbar"`, `accessibilityValue={{min: 0, max: 100, now,
  text}}` where `now` = span1×60 + span2×30 + span3×10 and `text` is the status line (§13.3).
  Announce stage changes once via `AccessibilityInfo.announceForAccessibility` (not every percent).

### 10.7 Job row
Inside a card (Grab) or as a list row (Activity): thumbnail 56 (radius 12, `expo-image`
`contentFit="cover"`, placeholder `sunk` with the platform icon 24 `ink3`), then title
(`bodyStrong`, 1 line), status line (`meta`, tnum, leading REC lamp 8 dp while running or
transferring, `CheckCircle` (fill) 16 `ok` when saved, the error's icon (§7) 16 `err` when failed;
max 2 lines), then the
tape line (hidden once saved or cancelled). Trailing control, 48 icon button: `X` "Cancel" while
queued/running/processing/transferring; `ArrowCounterClockwise` "Retry" when failed or cancelled;
none when saved (row tap opens the file in the viewer). Mode/quality suffix in the status line of
finished rows: "Audio" or "720p".

### 10.8 Banner (inline notice)
Radius 16, padding 14/16, icon 20 tinted by variant, `bodyStrong` title, `meta` body in `ink`
(not grey on tinted fills), optional text buttons underneath, left-aligned. Variants: `warn`
(`warnSoft`, icon `warn`), `err` (`errSoft`, `err`), `ok` (`okSoft`, `ok`), `info` (`sunk`,
`ink2`). On the deck, banners use `deckWell` fill with the variant's icon colour.

### 10.9 Snackbar
Material snackbar: fill `action`, text `ground` `body` 15, action `snackAction` `label` 600,
radius 12, min height 52, 12 from the screen edges, 12 above the nav bar (or above the gesture
inset when there's no nav bar). One at a time; a new one replaces the old.

### 10.10 Bottom sheet
`@gorhom/bottom-sheet` modal. `surface`, top radius 28, handle 32 x 4 `ink3` at 60%, 12 from the
top. Max height 92% of the window; content scrolls; a pinned footer (`surface`, padding 12/20 +
bottom inset) holds the CTA. Back gesture closes it (predictive back preview on Android 14+).

### 10.11 Dialog
Material basic dialog: `surface`, radius 28, padding 24, `headline` title, `body` `ink2` text,
actions as text buttons right-aligned (destructive action label `err`, not underlined). Only for
destructive confirmations and nothing else.

### 10.12 Navigation bar
Material 3: `surface`, 80 high + bottom inset. Five destinations, labels always shown
(`caption`; active `ink` SemiBold, inactive `ink2`). Active indicator 64 x 32 pill `select` with
the `fill` icon in `onSelect`. Activity carries a `badge` (min 18, radius 9, `#FFFFFF` 11 sp
SemiBold tnum) with the count of unfinished jobs; it pulses (§8) while any job moves. No badge
when 0. `accessibilityLabel` for Activity with jobs: "Activity, 2 in progress".

### 10.13 Top app bar
Large title variant on Activity, Library, Server, Settings: 72 high, title `display` at the 20 dp
edge, baseline 12 above the bar bottom, trailing actions as icon or text buttons with the last
one's glyph aligned to the 20 dp right edge. On scroll the title collapses into a 64 dp small
bar (`title` role) on `ground`; no elevation line, a `surface` fill fades in instead. Pushed
screens (guide, pair) use the small bar with a back `ArrowLeft`.

### 10.14 List row and list group
Group: `surface`, radius 20, 8 from the edges, rows separated by 2 dp `ground`. Row min height 56
(one line) / 64 (two lines) / 72 (with 56 thumbnail); leading icon 24 at the 20 dp edge, 16 gap;
trailing switch/value/chevron. Value text `meta` `ink2`. Ripple `ink` 10%.

### 10.15 Switch
Material 3 switch: on = track `select`, thumb `onSelect` with a `Check`; off = track `sunk` with a
2 dp `ink3` outline, thumb `ink3`. The whole row toggles it.

### 10.16 Status pill
32 high, radius pill, padding 10/12, dot 8 + `metaStrong`. On the deck: fill `onDeck` at 9%.
Elsewhere: `sunk`. States: online (`ok`/`okOnDeck` dot, device name or "Online"), offline (`ink3`
dot, "Offline"), checking (12 dp spinner, "Checking"), updating (12 dp spinner, "Updating"),
not paired (`Plugs` 16, "Not paired").

### 10.17 Form field
Label above (`metaStrong` `ink2`, 6 below), input 52 high, `sunk`, radius 14, padding 16, `body`;
placeholder `ink2` in light / `ink3` in dark. Focus: fill `surface` + 2 dp `ink` ring. Error:
2 dp `err` ring, helper under it in `err` with `WarningCircle` 16. Helper (no error): `meta`.

### 10.18 Code block
`sunk`, radius 14, padding 14/16 with a 48 `Copy` icon button at the trailing edge, `code` text,
wraps (no horizontal scroll). After copying: icon becomes `Check` for 1.5 s and a snackbar says
"Copied".

### 10.19 Empty state
Left-aligned at the 20 dp edge, top at one third of the free height: icon 32 `ink2`, 12 gap,
`title`, 4 gap, `body` `ink2`, 16 gap, one tonal button. Never centred, never illustrated.

### 10.20 Skeleton
`sunk` blocks shaped like the real content (thumb, two text bars at 70% and 40% width), radius
of the real element, pulsing per §8.

### 10.21 Thumbnail
`expo-image` with `contentFit="cover"`, `transition={160}`, `cachePolicy="memory-disk"`. Thumbnail
URLs from the platform CDN expire; on load failure show the `sunk` placeholder with the platform
icon. Duration pill (bottom-left, 6 inset): `mediaScrim`, radius 4, padding 2/6, `caption`
`mediaInk`, tnum.

## 11. Structure and navigation

- Tabs (bottom nav): **Grab** (start), **Activity**, **Library**, **Server**, **Settings**.
- Overlays on top of tabs: Preview sheet, Batch sheet, Pair sheet, Info sheet, Quality picker
  sheet, dialogs, snackbar.
- Pushed full screens: Viewer, QR scanner, Enter details, Termux guide.
- Onboarding runs before the tabs when no server has ever been paired and the user hasn't
  chosen "Do this later"; it's a 3-step stack.
- Deep link `savesama://pair?host=&port=&token=&name=` → Pair confirmation sheet over whatever is
  open (onboarding included). Validate: host is an IPv4/IPv6 literal or hostname, port 1-65535,
  token non-empty; otherwise show the invalid-link error (§13.6).
- Share intent (`expo-share-intent`, `text/plain`): open Grab and immediately the Preview sheet
  for the first supported link; several links → the Batch sheet. If the shared text has no
  supported link: Grab with the text in the paste field and the unsupported message.
- Android back: closes the topmost sheet/dialog, then pops pushed screens, then goes to Grab from
  any other tab, then exits. `predictiveBackGestureEnabled: true`.
- Foreground (`AppState` → active): re-check the active server's `/info`, sync jobs, pull any
  finished files (§12.4), and check the clipboard (§12.2).

## 12. Screens

Mockup files are named in brackets; each exists as `-light.png` and `-dark.png` in
`docs/design/screens/`.

### 12.1 Onboarding [`onboarding-welcome`, `onboarding-server`]
Layout (step 1): the deck owns the top 360 dp (wordmark in `display` at 34/40, 56 below the
status bar; the headline at the bottom of the deck in `headline` enlarged to 30/36, `onDeck`,
max width 330); below on `ground`: onboarding tape line (3 equal spans, legend "Welcome",
"Server", "Gallery"), body, platform grid, and the primary action pinned to the bottom (full
width, 56). Steps 2 and 3 drop the deck: tape line at the top, then headline, body, state block,
actions pinned at the bottom (primary or tonal 56 + text button).

1. **Welcome.** Headline, body, primary "Get started".
2. **Server.** On entry the app probes `http://127.0.0.1:8765/api/v1/info` (2 s timeout).
   - Checking: status row with spinner "Looking for a server on this phone…".
   - Found (`app === "savesama"`) but not paired: ok banner "Found SaveSama {version} on this
     phone" + the restart instruction and a code block `savesama` (command per `docs/SERVER.md`).
     The app keeps polling `/info` every 3 s; the pairing itself arrives as the deep link.
   - Not found: three list rows: "Set up on this phone" (→ guide), "Scan a QR code", "Enter
     details". Text button "Do this later" (→ Grab, not-paired state).
   - Paired (deep link accepted): step 3.
3. **Gallery.** "Paired with {name}" ok banner, explanation, primary "Allow access" (requests
   media-library permission: photos, videos, audio). Granted → Grab. Denied → body switches to
   the denied copy and the primary becomes "Continue".

### 12.2 Grab [`grab`, `grab-offline`]
Top to bottom: deck (status bar inset, 56 dp row with `wordmark` left and the server status pill
right; paste field; optional clipboard suggestion; parse/validation message), then on `ground`:
"Now saving" section (only with unfinished jobs, max 2 job cards then a text button "See all in
Activity"), "Recent" section (last 5 links from local history; text button "Clear" →
confirmation dialog), or, when both are empty, the first-use help (`body` `ink2` + a row of the
five platform icons with their names).

- Status pill tap → Server tab.
- Clipboard check on foreground: if the clipboard has a supported link that isn't already in the
  field, wasn't dismissed and isn't the last link resolved, show the suggestion. (Android 13+
  shows its own "pasted from your clipboard" toast when the app reads the clipboard; read it only
  once per foreground and only when `Clipboard.hasStringAsync()` is true.)
- Parsing: split on whitespace/newlines, keep tokens whose host is in the API host list
  (§11 of `docs/API.md`), strip tracking params is the server's job. 0 valid → error message, Get
  disabled. 1 valid → "Get" opens the Preview sheet. n valid → "Get {n} links" opens the Batch
  sheet. Some invalid → parse message lists how many lines are skipped.
- Duplicate check is per link against local history and shows in the sheet, not here.
- Not paired: the pill reads "Not paired"; an info banner in the deck under the field:
  "Pair a server to start saving." with button "Pair a server" (→ Server tab, add flow). Get
  stays enabled and opens the same banner as a sheet error if tapped.
- Server offline: pill "Offline"; err banner in the deck under the field with the offline copy
  and buttons "Open Termux" (launches `com.termux` if installed, else hidden) and "Try again".
  The field keeps its text.

### 12.3 Preview sheet [`preview-carousel`, `preview-video`, `preview-error`]
Opens immediately on Get/share with a skeleton; `POST /resolve` fills it.

Header (56): platform icon 20 + platform name (`metaStrong` `ink`) + " · " + author (`meta`
`ink2`, ellipsized); trailing close `X`.

Media:
- One item: thumbnail full width minus 40, aspect from the item's `width/height` clamped
  between 16:9 and 4:5, radius 16; duration pill; for an image item a type pill "Photo".
- Several items: count line ("{n} items", `metaStrong`) with a trailing text button "Select all"
  / "Clear" (toggles), then a horizontal strip of 104 x 130 tiles (radius 10, 8 gap, 20 side
  padding, snaps). Each tile has a selection check top-right: 24 dp circle, off = 2 dp `#FFFFFF`
  ring on `mediaScrim`, on = `select` fill with `Check` bold 16 `onSelect`; hit area is the whole
  tile. Video tiles show the duration pill. Default: all selected. Selected tiles keep full
  opacity; unselected dim to 55%.

Text: title (`title`, 2 lines) then meta (`meta`: "{Type} · {duration}" e.g. "Reel · 0:31",
"Video · 12:04", "Post · 4 items").

Duplicate banner (warn) when the link is in local history.

Format (segmented): shown when the selection contains a video or audio item. Labels "Video" /
"Audio only"; if the selection also contains photos the first label reads "Video & photos" and a
helper under it says "Photos are saved as they are."

Quality (chips, `radio`): shown when Format is Video and the selection has video. Chips: "Best"
then each distinct value of the selected items' `qualities` as "{q}p". Default from Settings for
this platform; if that value isn't offered, the highest offered value below it, else the lowest.
"Best" sends `"max"`. Helper: "Best is {q}p for this post." when Best is chosen.

Footer CTA (primary 56, REC dot): "Save video", "Save photo", "Save audio", "Save {n} items";
disabled "Select something to save" when the selection is empty. Loading: "Starting…". On 201:
sheet closes, history updated, snackbar "Saving {n} item(s)" with action "View" (→ Activity).

Errors replace media/text/controls with an error block: icon 32 (§7) tinted `err` (`warn` for
rate limit), `headline` title, `body` text, the link in `meta` `ink2`, and the actions of §13.1 as
buttons in the footer. Sheet-level errors keep the header.

### 12.4 Batch sheet [`batch`]
Title "Save {n} links" (`title`), close. Format segmented and Quality chips at the top apply to
every link (quality chips: Best, 1080p, 720p, 480p, 360p; the server falls back per API). List of
rows: platform icon, title (or the link while resolving, with a 12 dp spinner), meta "{n} items"
/ "Video · 3:12" / error short copy in `err`. `/resolve` runs for up to 3 links at once. Tapping a
resolved row opens its own Preview sheet (stacked) to customise; returning keeps the edits.
Footer CTA "Save {k} links" counts the rows that resolved; failed rows are skipped and listed.
Duplicate rows show `ClockCounterClockwise` 16 `warn` + "Saved before" in their meta.

### 12.5 Activity [`activity`]
Large title "Activity"; trailing text button "Clear finished" when any job is done, failed or
cancelled (removes them from the list and calls `DELETE` for server jobs still present).
Sections in this order, each only when non-empty: "In progress" (queued, running, processing,
transferring, writing), "Failed" (error, cancelled), "Done" (saved; today and the last 50).
Rows per §10.7. Polling: `GET /jobs` every 1 s while the tab is focused and something is
unfinished, every 5 s otherwise while the app is foreground, never in background.

Transfer pipeline (owned by the app, shown on the tape): when a job turns `done`, download
`/jobs/{id}/file` to the cache with `Range` resume (keep partial on failure), write to the
"SaveSama" album with `expo-media-library`, record history, then `DELETE /jobs/{id}` unless
"Keep a copy on the server" is on. On foreground after the app was closed, the same pipeline runs
for every `done` job not yet in local history. Two transfers at a time.

States: empty (§13), server offline banner (err) at the top of the list with "Open Termux" /
"Try again", gallery permission missing banner (warn) with "Allow access" when a transfer is
blocked on it, storage full banner (err).

Cancel: no dialog; snackbar "Download cancelled" with "Undo" (→ retry). Swipe is not used.

### 12.6 Library [`library`, `library-empty`]
Large title "Library", trailing `meta` count ("214 saved"). Search field (sunk, `MagnifyingGlass`
leading, placeholder "Search your saves", clear `X`). Filter chips (single-select): "All",
"Video", "Photo", "Audio". Grid: 3 columns, 2 dp gaps, edge to edge (tiles square, radius 4 only
on the outer corners is not needed: all tiles radius 4), grouped by date headers ("Today",
"Yesterday", "This week", "Earlier", then month names: `title` at the 20 dp edge, 24 above, 8
below). Video tiles: duration pill. Audio tiles: the saved thumbnail if known, else `sunk` with
`MusicNotes` 32 `ink2` and the title in `caption` (2 lines); plus an "Audio" pill top-left.
Source: assets in the "SaveSama" album via `expo-media-library` (paged 60 at a time), joined with
local history (title, platform, link) by asset id; search matches history title, author and
platform.

Tap → Viewer. Long press → selection mode: top bar becomes "{n} selected" with `X` (exit), share
and delete; tiles show the check of §12.3.

States: loading skeleton grid; empty; no search results; permission denied (limited access on
Android 14 counts as granted, with a warn banner "SaveSama can only see some of your media." +
"Allow all"); error reading the album (err banner, "Try again").

### 12.7 Viewer [`viewer`]
`viewerBg`, full-bleed media, status/nav bars hidden while chrome is hidden. Chrome (toggle on
tap, auto-hide after 3 s while playing): top `mediaScrim` bar with back, title (1 line,
`bodyStrong` `mediaInk`), and actions share, info, delete; bottom area for video uses
custom controls over `expo-video` (`VideoView nativeControls={false}`): seek bar (4 dp
`#FFFFFF` 24% track, `#FFD12E` fill and 16 dp thumb, elapsed/total `caption` tnum under it) and a
64 dp white play/pause disc, the platform/author/saved line above the seek bar; images use pinch-zoom (1-5x) and double-tap zoom (2.5x at the tap
point) with `react-native-gesture-handler`; audio shows the thumbnail (or `MusicNotes` 64) at
280, title, author, a seek bar (`select` fill on `#FFFFFF` 24% track) with elapsed/total
(`caption` tnum) and a 64 play/pause. Horizontal swipe moves between items in the current
filter; swipe down past 25% or 900 dp/s closes. Info opens the Info sheet (rows: Title, From,
Link with copy, Saved, Size, Dimensions, Duration, File name). Delete → dialog (§13.5), then
the Android system confirmation.

### 12.8 Server [`server`, `server-offline`]
Large title "Server". Status card: device name (`headline`), status pill, then rows (`meta` label
`ink2` left, `metaStrong` value right): "Address" `127.0.0.1:8765`, "Extractor" `yt-dlp
2026.08.19`, "ffmpeg" "Ready" / "Missing", "Server" "SaveSama 0.1.0 · API 1". Buttons row:
tonal "Update extractor" (`ArrowsClockwise`), text "Setup guide".

Then "Servers" section: list group with one row per saved server (radio `select` for the active
one, name, `meta` address, trailing status text "Online"/"Offline"/"Checking", overflow `More`
→ "Rename", "Remove"), and a last row "Add a server" (`Plus` → Pair sheet). Tapping a row makes
it active (no confirmation; snackbar "Now using {name}").

Discovery card (info banner above "Servers") when `/info` on `127.0.0.1:8765` answers but no
saved server points there: "Found a server on this phone" with "Pair it" (→ the restart
instruction sheet, same copy as onboarding step 2 found state).

Update extractor: `POST /maintenance/update` → button loading "Updating…", pill "Updating";
poll `/info` every 2 s for up to 60 s. Outcomes: new version → snackbar "Extractor updated to
{version}"; same version → snackbar "Already up to date ({version})"; no answer after 60 s → err
banner (§13.4). Disabled while any job is running, with helper "Finish or cancel running
downloads first."

Offline: status card shows the offline pill, the rows reduce to "Address" and "Last seen"
("Today at 08:12"), and an err banner with the steps (an ordered list:
open Termux, run `savesama`, come back), "Open Termux", "Try again". Unauthorized (401): warn
banner "This server doesn't accept SaveSama's key any more." + "Pair again".

### 12.9 Pair [`pair`, `pair-manual`, `pair-scan`]
Pair sheet "Add a server": three rows ("Scan a QR code" — "Point the camera at the code the
server prints."; "Enter details" — "Type the address and key by hand."; "Server on this phone" —
"Set it up in Termux, step by step."). Deep link confirmation sheet: headline "Pair with
{name}?", `meta` "{host}:{port}", primary "Pair", text "Cancel". Pairing = `GET /info`
(`app === "savesama"`, `api === 1`) then authenticated `GET /jobs`; then save and activate.

QR scanner (`expo-camera` `CameraView` with `barcodeScannerSettings={{barcodeTypes: ['qr']}}`):
full-screen camera, `mediaScrim` top bar with back and title "Scan the pairing code", a 240 dp
square guide (corner marks only, 4 dp `#FFFFFF`, radius 20), hint under it "Run savesama on your
PC or in Termux. The code appears in the terminal." and a text button "Enter details instead".
Only `savesama://pair` payloads are accepted; others show the invalid-code snackbar and keep
scanning. Permission denied → screen body becomes the camera empty state (§13.6).

Enter details: fields Name (optional, placeholder "My PC"), Address (placeholder
"192.168.1.20"), Port (default "8765", numeric), Key (placeholder "Paste the key the server
printed", secure entry with show toggle). Primary "Pair" (loading "Checking…"). Errors under the
relevant field or as a banner for connection results (§13.6).

### 12.10 Termux guide [`guide`]
Small top bar with back and title "Set up on this phone". Intro `body`. Ordered steps (a real
ordered list: step number in a 28 dp `select` circle, `metaStrong` `onSelect`), each with a
`bodyStrong` heading, `meta` explanation and code blocks. Commands come from one constant in
the app that must match `docs/SERVER.md` exactly; the mockup's commands are illustrative.
Buttons: "Open F-Droid" (external), "Open Termux" (when installed). Footer: "Using a PC instead?"
text + "Scan its QR code".

### 12.11 Settings [`settings`]
Large title "Settings". Groups (section titles `metaStrong` `ink2`, 24/8):
- **Appearance**: Theme segmented "System" / "Light" / "Dark".
- **Saving**: "Default format" segmented "Video" / "Audio only"; "Default quality" header row
  then one row per platform (icon, name, value "Best"/"1080p"…, chevron) → Quality picker sheet
  (radio rows: "Best available", "2160p", "1440p", "1080p", "720p", "480p", "360p"; helper
  "If a post doesn't offer this, SaveSama takes the next one down."); "Keep a copy on the server"
  switch with helper; "Warn before saving a link again" switch (default on).
- **Feedback**: "Vibration" switch with helper.
- **Privacy**: static text block (no control) with `Lock` icon.
- **History**: "Clear link history" (danger text row) → dialog.
- **About**: "Version" value, "Open-source licences" (→ list screen), "Source code" (external).

## 13. Copy: errors and states

Voice: plain, specific, calm. Say what happened, then what to do. No "Oops", no exclamation
marks, no "please" padding, no blame. `{Platform}` is the display name (YouTube, Instagram,
TikTok, Facebook, Threads); `{name}` the server's device name.

### 13.1 Resolve errors (Preview / Batch)
| Code | Title | Body | Actions |
| --- | --- | --- | --- |
| `unsupported_url` | SaveSama can't open this link | It takes links from YouTube, Instagram, TikTok, Facebook and Threads. | Close |
| `login_required` | This post needs an account | It's private, age-restricted or only visible when signed in. SaveSama never signs in, so your accounts stay safe from flags and bans, but it can't open posts like this. Public posts save fine. | Close |
| `not_found` | This post isn't there | It may have been deleted, or the link is incomplete. Check the link and try again. | Close · Try again |
| `rate_limited` | {Platform} is slowing things down | Too many requests in a short time. Wait a few minutes, then try again. | Close · Try again |
| `unavailable` | This one can't be saved | {server message}. If there is no message: {Platform} doesn't offer it as a download. Live streams, region-locked videos and text-only posts can't be saved. | Close |
| `network` | Couldn't reach {Platform} | Your server is running but couldn't connect to {Platform}. Check its internet connection, then try again. | Close · Try again |
| `unauthorized` | Pair again | {name} no longer accepts SaveSama's key. It may have been reset. Pair again to keep using it. | Pair again |
| `bad_request` | The server didn't understand that | Updating the app or the server usually fixes this. | Close |
| `internal` | The server hit a problem | Try again. If it keeps happening, update the extractor in the Server tab. | Close · Try again |
| server unreachable (fetch fails / 10 s connect timeout) | Server isn't answering | SaveSama can't reach {name} at {host}:{port}. On this phone, open Termux and run savesama. On a PC, check it's on and on the same Wi-Fi. | Open Termux · Try again |
| resolve timeout (60 s) | This is taking too long | {Platform} is slow to answer. Try again in a moment. | Close · Try again |
| not paired | Pair a server first | SaveSama needs your server to read posts. It takes a minute on this phone. | Pair a server |
| no items (`items` empty) | Nothing to save here | This post has no photo, video or audio. | Close |

### 13.2 Job errors (Activity row status line, one line)
| Code / cause | Status line |
| --- | --- |
| `login_required` | Needs an account. SaveSama can't save it |
| `not_found` | The post was deleted or the link is wrong |
| `rate_limited` | {Platform} is throttling. Retry in a few minutes |
| `unavailable` | Can't be downloaded: {server message} |
| `network` | Server couldn't reach {Platform} |
| `internal` | Server error. Retry, or update the extractor |
| `conflict` | The server changed state. Retry |
| transfer failed (phone side) | Transfer stopped. Retry to resume |
| storage full | Phone storage is full |
| gallery permission missing | Allow gallery access to finish saving |
| `cancelled` status | Cancelled |

### 13.3 Job status lines
| State | Line |
| --- | --- |
| queued | Waiting on server |
| running, size known | On server · {pct}% · {speed} · {eta} left |
| running, size unknown | On server · {bytes} so far |
| processing, media | On server · Merging video and audio |
| processing, audio | On server · Converting to audio |
| done on server, waiting for the phone | Ready to transfer |
| transferring | To phone · {pct}% · {received} of {total} |
| writing to gallery | Saving to gallery |
| saved | Saved · {size} · {relative time} (+ " · Audio" or " · {q}p") |

### 13.4 Banners and inline states
| Where | Variant | Title | Body | Buttons |
| --- | --- | --- | --- | --- |
| Grab / Activity / Server, offline | err | Server isn't answering | Open Termux and run savesama, then come back. SaveSama checks again by itself. | Open Termux · Try again |
| Grab, not paired | info | Pair a server to start saving | It takes a minute on this phone. | Pair a server |
| Preview, duplicate | warn | You saved this on {date} | Saving it again makes a second copy. | — |
| Activity, gallery permission | warn | Gallery access is off | Allow it so finished files can move into your gallery. | Allow access |
| Activity, storage full | err | Your phone is out of space | Free up some space, then retry the failed transfers. | — |
| Server, update timed out | err | The server didn't come back | It was updating the extractor and hasn't answered for a minute. Open Termux to check on it. | Open Termux · Try again |
| Server, unauthorized | warn | This server doesn't accept SaveSama's key any more | It may have been reset. Pair again to keep using it. | Pair again |
| Server, ffmpeg missing | warn | ffmpeg is missing | Without it, some videos save without sound and audio-only saves fail. In Termux run: pkg install ffmpeg | Copy command |
| Server, discovery | info | Found a server on this phone | SaveSama {version} is running at 127.0.0.1:8765 but isn't paired yet. | Pair it |
| Library, limited access | warn | SaveSama can only see some of your media | Allow access to all photos, videos and audio to see everything it saved. | Allow all |
| Onboarding, found | ok | Found SaveSama {version} on this phone | In Termux, stop it with Ctrl + C and start it again with the command below. It opens this app and pairs by itself. | — |
| Onboarding, paired | ok | Paired with {name} | — | — |
| Server, offline (below the status card) | info | First time on this phone? | The setup guide walks through installing Termux and the server. | Setup guide |

### 13.5 Empty states and dialogs
| Where | Title | Body | Button |
| --- | --- | --- | --- |
| Grab, first use (no jobs, no history) | — | Share a post to SaveSama from any of these apps, or paste its link above. | — |
| Activity empty | Nothing saving | Links you save show up here while your server works on them. | Grab a link |
| Library empty | Nothing saved yet | Everything SaveSama saves lands here and in your gallery's SaveSama album. | Grab a link |
| Library no results | No saves match "{query}" | Try a different word, or another filter. | Clear search |
| Library permission denied | SaveSama can't see your gallery | Allow access to photos, videos and audio so the Library can show what you've saved. | Allow access (or "Open settings" when permanently denied) |
| Library read error | Couldn't read your gallery | Something went wrong while loading. | Try again |
| Servers list empty | No servers yet | Pair the server running on this phone or on your PC. | Add a server |

| Dialog | Title | Body | Actions |
| --- | --- | --- | --- |
| Delete one file | Delete this {video/photo/audio}? | It's removed from your phone and the SaveSama album. This can't be undone. | Cancel · Delete |
| Delete several | Delete {n} files? | They're removed from your phone and the SaveSama album. This can't be undone. | Cancel · Delete |
| Clear recent | Clear recent links? | They're removed from this list and from duplicate checks. Saved files stay. | Cancel · Clear |
| Clear link history | Clear link history? | SaveSama forgets which links you've saved, so it can't warn you about repeats. Saved files stay. | Cancel · Clear |
| Remove server | Remove {name}? | SaveSama forgets its address and key. You can pair it again any time. | Cancel · Remove |

### 13.6 Pairing copy
| Case | Copy |
| --- | --- |
| Address empty / invalid | Enter an address like 192.168.1.20 |
| Port invalid | Port is a number from 1 to 65535 |
| Key empty | Paste the key the server printed |
| Nothing at address | No SaveSama server at {host}:{port}. Check it's running and on the same Wi-Fi. |
| Not a SaveSama server | Something answered at {host}:{port}, but it isn't a SaveSama server. |
| Key rejected (401) | That key wasn't accepted. Copy it again from the server. |
| API mismatch | That server speaks API {n}; this app needs API 1. Update the older one. |
| Invalid deep link / QR | That isn't a SaveSama pairing code. |
| Camera denied, title | Camera access is off |
| Camera denied, body | Allow it to scan the pairing code, or type the details instead. |
| Camera denied, buttons | Allow camera · Enter details |
| Success snackbar | Paired with {name} |
| Already saved | Already paired with {name}. Switched to it. |

## 14. Copy: every other string

**Navigation:** Grab · Activity · Library · Server · Settings.

**Onboarding:**
- Welcome headline: "Save posts to your phone, without an account"
- Welcome body: "Video, photos and audio at the best quality each app offers. No ads, no cloud, nothing to sign in to." followed by the five platforms as icon + name pairs in a 2-column grid (`bodyStrong`)
- Welcome button: "Get started"
- Server headline: "SaveSama works with a server you run"
- Server body: "The server does the downloading. It runs in Termux on this phone, or on your PC. Your files never pass through anyone else."
- Checking: "Looking for a server on this phone…"
- Rows: "Set up on this phone" / "Install Termux and the SaveSama server, step by step." · "Scan a QR code" / "For a server on your PC." · "Enter details" / "Type the address and key by hand."
- Found state extras: waiting line "Waiting for the pairing link…" (12 dp spinner), tonal button "Open Termux" (hidden when Termux isn't installed)
- Skip: "Do this later"
- Gallery headline: "One last thing"
- Gallery body: "SaveSama puts what you save in a SaveSama album in your gallery. Allow access to photos, videos and audio so it can."
- Gallery denied body: "Without access, files can't reach your gallery. You can allow it later from the Library."
- Gallery buttons: "Allow access" · "Continue"
- Tape legend: "Welcome" · "Server" · "Gallery"

**Grab:**
- Placeholder: "Paste links from YouTube, Instagram, TikTok, Facebook or Threads. One per line."
- Buttons: "Paste" · "Get" / "Get {n} links" / loading "Getting…"
- Clear field a11y: "Clear links"
- Clipboard: "Link on your clipboard" · button "Get it" · dismiss a11y "Ignore this link"
- Parse: "{n} links ready" · "{k} lines aren't links SaveSama can open and will be skipped." · none valid: "That isn't a link SaveSama can open. Try a link from YouTube, Instagram, TikTok, Facebook or Threads."
- Sections: "Now saving" (+ `meta` "{n} jobs") · "See all in Activity" · "Recent" · "Clear"
- Recent row meta: "{host} · Saved {relative time}"; tap reopens the Preview sheet for that link.
- Status pill: "{name}" (online) · "Offline" · "Checking" · "Not paired"; a11y "Server {name}, online. Opens the Server tab."
- Snackbar after save: "Saving {n} item(s)" · action "View"

**Preview:** "{n} items" · "Select all" · "Clear" · "Video" · "Video & photos" · "Audio only" ·
"Photos are saved as they are." · "Quality" · "Best" · "{q}p" · "Best is {q}p for this post." ·
CTA "Save video" / "Save photo" / "Save audio" / "Save {n} items" / disabled "Select something to
save" / loading "Starting…" · Reading: "Reading the post…" · Close a11y "Close preview" · Tile
a11y "{Type} {i} of {n}, {selected/not selected}" · Types: "Video", "Photo", "Audio", "Reel",
"Short", "Post".

**Batch:** title "Save {n} links" · row meta "Reading…" · "Saved before" · CTA "Save {k} links" ·
skipped note "{f} links couldn't be read and will be skipped."

**Activity:** title "Activity" · "Clear finished" · sections "In progress", "Failed", "Done" ·
a11y "Cancel download", "Retry download" · snackbar "Download cancelled" + "Undo" · "Saved to
gallery" announcement: "Saved {title} to the SaveSama album".

**Library:** title "Library" · count "{n} saved" · search placeholder "Search your saves" · chips
"All", "Video", "Photo", "Audio" · date headers "Today", "Yesterday", "This week", "Earlier", "{Month
yyyy}" · selection "{n} selected" · a11y "Share", "Delete", "Exit selection", tile "{Type}, {title},
{duration}".

**Viewer:** meta line "{Platform} · {author} · Saved {relative time}" · a11y "Back", "Share", "Info", "Delete", "Play", "Pause" · Info sheet title "Details" ·
rows "Title", "From", "Link", "Saved", "Size", "Dimensions", "Duration", "File name" · "Copy link"
→ snackbar "Link copied".

**Server:** title "Server" · rows "Address", "Extractor", "ffmpeg", "Server", "Last seen" (offline only, "Today at {time}") · values "Ready",
"Missing", "SaveSama {version} · API {api}" · buttons "Update extractor" / "Updating…", "Setup
guide" · helper while jobs run "Finish or cancel running downloads first." · section "Servers" ·
row status "Online", "Offline", "Checking" · "Add a server" · menu "Rename", "Remove" · rename
dialog title "Rename server", field label "Name", buttons "Cancel", "Save" · snackbars "Now using
{name}", "Extractor updated to {version}", "Already up to date ({version})" · offline steps:
"Open Termux.", "Run savesama.", "Come back here. SaveSama checks again by itself."

**Pair:** sheet title "Add a server" · rows of §12.9 · deep-link sheet "Pair with {name}?",
"Pair", "Cancel" · scanner title "Scan the pairing code", hint "Run savesama on your PC or in
Termux. The code appears in the terminal.", "Enter details instead" · form title "Enter details",
labels "Name", "Address", "Port", "Key", helper for Name "Optional. Shown in the Server tab.",
placeholders "My PC", "192.168.1.20", "8765", "Paste the key the server printed", show/hide a11y
"Show key"/"Hide key", button "Pair" / "Checking…".

**Guide:** title "Set up on this phone" · intro "About five minutes, once. After that SaveSama
starts saving whenever the server is running." · steps: (1) "Install Termux" — "Get it from
F-Droid. The Play Store version is outdated and won't work." button "Open F-Droid"; (2) "Install
the tools" — code; (3) "Install the SaveSama server" — code; (4) "Start it" — code, "It shows a
QR code and opens SaveSama to pair. Leave Termux running."; (5) "Keep it awake" — "In Android
settings, set Termux's battery use to Unrestricted. In the Termux notification, tap Acquire
wakelock." · footer "Using a PC instead?" + "Scan its QR code" · "Copied".

**Settings:** title "Settings" · groups "Appearance", "Saving", "Feedback", "Privacy", "History",
"About" · "Theme" → "System", "Light", "Dark" · "Default format" → "Video", "Audio only" · "Default
quality" · picker title "Default quality for {Platform}", options "Best available", "2160p",
"1440p", "1080p", "720p", "480p", "360p", helper "If a post doesn't offer this, SaveSama takes the
next one down." · "Keep a copy on the server" + helper "Off: the server deletes its copy once the
file is on your phone." · "Warn before saving a link again" · "Vibration" + helper "Short taps
when you select, save and finish." · Privacy text: "SaveSama never signs in. No accounts, no
cookies, no tracking. Your server talks to the platforms; this app only talks to your server." ·
"Clear link history" · "Version" "{version} ({build})" · "Open-source licences" · "Source code".

## 15. Formatting

- Sizes (SI, 1000-based, like Android's Files app): < 1 MB → "820 KB"; < 100 MB → one decimal
  "13.8 MB"; < 1 GB → integer "214 MB"; else two decimals "1.24 GB".
- Speed: same rules + "/s" ("3.1 MB/s").
- ETA: "6 s", "2 min", "1 h 4 min"; omit the segment when `eta` is null.
- Percent: integer, floor (never shows 100% until done).
- Duration: "0:31", "12:04", "1:02:33".
- Quality: `"max"` → "Best"; numbers → "{n}p".
- Relative time: "just now" (< 1 min), "{n} min ago", "{n} h ago", "yesterday", "{d} {Mon}"
  in the current year, else "{d} {Mon} {yyyy}". Absolute dates: "12 Oct at 21:04" (24-hour
  if the device uses it, via `Intl.DateTimeFormat`).
- Links shown to users: drop scheme and `www.`, keep host + path, middle-ellipsis to one line.

## 16. Legacy audit (tag `legacy-expo`, read for evidence only, no code reused)

Keep (as ideas, rebuilt): tokens resolved through one theme interface for both schemes;
tone-step depth with shadows only on floating things; tabular treatment of machine figures;
48 dp targets; a sliding active indicator in the nav; accent darkened in light theme for contrast;
the "SaveSama" album name and `savesama` scheme (user data bindings, §17 of MAINTENANCE.md).

Avoid: warm near-black + orange accent (category default, now replaced by deck yellow + ink);
monospace for "machine output" (reads as costume; replaced by Schibsted Grotesk tabular figures); Feather icons
(the default AI icon set; replaced by Phosphor); a single-screen layout where status, errors and
results stack in one scroll; overline labels; in-app platform sign-in (now forbidden); an ad band
reserved at the bottom; disabled predictive back.

## 17. Accessibility checklist

- All pairs in §3 meet AA; verify after any token change with `docs/design/tools/contrast.py`.
- 48 dp targets everywhere (§5); `hitSlop` where painted smaller.
- Labels for every icon-only control (§14); roles: `button`, `radio`, `checkbox`, `switch`,
  `progressbar`, `header` on section titles, `image` with descriptive labels on thumbnails.
- Live announcements: stage changes, saved, failed; never per-percent.
- Font scale 1.3 and 1.6: rows grow vertically, nothing clips; the deck grows; sheet footer stays
  pinned.
- Reduced motion per §8; colour is never the only signal (icons + words with every state colour).
- TalkBack order on Grab: wordmark, status pill, field, Paste, Get, clipboard suggestion,
  sections.

## 18. Mockups

`docs/design/mockups/*.html` share `base.css` (tokens identical to §3) and `shared.js` (system
bars and nav bar). Render with `node docs/design/tools/render.mjs` (needs `playwright-core`
and Chromium) into `docs/design/screens/<name>-<light|dark>.png` at 412 x 915 dp, 2x. Photos in
`docs/design/mockups/assets/photos/` are CC0 stand-ins for post thumbnails (credits in
`credits.json`); titles, authors and numbers in the mockups are synthetic.
