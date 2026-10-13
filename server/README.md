# SaveSama server

The download server the SaveSama app talks to. It resolves links from YouTube, Instagram,
TikTok, Facebook and Threads, downloads them (yt-dlp + ffmpeg + its own anonymous
extractors) and hands finished files to the app. No accounts, ever.

- Setup for Android (Termux), Windows and macOS: [`docs/SERVER.md`](../docs/SERVER.md)
- App <-> server contract: [`docs/API.md`](../docs/API.md)

```sh
pip install ./server        # or: bash server/install-termux.sh on Android
savesama                    # start; prints the pairing QR code
savesama pair               # show the QR code again
python -m unittest discover -s server/tests
```
