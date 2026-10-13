"""`savesama` command: start the server and print pairing details."""

from __future__ import annotations

import argparse
import logging
import logging.handlers
import os
import shutil
import signal
import sys
import threading
import time

from . import __version__, pairing, update

DATA_DIR = os.path.join(os.path.expanduser("~"), ".savesama")
DEFAULT_PORT = 8765


def _setup_logging(verbose: bool) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s", "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if verbose else logging.INFO)
    console = logging.StreamHandler(sys.stderr)
    console.setFormatter(fmt)
    root.addHandler(console)
    try:
        fileh = logging.handlers.RotatingFileHandler(os.path.join(DATA_DIR, "server.log"),
                                                     maxBytes=1_000_000, backupCount=2, encoding="utf-8")
        fileh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        root.addHandler(fileh)
    except OSError:
        pass
    if not verbose:
        logging.getLogger("savesama.ytdlp").setLevel(logging.INFO)


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="savesama", description="SaveSama download server.")
    p.add_argument("command", nargs="?", default="serve", choices=["serve", "pair", "stop", "reset-token"],
                   help="serve (default): run the server; pair: show the pairing QR/link again; "
                        "stop: stop a running server; reset-token: make a new pairing token "
                        "(unpairs every app)")
    p.add_argument("--port", type=int, default=int(os.environ.get("SAVESAMA_PORT", DEFAULT_PORT)))
    p.add_argument("--dir", default=os.environ.get("SAVESAMA_DIR"),
                   help="where finished files wait for the app (default ~/.savesama/downloads)")
    p.add_argument("--name", default=os.environ.get("SAVESAMA_NAME"), help="device name shown in the app")
    p.add_argument("--workers", type=int, default=2, help="parallel downloads (default 2)")
    p.add_argument("--local-only", action="store_true",
                   help="listen on 127.0.0.1 only (the app must run on this same device)")
    p.add_argument("--no-open", action="store_true", help="on Termux, don't auto-open the pairing link")
    p.add_argument("-v", "--verbose", action="store_true")
    p.add_argument("--version", action="version", version=f"savesama {__version__}")
    return p


def _pairing_text(args, token: str, name: str) -> tuple[str, str, str]:
    lan = None if args.local_only else pairing.lan_ip()
    host = lan or "127.0.0.1"
    link = pairing.deep_link(host, args.port, token, name)
    local_link = pairing.deep_link("127.0.0.1", args.port, token, name)
    lines = ["", f"SaveSama server {__version__} - {name}"]
    if lan:
        lines.append(f"  Other devices (same Wi-Fi):  http://{lan}:{args.port}")
    elif not args.local_only:
        lines.append("  No Wi-Fi/LAN address found: only apps on this device can connect.")
    lines.append(f"  This device:                http://127.0.0.1:{args.port}")
    lines += ["", "Pair the SaveSama app: scan this QR code with the app,", "or open the link on the phone:", ""]
    text = "\n".join(lines) + "\n" + pairing.qr_text(link) + "\n" + link + "\n"
    return text, link, local_link


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    token_path = os.path.join(DATA_DIR, "token")
    if args.command == "stop":
        sys.exit(0 if stop_running() else 1)
    if args.command == "reset-token":
        pairing.load_token(token_path, reset=True)
        print("New pairing token created. Restart the server and pair the app again.")
        return
    name = (args.name or pairing.device_name()).strip()[:60]
    token = pairing.load_token(token_path)
    if args.command == "pair":
        text, link, local_link = _pairing_text(args, token, name)
        print(text)
        if pairing.is_termux() and not args.no_open:
            pairing.open_on_termux(local_link)
        return
    serve(args, token, name)


PID_FILE = os.path.join(DATA_DIR, "server.pid")
LOCK_FILE = os.path.join(DATA_DIR, "server.lock")


def _lock_data_dir():
    """Hold an OS lock on ~/.savesama for the process lifetime (one server per data dir).

    The OS drops it when the process dies, so a crash or reboot never leaves a stale lock.
    Returns the open file (keep a reference) or None if another server holds it.
    """
    fh = open(LOCK_FILE, "a+")
    try:
        if os.name == "nt":
            import msvcrt

            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        return None
    return fh


def stop_running() -> bool:
    try:
        with open(PID_FILE, encoding="utf-8") as fh:
            pid = int(fh.read().strip())
    except (OSError, ValueError):
        print("SaveSama server isn't running.")
        return False
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        print("SaveSama server isn't running.")
        _remove_pid(pid)
        return False
    except OSError as e:
        print(f"Couldn't stop the server (pid {pid}): {e}")
        return False
    for _ in range(50):
        time.sleep(0.2)
        try:
            os.kill(pid, 0)
        except OSError:
            break
    print("SaveSama server stopped.")
    return True


def _remove_pid(pid: int) -> None:
    try:
        with open(PID_FILE, encoding="utf-8") as fh:
            if int(fh.read().strip()) != pid:
                return
        os.remove(PID_FILE)
    except (OSError, ValueError):
        pass


def serve(args, token: str, name: str) -> None:
    _setup_logging(args.verbose)
    log = logging.getLogger("savesama")
    # Imported here so `savesama pair` stays fast and works even if yt-dlp is broken.
    import yt_dlp.version

    from .api import Server
    from .extractors import ytdlp
    from .jobs import JobManager
    from .resolver import Resolver

    lock = _lock_data_dir()
    # After an in-place update on Windows the old process may still be exiting.
    for _ in range(20 if os.environ.get("SAVESAMA_RESTARTED") else 0):
        if lock is not None:
            break
        time.sleep(0.5)
        lock = _lock_data_dir()
    if lock is None:
        log.error("another SaveSama server is already running (stop it with `savesama stop`)")
        sys.exit(1)
    downloads = os.path.abspath(os.path.expanduser(args.dir or os.path.join(DATA_DIR, "downloads")))
    ffmpeg = shutil.which("ffmpeg") is not None
    resolver = Resolver(can_mux=ffmpeg)
    bind = "127.0.0.1" if args.local_only else "0.0.0.0"

    server = None
    for attempt in range(20):  # after an in-place restart the old socket may linger briefly
        try:
            server = Server((bind, args.port), token=token, name=name, jobs=None, resolver=resolver,
                            ffmpeg=ffmpeg)
            break
        except OSError as e:
            if attempt == 19:
                log.error("can't listen on %s:%s: %s (is another SaveSama already running?)",
                          bind, args.port, e)
                sys.exit(1)
            time.sleep(0.5)
    # Only now that the port is ours: the job manager clears temp files and starts workers,
    # which must never happen next to another running instance.
    jobs = JobManager(DATA_DIR, downloads, resolver, workers=max(1, min(args.workers, 8)), can_mux=ffmpeg)
    server.jobs = jobs

    text, link, local_link = _pairing_text(args, token, name)
    if sys.stdout.isatty():
        print(text, flush=True)
    else:  # e.g. Termux:Boot logging to a file: never write the token there
        print(f"SaveSama server {__version__} - {name} on port {args.port}. "
              "Run `savesama pair` in a terminal to show the pairing QR code.", flush=True)
    log.info("downloads: %s", downloads)
    log.info("yt-dlp %s, ffmpeg %s, JS runtime: %s", yt_dlp.version.__version__,
             "found" if ffmpeg else "MISSING (no HD merging or audio conversion)", ytdlp.runtime_summary())
    if pairing.is_termux() and not args.no_open and not os.environ.get("SAVESAMA_RESTARTED"):
        pairing.open_on_termux(local_link)
    print("Keep this running. Press Ctrl+C to stop.\n", flush=True)

    def stop(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    with open(PID_FILE, "w", encoding="utf-8") as fh:
        fh.write(str(os.getpid()))
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        if update.restarting.is_set():
            while True:  # the updater thread replaces this process via exec
                time.sleep(1)
        jobs.save()
        server.server_close()
        _remove_pid(os.getpid())
        print("SaveSama server stopped.")
