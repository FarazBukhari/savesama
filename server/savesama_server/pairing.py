"""Pairing token, device name, addresses and the savesama:// deep link."""

from __future__ import annotations

import io
import os
import platform
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import urllib.parse


def is_termux() -> bool:
    return bool(os.environ.get("TERMUX_VERSION")) or "com.termux" in os.environ.get("PREFIX", "")


def load_token(path: str, reset: bool = False) -> str:
    """Read the token, creating it (mode 0600) on first start or when reset."""
    if not reset:
        try:
            with open(path, encoding="utf-8") as fh:
                token = fh.read().strip()
            if len(token) >= 24:
                _tighten(path)
                return token
        except FileNotFoundError:
            pass
    token = secrets.token_urlsafe(32)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".new"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(token + "\n")
    os.replace(tmp, path)
    _tighten(path)
    return token


def _tighten(path: str) -> None:
    if os.name != "nt":
        try:
            if stat.S_IMODE(os.stat(path).st_mode) != 0o600:
                os.chmod(path, 0o600)
        except OSError:
            pass


def device_name() -> str:
    if is_termux():
        try:
            model = subprocess.run(["getprop", "ro.product.model"], capture_output=True, text=True,
                                   timeout=3).stdout.strip()
            if model:
                return f"{model} (Termux)"
        except (OSError, subprocess.SubprocessError):
            pass
        return "Android (Termux)"
    if sys.platform == "darwin":
        try:
            name = subprocess.run(["scutil", "--get", "ComputerName"], capture_output=True, text=True,
                                  timeout=3).stdout.strip()
            if name:
                return name
        except (OSError, subprocess.SubprocessError):
            pass
    return platform.node() or socket.gethostname() or "SaveSama server"


def lan_ip() -> str | None:
    """The address other devices on the network can reach (no packet is actually sent)."""
    for probe in ("10.255.255.255", "192.168.255.255", "8.8.8.8"):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect((probe, 1))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127.") and ip != "0.0.0.0":
                return ip
        except OSError:
            continue
        finally:
            s.close()
    return None


def deep_link(host: str, port: int, token: str, name: str) -> str:
    query = urllib.parse.urlencode({"host": host, "port": port, "token": token, "name": name},
                                   quote_via=urllib.parse.quote)
    return f"savesama://pair?{query}"


def qr_text(data: str) -> str:
    try:
        import segno
    except ImportError:
        return "(install 'segno' to show a QR code here)\n"
    buf = io.StringIO()
    segno.make(data, error="m").terminal(out=buf, compact=True, border=2)
    return buf.getvalue()


def open_on_termux(link: str) -> bool:
    exe = shutil.which("termux-open-url")
    if not exe:
        return False
    try:
        subprocess.run([exe, link], timeout=10, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except (OSError, subprocess.SubprocessError):
        return False
