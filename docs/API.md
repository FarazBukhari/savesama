# SaveSama server API (v1)

The contract between the Android app (`app/`) and the download server (`server/`). Both sides
implement exactly this. Change it here first, then in both implementations.

## Model

The server does all extraction and downloading (yt-dlp + ffmpeg + its own extractors). The app
asks the server to resolve a link, lets the user pick what to save, starts jobs, polls them, and
when a job is done pulls the finished file over HTTP into the phone's gallery, then tells the
server to delete its copy.

No accounts, ever: the server never logs in to any platform and never accepts cookies. Content
that needs a login fails with `login_required`.

Supported platforms: `youtube`, `instagram`, `tiktok`, `facebook`, `threads`.

## Transport

- Plain HTTP, default port **8765**, JSON bodies (`Content-Type: application/json`), UTF-8.
- Every route except `GET /api/v1/info` requires `Authorization: Bearer <token>`.
  Missing/wrong token → `401 {"error": {"code": "unauthorized", ...}}`.
- Request bodies over 64 KB → `413`.
- All errors use one shape:
  ```json
  {"error": {"code": "<code>", "message": "<human readable, safe to show the user>"}}
  ```

### Error codes

| code | HTTP | meaning |
| --- | --- | --- |
| `unauthorized` | 401 | missing/bad token |
| `bad_request` | 400 | malformed body or parameters |
| `unsupported_url` | 422 | not a link from a supported platform |
| `login_required` | 422 | private, age-gated, or otherwise needs an account |
| `not_found` | 404 | post/video deleted or never existed; or unknown job id |
| `rate_limited` | 429 | the platform is throttling the server; retry later |
| `unavailable` | 422 | exists but can't be downloaded (geo-block, live stream, text-only post, ...) |
| `network` | 502 | the server couldn't reach the platform |
| `conflict` | 409 | operation invalid for the job's current state (e.g. file of an unfinished job) |
| `internal` | 500 | anything else |

Job errors (inside a job object) use the same codes, plus `cancelled` is a status, not an error.

## Pairing

The token is a random secret the server generates on first start and stores in
`~/.savesama/token`. On startup the server prints:

- the pairing deep link `savesama://pair?host=<ip>&port=<port>&token=<token>&name=<device name>`
- a QR code of that link (terminal-rendered)
- on Termux it also runs `termux-open-url <link>` so the app on the same phone pairs itself.

The app accepts the deep link, a scanned QR, or manual host/port/token entry. It then calls
`GET /api/v1/info` and an authenticated `GET /api/v1/jobs` to confirm.

## Routes

### `GET /api/v1/info` (no auth)

```json
{
  "app": "savesama",
  "api": 1,
  "version": "0.1.0",
  "name": "Pixel 8 (Termux)",
  "platforms": ["youtube", "instagram", "tiktok", "facebook", "threads"],
  "ffmpeg": true,
  "extractor_version": "2026.08.19"
}
```

`name` is the device name the server reports (hostname, or `--name`).

### `POST /api/v1/resolve`

Body: `{"url": "<link>"}`. Resolves a link without downloading. May take several seconds.

```json
{
  "url": "https://www.instagram.com/p/ABC123/",
  "platform": "instagram",
  "id": "ABC123",
  "title": "caption or video title, may be null",
  "author": "username / channel, may be null",
  "thumbnail": "https://... or null",
  "duration": 31.5,
  "items": [
    {
      "index": 0,
      "type": "video",
      "thumbnail": "https://...",
      "width": 1080,
      "height": 1920,
      "duration": 31.5,
      "qualities": [1080, 720, 480, 360],
      "has_audio": true
    },
    {"index": 1, "type": "image", "thumbnail": "https://...", "width": 1080, "height": 1350,
     "duration": null, "qualities": [], "has_audio": false}
  ]
}
```

- `type`: `video` | `image` | `audio`.
- `qualities`: available video resolutions as the **short side** in pixels, descending. A
  portrait 1080x1920 reel is `1080`. Empty for images/audio.
- Single videos have one item. Carousels/albums have one item per entry, in post order.
- Thumbnail URLs point at the platform CDN; some expire after hours. `null` when unknown.

### `POST /api/v1/jobs`

Starts downloads. Body:

```json
{
  "url": "<link>",
  "items": [0, 2],
  "mode": "media",
  "quality": "max"
}
```

- `items`: item indices from `/resolve`; omit or `null` for all items.
- `mode`: `media` (video as video, image as image) or `audio` (audio track only, saved as
  `.m4a`; for image items `audio` is ignored and the image is saved as-is).
- `quality`: `"max"` or a short-side pixel number (`1080`, `720`, ...). The server picks the
  best available rendition at or below it; if none is at/below, the smallest available.

Response `201`: `{"jobs": [Job, ...]}`, one job per item.

The server may resolve again internally; the app doesn't need to call `/resolve` first.

### Job object

```json
{
  "id": "32 hex chars",
  "url": "<link>",
  "platform": "instagram",
  "item_index": 0,
  "mode": "media",
  "quality": "max",
  "status": "running",
  "progress": 0.42,
  "bytes_done": 4404019,
  "bytes_total": 10485760,
  "speed": 1048576,
  "eta": 6,
  "title": "...",
  "author": "...",
  "thumbnail": "https://...",
  "file": null,
  "error": null,
  "created_at": 1760400000.0,
  "finished_at": null
}
```

- `status`: `queued` → `running` → `processing` (ffmpeg merge/convert) → `done` | `error` |
  `cancelled`.
- `progress` 0..1; `bytes_total`, `speed` (bytes/s), `eta` (s) may be `null` when unknown.
- When `done`, `file` is
  `{"name": "Title [id].mp4", "size": 12345, "mime": "video/mp4", "type": "video"}`
  (`type`: `video` | `image` | `audio`).
- When `error`, `error` is `{"code": ..., "message": ...}`.
- Timestamps are Unix seconds (float).

### `GET /api/v1/jobs`

`{"jobs": [Job, ...]}`, newest first. The server keeps at most the last 200 jobs in memory and
persists them across restarts (`~/.savesama/jobs.json`) so finished files can still be pulled
after a server restart.

### `GET /api/v1/jobs/{id}`

One `Job`, or `404 not_found`.

### `POST /api/v1/jobs/{id}/cancel`

Cancels a queued/running/processing job; partial files are removed. Returns the updated `Job`.
Cancelling a finished job → `409 conflict`.

### `POST /api/v1/jobs/{id}/retry`

Re-queues an `error` or `cancelled` job under the same id. Returns the `Job`. Other states →
`409 conflict`.

### `DELETE /api/v1/jobs/{id}`

Removes the job and deletes its file from the server's disk (cancelling first if active).
`204`, no body. The app calls this after it has saved the file to the gallery.

### `GET /api/v1/jobs/{id}/file`

Streams the finished file. `409 conflict` if the job isn't `done`.

- `Content-Type` = the file's mime, `Content-Length` set,
  `Content-Disposition: attachment; filename*=UTF-8''<name>`.
- Supports single `Range: bytes=a-b` requests (`206` + `Content-Range`), so interrupted
  transfers can resume.

### `POST /api/v1/maintenance/update`

Upgrades the extractor (`pip install -U yt-dlp`) and restarts the server process in place.
Returns `202 {"status": "updating"}` before restarting. The app polls `/info` until
`extractor_version` changes or 60 s pass.
