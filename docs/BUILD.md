# Building the SaveSama app

There are three ways to get an installable APK. Pick one and stick with it, because each
one signs the app with a different key (see [Signatures](#signatures-read-this-once)).

| Path | Needs | Time | Best for |
| --- | --- | --- | --- |
| [A. GitHub Actions](#a-github-actions-recommended) | A browser | ~35 min | Everyday builds, no installs on your PC |
| [B. EAS (expo.dev)](#b-eas-cloud-build) | Node.js + Expo account | ~15 min + queue | If GitHub builds ever break |
| [C. Local build](#c-local-build-on-windows) | Android Studio | ~30 min first time | Offline / debugging |

The Expo account in path B is only for the build service. The app itself never logs in to
Facebook, Instagram, TikTok, YouTube or Threads.

Expo Go will **not** run this app (share-sheet support needs a native build). Always install
an APK.

---

## A. GitHub Actions (recommended)

The workflow `.github/workflows/android.yml` runs on every push that changes `app/`, and you
can start it by hand. It type-checks and tests the app, then builds a release APK for
64-bit and 32-bit ARM phones.

### Run a build

1. Open <https://github.com/FarazBukhari/savesama/actions>.
2. In the left list click **Android APK**.
3. Click **Run workflow** (right side), choose the branch (e.g. `rebuild/server-and-app`),
   click the green **Run workflow** button.
4. Wait for the run to turn green (about 35 minutes; the APK is ~75 MB). Click into it.

### Download and install the APK

1. On the run page scroll to **Artifacts** and click `savesama-<branch>-<commit>`.
   GitHub downloads a `.zip` with the `.apk` inside.
2. Unzip it on the PC and copy the `.apk` to the phone (USB, Google Drive, Telegram to
   yourself, anything). Or open the run page in the phone's browser and download directly,
   then open the zip with the Files app.
3. On the phone tap the `.apk`. Android asks to allow installs from that app (Files/Chrome):
   **Settings → Allow from this source**, back, **Install**.
4. Play Protect may say "unrecognised app": tap **More details → Install anyway**.

The run summary says whether the APK was signed with your release key or the debug key.

### One-time: make your own signing key (so updates install over each other)

Without this, builds use React Native's public debug key. They still update each other, but
anyone could sign an APK with that key, and you'd have to uninstall (losing settings and
pairing) the day you switch to a real key. Do this once, keep the file forever.

In **PowerShell** on Windows (needs Java; Android Studio includes it, or install
[Temurin 17](https://adoptium.net/)):

```powershell
# If keytool isn't found, use Android Studio's copy:
#   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" ...
keytool -genkeypair -v -keystore savesama-release.jks -alias savesama `
  -keyalg RSA -keysize 4096 -validity 36500 `
  -dname "CN=SaveSama, O=FarazBukhari"
```

It asks for a keystore password (and maybe a key password; press Enter to reuse the same
one). Then turn the file into text for GitHub:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\savesama-release.jks")) | Set-Clipboard
```

Back up `savesama-release.jks` and the password somewhere safe (password manager + cloud
drive). **If you lose it, future builds can't update the installed app.** Never commit it.

Add four secrets: repo → **Settings → Secrets and variables → Actions → New repository
secret**:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Paste the clipboard from the command above |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | `savesama` |
| `ANDROID_KEY_PASSWORD` | The key password (same as the keystore password if you pressed Enter) |

Run the workflow again. The summary now says "Signed with the release keystore". The first
release-signed APK needs one uninstall of any debug-signed SaveSama; after that every
GitHub build installs as an update. Each build's `versionCode` is the run number, so newer
builds always count as upgrades.

Server unit tests run in `.github/workflows/server.yml` (Python 3.10 and 3.13) whenever
`server/` changes.

---

## B. EAS cloud build

The project is already linked to EAS as `@farazbukhari/savesama` (project id in
`app/app.json`). Profiles are in `app/eas.json`:

- `preview`: installable APK (arm64 + 32-bit ARM). This is the one you want.
- `development`: debug "dev client" APK for live-reloading from `npx expo start`.
- `production`: Play Store `.aab`.

### From your PC

Install [Node.js 22 LTS](https://nodejs.org/) (not 20: `eas-cli` refuses it), then in
PowerShell:

```powershell
npm i -g eas-cli
eas login                    # your expo.dev account
cd path\to\savesama\app
npm ci
eas build -p android --profile preview
```

The first time, EAS asks to generate an Android keystore: answer **Yes** and it stores it
on expo.dev for you. When the build finishes it prints a link and a QR code; open it on the
phone and tap **Install**. Builds are also listed at expo.dev → savesama → Builds.

If `eas` ever offers to write `appExtensions` into `app.json`, say no; if it already did,
delete that block (it breaks `expo config` for the share-intent plugin).

### From GitHub (no Node on the PC)

1. expo.dev → avatar → **Account settings → Access tokens → Create token**.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**,
   name `EXPO_TOKEN`, paste the token.
3. Actions → **EAS build** → **Run workflow** → profile `preview`.

The job only queues the build and links to it in the run summary; the APK appears on
expo.dev 10–20 minutes later (longer when the free queue is busy). Without `EXPO_TOKEN` the
job exits with a warning and builds nothing.

---

## Signatures (read this once)

Android only installs an update if it is signed by the **same key** as the installed app.

- GitHub Actions builds use your `savesama-release.jks` (or the debug key if no secrets).
- EAS builds use the key EAS generated and keeps on expo.dev.
- Local builds use the debug key unless you configure signing.

So a GitHub-built and an EAS-built APK **cannot update each other**. Switching between them
means: long-press SaveSama → App info → Uninstall, then install the other one. You lose the
app's settings and server pairing (re-pair in a few seconds with `savesama pair` on the
server); your saved photos and videos stay in the gallery.

To make both paths share one key, upload your `.jks` to EAS once: `cd app`,
`eas credentials -p android` → production/preview → **Keystore → Set up a new keystore →
upload** and enter the same alias and passwords. After that EAS and GitHub builds update
each other.

---

## C. Local build on Windows

1. Install [Android Studio](https://developer.android.com/studio). In its first-run wizard
   accept the default SDK. Then **More Actions → SDK Manager → SDK Tools**, tick
   **Show Package Details**, and install **NDK (Side by side) 27.1.12297006**.
2. Install [Node.js 22 LTS](https://nodejs.org/).
3. In PowerShell (Android Studio's Java and the SDK on the path for this window):

   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   cd path\to\savesama\app
   npm ci
   npx expo prebuild -p android --clean
   cd android
   .\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
   ```

   The first build downloads Gradle and dependencies and takes a while. The APK lands in
   `app\android\app\build\outputs\apk\release\app-release.apk` (debug-signed).

   Windows has a 260-character path limit that native builds can hit. Keep the repo in a
   short path like `C:\src\savesama`.

4. Phone plugged in with USB debugging on? `adb install -r app-release.apk` (adb is in
   `%LOCALAPPDATA%\Android\Sdk\platform-tools`). Or copy the file over as in path A.

`app/android/` is generated and git-ignored; `prebuild --clean` recreates it each time, so
never edit files in it by hand. Manifest changes go through `app/app.json` or a config plugin
in `app/plugins/` (for example `withTermuxQuery.js`, which declares the `com.termux` package
query Android 11+ needs before "Open Termux" can launch it).

---

## Installing and first run

1. Install the APK (path A step "Download and install").
2. Start the server first ([docs/SERVER.md](SERVER.md)): in Termux run `savesama`
   (or `savesama pair` to have it open the app and pair automatically).
3. Open SaveSama. Onboarding spots a server running on the same phone; pair it with the
   link `savesama pair` opens, by scanning the QR code the server prints (server on another
   device), or by typing the address and code by hand.
4. Allow photo/video access when asked; saved media goes to the **SaveSama** album.
5. Share a Facebook, Instagram, TikTok, YouTube or Threads link to SaveSama from that app's
   share menu, or paste it on the Grab tab.

### If something goes wrong

- **"App not installed" / "package conflicts"**: the installed SaveSama was signed with a
  different key (see Signatures). Uninstall it, then install.
- **"There was a problem parsing the package"**: the download was incomplete, or you tried
  to install the `.zip` instead of the `.apk` inside it.
- **Phone is x86 / an emulator**: CI builds only include ARM; build locally with
  `-PreactNativeArchitectures=x86_64` added.
- **GitHub build red**: open the failed step. "Typecheck" or "Tests" failing means a code
  problem; failures in "Build release APK" that mention `Could not GET`/`429` are network
  hiccups, so click **Re-run jobs**.
