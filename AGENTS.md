# SaveSama

Media downloader (Instagram, YouTube, ...), being rebuilt from scratch around a local server.

The previous Expo-only app is preserved at tag `legacy-expo`. Its extraction notes (Instagram
GraphQL/CSRF, YouTube bot-check) are worth reading before writing extraction code:
`git show legacy-expo:docs/MAINTENANCE.md`.

## Constraints
- The server runs on the owner's own devices: Windows 11, macOS, and Android via Termux
  (arm64, no root). Every dependency must install and run on all three, so avoid native
  modules that need a toolchain Termux can't build.
- Stack not chosen yet. Prefer TypeScript + npm, or Python + venv.

## Working style
- Hands-off: run commands and make changes without asking for each step.
- Concise responses, no trailing summaries.
- Shortest working change: reuse, then stdlib, then installed deps, then new code. No
  unrequested abstractions, no placeholder or stub code.
- Comments only when the why is non-obvious.
- Security-first: no hardcoded secrets, validate at system boundaries.
- Conventional commit messages.
