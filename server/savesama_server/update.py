"""POST /maintenance/update: upgrade yt-dlp in this interpreter, then restart in place."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import time

log = logging.getLogger("savesama.update")

_lock = threading.Lock()
_running = False
# Set while restarting so the main thread waits for exec instead of exiting.
restarting = threading.Event()

# The pip line yt-dlp's own "default" extra uses for its YouTube challenge solver scripts.
_EJS_PIN = (
    "import importlib.metadata as m, re\n"
    "for r in m.requires('yt-dlp') or []:\n"
    "    if r.startswith('yt-dlp-ejs') and \"default\" in r:\n"
    "        print(re.split(r'\\s*;', r)[0].replace(' ', '')); break\n"
)


def restart_command() -> list[str]:
    return [sys.executable, "-m", "savesama_server", *sys.argv[1:]]


def start(server) -> None:
    global _running
    with _lock:
        if _running:
            return
        _running = True
    threading.Thread(target=_run, args=(server,), name="updater", daemon=True).start()


def _pip(*args: str) -> subprocess.CompletedProcess:
    cmd = [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", *args]
    log.info("running: pip install %s", " ".join(args))
    return subprocess.run(cmd, capture_output=True, text=True, timeout=600)


def upgrade() -> bool:
    """pip install -U yt-dlp, then the yt-dlp-ejs version that yt-dlp release pins."""
    try:
        proc = _pip("--upgrade", "yt-dlp")
        if proc.returncode != 0:
            log.error("yt-dlp upgrade failed (pip exit %s):\n%s", proc.returncode,
                      (proc.stderr or proc.stdout)[-2000:])
            return False
        pin = subprocess.run([sys.executable, "-c", _EJS_PIN], capture_output=True, text=True,
                             timeout=60).stdout.strip() or "yt-dlp-ejs"
        proc = _pip("--upgrade", pin)
        if proc.returncode != 0:  # yt-dlp still works without it, with fewer YouTube formats
            log.warning("couldn't install %s:\n%s", pin, (proc.stderr or proc.stdout)[-1000:])
        return True
    except (OSError, subprocess.SubprocessError) as e:
        log.error("update failed to run: %s", e)
        return False


def _run(server) -> None:
    global _running
    time.sleep(0.5)  # let the 202 reach the app first
    if not upgrade():
        with _lock:
            _running = False
        return
    log.info("update installed; restarting")
    restart(server)


def restart(server) -> None:
    restarting.set()
    try:
        server.jobs.save()
        server.shutdown()
        server.server_close()
    except Exception as e:  # noqa: BLE001
        log.warning("shutdown before restart: %s", e)
    env = dict(os.environ, SAVESAMA_RESTARTED="1")
    cmd = restart_command()
    for handler in logging.getLogger().handlers:
        handler.flush()
    if os.name == "nt":
        # execv on Windows spawns a child and exits, losing the console; do it explicitly.
        subprocess.Popen(cmd, env=env)
        os._exit(0)
    os.execve(sys.executable, cmd, env)


if __name__ == "__main__":  # used by install-termux.sh: same upgrade, no restart
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    sys.exit(0 if upgrade() else 1)
