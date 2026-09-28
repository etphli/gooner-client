# Contributing to Gooner Client
Thanks for helping. GPL-3.0-only community project inspired by Polyfrost OneLauncher.

## Quick start
```sh
git clone https://github.com/etphli/gooner-client.git
cd gooner-client
npm ci
npm run dev
```
Requires Node 24+, macOS 13+ for full DMG builds.

## Workflow
1. Fork → branch `feat/<name>` / `fix/<name>`.
2. Keep PRs small. Run `npm run typecheck` + `npm run build`.
3. Update `CHANGELOG.md` under `[Unreleased]`.
4. Open PR with what/why + test notes + screenshots for UI.

## Rules
- All contributions GPL-3.0-only.
- Preserve attribution. Credit Polyfrost where concepts derive from OneLauncher.
- No World Hosting PRs (out of scope). No piracy bypasses.
- No secrets/tokens in code.
