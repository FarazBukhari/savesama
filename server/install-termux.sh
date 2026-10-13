#!/data/data/com.termux/files/usr/bin/bash
# SaveSama server installer for Android (Termux). Safe to run again: it updates in place.
#
#   curl -fsSL https://raw.githubusercontent.com/FarazBukhari/savesama/main/server/install-termux.sh | bash
#
# Options (environment variables):
#   SAVESAMA_REF=<branch>   install the server from this branch (default: main, falling back to
#                           rebuild/server-and-app while that branch hasn't been merged yet)
#   SAVESAMA_BOOT=yes|no    start the server when the phone boots (needs the Termux:Boot app);
#                           asked interactively when not set
set -euo pipefail

REPO="https://github.com/FarazBukhari/savesama"
REF="${SAVESAMA_REF:-main}"
FALLBACK_REF="rebuild/server-and-app"
HOME_DIR="${HOME:?}"
DATA="$HOME_DIR/.savesama"
VENV="$DATA/venv"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

if [ -z "${TERMUX_VERSION:-}" ] && [ ! -d /data/data/com.termux ]; then
    die "this script is for the Termux app on Android. See docs/SERVER.md for Windows and macOS."
fi

ask() {  # ask "question" -> 0 for yes; works even when the script is piped into bash
    local reply=""
    if [ -r /dev/tty ]; then
        printf '%s [y/N] ' "$1" > /dev/tty
        read -r reply < /dev/tty || reply=""
    fi
    case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

say "Updating Termux packages (this can take a few minutes the first time)"
pkg update -y -o Dpkg::Options::=--force-confold
pkg upgrade -y -o Dpkg::Options::=--force-confold

say "Installing Python, ffmpeg, Node.js and git"
pkgs=(python ffmpeg git)
# Node.js lets yt-dlp solve YouTube's JavaScript challenges (more formats, fewer failures).
command -v node > /dev/null 2>&1 || pkgs+=(nodejs-lts)
pkg install -y -o Dpkg::Options::=--force-confold "${pkgs[@]}"

say "Creating the Python environment in $VENV"
mkdir -p "$DATA"
if [ ! -x "$VENV/bin/python" ]; then
    if ! python -m venv "$VENV"; then
        # Some Termux Python builds lack ensurepip: borrow pip from the python-pip package.
        warn "python -m venv failed; retrying with Termux's pip"
        rm -rf "$VENV"
        pkg install -y python-pip
        python -m venv --system-site-packages --without-pip "$VENV"
    fi
fi
PY="$VENV/bin/python"
"$PY" -m pip install --quiet --upgrade --disable-pip-version-check pip || warn "couldn't upgrade pip; continuing"

say "Installing the SaveSama server"
install_from() {
    "$PY" -m pip install --upgrade --disable-pip-version-check --no-input "$1"
}
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/pyproject.toml" ]; then
    install_from "$SCRIPT_DIR"  # running from a clone of the repository
elif ! install_from "git+$REPO@$REF#subdirectory=server"; then
    if [ "$REF" = "main" ]; then
        warn "main doesn't have the server yet; using the $FALLBACK_REF branch"
        install_from "git+$REPO@$FALLBACK_REF#subdirectory=server"
    else
        die "couldn't install the server from branch $REF"
    fi
fi

say "Updating the extractor (yt-dlp) to the latest release"
"$PY" -m savesama_server.update || warn "extractor update failed; the installed version still works"

say "Adding the 'savesama' command"
ln -sf "$VENV/bin/savesama" "$PREFIX/bin/savesama"

say "Creating the home-screen shortcuts (Termux:Widget)"
mkdir -p "$HOME_DIR/.shortcuts" "$HOME_DIR/.shortcuts/tasks"
cat > "$HOME_DIR/.shortcuts/SaveSama" <<EOF
#!$PREFIX/bin/bash
# Starts the SaveSama server in a Termux window and keeps the phone from sleeping it.
termux-wake-lock
exec "$VENV/bin/savesama" "\$@"
EOF
cat > "$HOME_DIR/.shortcuts/tasks/Stop SaveSama" <<EOF
#!$PREFIX/bin/bash
"$VENV/bin/savesama" stop
termux-wake-unlock
EOF
chmod 700 "$HOME_DIR/.shortcuts/SaveSama" "$HOME_DIR/.shortcuts/tasks/Stop SaveSama"

BOOT_FILE="$HOME_DIR/.termux/boot/savesama"
boot="${SAVESAMA_BOOT:-}"
if [ -z "$boot" ]; then
    if [ -f "$BOOT_FILE" ] || ask "Start SaveSama automatically when the phone turns on? (needs the Termux:Boot app)"; then
        boot=yes
    else
        boot=no
    fi
fi
if [ "$boot" = "yes" ]; then
    mkdir -p "$HOME_DIR/.termux/boot"
    cat > "$BOOT_FILE" <<EOF
#!$PREFIX/bin/sh
# Termux:Boot runs this after the phone starts.
termux-wake-lock
"$VENV/bin/savesama" --no-open >> "$DATA/boot.log" 2>&1 &
EOF
    chmod 700 "$BOOT_FILE"
    echo "Autostart enabled ($BOOT_FILE)."
elif [ -f "$BOOT_FILE" ] && [ "${SAVESAMA_BOOT:-}" = "no" ]; then
    rm -f "$BOOT_FILE"
    echo "Autostart disabled."
fi

VERSION="$("$VENV/bin/savesama" --version 2>/dev/null || echo savesama)"
say "Done: $VERSION is installed"
cat <<EOF

Start the server:   savesama        (or tap the SaveSama widget on your home screen)
Show pairing again: savesama pair
Stop the server:    savesama stop   (or Ctrl+C in this window)

The first start prints a QR code and opens the SaveSama app to pair automatically.
EOF
