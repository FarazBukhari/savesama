# SaveSama server: setup and everyday use

The SaveSama app doesn't download anything by itself. A small program called the **SaveSama
server** does the work. It runs on your Android phone (inside the free Termux app) or on a
Windows or Mac computer. The app sends it a link, the server downloads the video or photo, and
the app copies the finished file into your gallery.

- **No accounts.** The server never logs in to Instagram, YouTube or anywhere else, so none of
  your accounts can be flagged or banned. Posts that need an account (private, age-restricted)
  can't be downloaded.
- **Supported:** YouTube, Instagram, TikTok, Facebook, Threads, Reddit.
- **Private to you.** Only apps that have your pairing code can use the server.

---

## 1. Android phone (Termux)

### 1.1 Install Termux

Termux is a free app that runs the server. **Don't install it from the Google Play Store.**
The Play Store version is old and broken.

1. Install **F-Droid** from <https://f-droid.org>. Open the downloaded file and allow your
   browser to install apps if Android asks.
2. In F-Droid, search for **Termux** and install it.
3. Also from F-Droid, install **Termux:Widget** (for a home-screen start button).
   **Termux:Boot** is optional and starts the server when the phone turns on.

No F-Droid? Download the APKs from Termux's GitHub releases instead:
<https://github.com/termux/termux-app/releases> (pick the `arm64-v8a` file). Termux and its
add-ons must all come from the **same place**: either all from F-Droid or all from GitHub.
Android refuses to mix them.

### 1.2 Install the server

Open Termux. Copy **one** of these commands, paste it (long-press, then *Paste*) and press
Enter. It takes 3 to 10 minutes and is safe to run again later.

**A. If the GitHub repository is public:**

```sh
curl -fsSL https://raw.githubusercontent.com/FarazBukhari/savesama/rebuild/server-and-app/server/install-termux.sh | SAVESAMA_REF=rebuild/server-and-app bash
```

Once the `rebuild/server-and-app` branch has been merged into `main`, the shorter command is:

```sh
curl -fsSL https://raw.githubusercontent.com/FarazBukhari/savesama/main/server/install-termux.sh | bash
```

**B. If the repository is private (it is right now):** sign in to GitHub once with the
GitHub app, which opens a browser page where you approve it, and install from a copy of the
repository:

```sh
pkg install -y gh git && gh auth login && gh auth setup-git && gh repo clone FarazBukhari/savesama ~/savesama -- -b rebuild/server-and-app && bash ~/savesama/server/install-termux.sh
```

For `gh auth login`, choose: *GitHub.com*, then *HTTPS*, then *Login with a web browser*.
This signs in to GitHub only, to read your own code. It has nothing to do with Instagram or
any other platform.

The installer:
- installs Python, ffmpeg (joins video and audio), Node.js (needed for YouTube) and git,
- installs the server into `~/.savesama/venv`,
- adds the `savesama` command,
- creates the **SaveSama** home-screen shortcut and a **Stop SaveSama** shortcut,
- asks whether the server should start automatically when the phone turns on.

### 1.3 Start and stop

- **Start:** long-press your home screen, choose *Widgets*, add **Termux:Widget**, and tap
  **SaveSama**. You can also type `savesama` in Termux.
- **Stop:** tap **Stop SaveSama** in the widget, type `savesama stop`, or press **Ctrl+C**
  (Termux's extra-keys row) in the server's window.
- The server must be running whenever you use the app. Leave its Termux window open in the
  background.

### 1.4 Pair the app

When the server starts, it prints a QR code and a link starting with `savesama://pair`.

- **App on the same phone:** the first start opens the SaveSama app and pairs it
  automatically. If that doesn't happen, type `savesama pair`.
- **App on another phone:** in the app, choose *Scan QR code* and point the camera at the QR
  code in Termux. Both phones must be on the **same Wi-Fi**.
- **Manual pairing:** type the host, port (`8765`) and token printed by `savesama pair`.

The pairing code (token) is stored in `~/.savesama/token`. Anyone with it can use your
server, so don't share screenshots of the QR code. To make a new one (this unpairs every
app), run `savesama reset-token` and restart the server.

### 1.5 Keep it running in the background

Android likes to put background apps to sleep. Do all of these once:

1. **Battery:** open Android *Settings*, then *Apps*, then *Termux*, then *Battery*, and choose
   **Unrestricted** (on some phones it's called *Don't optimise*).
2. **Wake lock:** the SaveSama shortcut turns it on. If you started the server by typing
   `savesama`, pull down the Termux notification and tap **Acquire wakelock**.
3. **Don't swipe Termux away** from the recent-apps list. That stops the server.
4. **Android 12 and newer** sometimes kill background programs on their own. If the server
   keeps disappearing: on Android 14+ open *Developer options* and turn on **Disable child
   process restrictions**. On Android 12 and 13, search the web for "Termux phantom process
   killer adb" for the one-time fix.
5. **Start on boot (optional):** install Termux:Boot, open it once, then re-run the installer
   and answer **y** to the autostart question. Its log is `~/.savesama/boot.log`. A server
   started this way runs without a window, so type `savesama pair` in Termux to see the QR
   code. (The pairing code is only ever shown on screen, never written to a log.)

### 1.6 Updating

- **Extractor (the part that understands YouTube, Instagram, ...):** sites change often. When
  downloads start failing, tap **Update extractor** in the app's server settings. The server
  updates and restarts itself in about a minute. Re-running the installer also updates it.
- **The server itself:** run the same install command again (section 1.2). With option B,
  run this first so the copy is current: `cd ~/savesama && git pull`.

---

## 2. Troubleshooting

The app shows the server's message. Each kind of error means:

| What the app says | Meaning | What to do |
| --- | --- | --- |
| **Needs an account** (`login_required`) | The post is private, age-restricted, members-only, or the platform only shows it to signed-in users. | Nothing. SaveSama never signs in, so it can't download these. |
| **Not found** (`not_found`) | The post was deleted, or the link is wrong. | Check that the post opens in the platform's own app. |
| **Rate limited** (`rate_limited`) | The platform is temporarily blocking or slowing down requests from your connection. YouTube calls this "confirm you're not a bot" (or answers HTTP 403); TikTok shows a challenge page instead of the post. | Wait 10 to 30 minutes, or run the server from another network. Switching between Wi-Fi and mobile data often helps. Don't retry many times in a row. |
| **Unavailable** (`unavailable`) | The post exists but has nothing to save: a text-only post, a live stream, a region block, audio that needs ffmpeg, or audio from a video that has no audio track. | Read the message. Live streams can be saved after they end. |
| **Network** (`network`) | The server couldn't reach the platform. | Check the internet on the device running the server. |
| **Unsupported link** (`unsupported_url`) | Not a link from the six supported platforms, or a profile page instead of a post. | Share the post or video itself. |
| **Can't reach the server** | The app can't connect at all. | Check that the server is running and that both devices use the same Wi-Fi. Then re-pair: home Wi-Fi often gives the phone a new address, and `savesama pair` shows the new one. Guest Wi-Fi networks often block devices from seeing each other. |
| **Unauthorized** | The app's pairing code doesn't match (for example after `reset-token`). | Pair again. |
| **Something went wrong** (`internal`) | A bug or an unexpected change on the platform. | Update the extractor (section 1.6). If it persists, send `~/.savesama/server.log` to the developer. |

Platform notes:
- **YouTube** needs Node.js for full support. The installer adds it. YouTube blocks many cloud
  and VPN addresses, so a home or mobile connection works best.
- **Instagram** allows a limited number of anonymous requests per connection. Saving a lot in
  a short time leads to *Rate limited* for a while.
- **Threads** works for public posts that Threads shows to search engines. Some posts are
  only shown to signed-in users, and those report *Needs an account*.
- **Facebook** videos and reels work. Photo posts work only when Facebook shows a preview
  image to link-preview bots. Many photo pages require login.
- **Reddit** photos, galleries, GIFs and videos (with sound) work for public posts, read from
  Reddit's public post data. Reddit blocks most cloud and VPN addresses, so run the server on
  home Wi-Fi or mobile data. A post that only links to YouTube or another supported site saves
  that video. Posts in private, quarantined or age-gated communities need an account.
- **Without ffmpeg** (the installers above always add it), YouTube video, quality choices
  that need joining video and audio, and most audio conversion aren't possible. The app can
  tell, because `GET /api/v1/info` reports `"ffmpeg": false`.

Logs: `~/.savesama/server.log` (Termux: type `cat ~/.savesama/server.log`). For more detail,
start with `savesama -v`.

---

## 3. Windows 11

1. Install **Python 3.10 or newer** from <https://www.python.org/downloads/>. On the first
   installer screen, tick **Add python.exe to PATH**.
2. Open **Terminal** (or PowerShell) and install ffmpeg, Node.js and Git:
   ```powershell
   winget install --id Gyan.FFmpeg -e; winget install --id OpenJS.NodeJS.LTS -e; winget install --id Git.Git -e
   ```
   Close and reopen Terminal afterwards.
3. Install the server. If the repository is private, run `winget install --id GitHub.cli -e`
   and then `gh auth login` first.
   ```powershell
   py -m pip install --upgrade "git+https://github.com/FarazBukhari/savesama@rebuild/server-and-app#subdirectory=server"
   ```
   (after the merge: `...savesama@main#subdirectory=server`)
4. Start it with `savesama`. When Windows Firewall asks, allow access on **Private networks**.
   Scan the QR code with the app.
5. Stop it with **Ctrl+C**, or run `savesama stop` from another window. To update, re-run
   step 3. The app's *Update extractor* button also works.

If `savesama` isn't found, run `py -m savesama_server` instead.

## 4. macOS

1. Install Homebrew from <https://brew.sh>, then:
   ```sh
   brew install python ffmpeg node git
   ```
2. Install the server into its own environment. If the repository is private, run
   `brew install gh && gh auth login && gh auth setup-git` first.
   ```sh
   python3 -m venv ~/.savesama/venv
   ~/.savesama/venv/bin/pip install --upgrade "git+https://github.com/FarazBukhari/savesama@rebuild/server-and-app#subdirectory=server"
   ```
3. Start it with `~/.savesama/venv/bin/savesama`. When macOS asks whether Python may accept
   incoming network connections, click **Allow**. Then scan the QR code with the app.
4. Stop it with **Ctrl+C** or `~/.savesama/venv/bin/savesama stop`. To update, re-run step 2.

---

## 5. Reference

```
savesama [serve|pair|stop|reset-token] [options]
  --port 8765        port to listen on (also SAVESAMA_PORT)
  --dir PATH         where finished files wait for the app (default ~/.savesama/downloads)
  --name NAME        device name shown in the app (default: the phone model or computer name;
                     `pair` uses the name the running server reports)
  --workers 2        downloads running at the same time
  --local-only       accept connections from this device only (127.0.0.1)
  --no-open          on Termux, don't open the pairing link automatically
  -v, --verbose      detailed logging
```

| File | What it is |
| --- | --- |
| `~/.savesama/token` | pairing secret (readable only by you) |
| `~/.savesama/jobs.json` | download list, kept across restarts |
| `~/.savesama/downloads/` | finished files. The app deletes each one after saving it to the gallery. |
| `~/.savesama/server.log` | log (rotated at 1 MB). The pairing token is never written here. |

How it works and security:
- The server listens on port 8765 on your local network. Every request except
  `GET /api/v1/info` needs the pairing token. The full contract is in [API.md](API.md).
- It only accepts links from youtube.com, youtu.be, instagram.com, tiktok.com, facebook.com,
  fb.watch, threads.com, threads.net, reddit.com and redd.it. It never fetches anything else a user sends.
- It never loads browser cookies or account sessions. Some platforms hand out anonymous,
  temporary session tokens while a page loads. Those stay in memory and are never saved.
- Check that the server only contains pure-Python packages (anything else can't install on
  Termux):
  `~/.savesama/venv/bin/python -m pip list`. You should see only `pip`, `savesama-server`,
  `segno`, `yt-dlp`, `yt-dlp-ejs` (plus `certifi` on macOS).
