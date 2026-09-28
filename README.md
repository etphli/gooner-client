# Gooner Client

> Open-source Minecraft launcher for macOS — OneClient parity minus World Hosting.

[![Release](https://img.shields.io/github/v/release/etphli/gooner-client?label=release)](https://github.com/etphli/gooner-client/releases/latest)
[![Build](https://github.com/etphli/gooner-client/actions/workflows/ci.yml/badge.svg)](https://github.com/etphli/gooner-client/actions/workflows/ci.yml)
[![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-blue)](./LICENSE)
[![macOS 13+](https://img.shields.io/badge/macOS-13%2B-blue?logo=apple)](https://github.com/etphli/gooner-client/releases/latest)

## Download — Latest DMG (macOS)

**➡️ https://github.com/etphli/gooner-client/releases/latest**

**The latest release is always at the link above.** Open it, scroll to **Assets**, and download:

**Default: Apple Silicon (M1/M2/M3/M4) — download the `arm64` DMG.** Nearly all Macs sold since late 2020 are M-chip Macs, so `arm64` is the right pick unless you know you have Intel.

- `Gooner-Client-<version>-mac-arm64.dmg` — Apple Silicon (M1/M2/M3/M4) — **default, download this one**
- `Gooner-Client-<version>-mac-x64.dmg` — Intel Macs only
- `SHA256SUMS.txt` — verify before opening (see below)

Not sure which Mac you have? Click the Apple menu → **About This Mac** → look at **Chip**: `Apple M1/M2/M3/M4` = arm64, `Intel` = x64.

> Do NOT download `Source code (zip/tar.gz)` unless you want to build yourself. Pre-releases like `v0.2.0-beta.1` are marked **Pre-release** and may be unstable.

## Features (OneClient parity, minus World Hosting)

Inspired by [Polyfrost OneLauncher / OneClient](https://github.com/Polyfrost/OneLauncher) (`GPL-3.0-only`). Re-implemented open-source, macOS-first:

- **Launcher** — one-click Fabric modpack install, instance/version management, Modrinth + CurseForge aware, Java auto-provision (Temurin 17/21), native `.app` + auto-update
- **Performance** — Sodium, Lithium, FerriteCore, Krypton, ModernFix, ImmediatelyFast, EntityCulling, Dynamic FPS (~2x claims track OneClient; see `data/modpack.json`)
- **HUD / UI** — OneConfig-style config, EvergreenHUD / VanillaHUD presets, light/dark themes, drag-and-drop HUD editor data in `data/hud-presets.json`
- **Mods** — curated 20+ Fabric client mods, per-mod enable/disable, sha512-verified Modrinth downloads (`src/main/launcher/modpack.ts`)
- **Multiplayer** — Hypixel / SMP / Simple Voice Chat compatible, No Chat Reports
- **Cosmetics** — capes, wings, hats, boots, backs, shoulders, auras (`data/cosmetics.json`, preview UI)
- **Trust** — 100% open source, GPL-3.0-only, no Electron-in-game, Sentry/Discord RPC optional

**Explicitly excluded: World Hosting.** No `world-host` / `e4mc` mods, no UPnP, no P2P relay, no friends-server hosting UI. See `BLOCKED_MODS` in `src/main/launcher/modpack.ts`. Normal multiplayer still works.

## Requirements

- macOS 13 Ventura or later (14 Sonoma+ recommended)
- Apple Silicon (arm64) or Intel (x64) — download matching DMG
- ~500 MB disk + Java auto-downloaded on first launch (Temurin 17/21)
- Paid Minecraft: Java Edition account for premium play (offline mode works without)

## Install (DMG, 5 steps)

1. Download the correct DMG from [releases/latest](https://github.com/etphli/gooner-client/releases/latest).
2. Verify checksum (below).
3. Double-click the `.dmg` to mount it. Drag `Gooner Client` into your personal Applications folder: `/Users/<your-name>/Applications` (in Finder: Go → Home, create an `Applications` folder there if you don't have one, and drag the app into it — ignore the arrow, that points at system Applications).
4. Eject the DMG.

### First launch — one-time Terminal fix

macOS will say the app is "damaged" or "can't be opened" because releases aren't Apple-notarized yet (paid cert planned). Fix it in Terminal:

1. Open **Terminal**.
2. Type exactly (note the trailing space): `xattr -cr ` 
3. Drag `Gooner Client` from your `~/Applications` folder **into the Terminal window** — the path fills in automatically. Press **Enter**.
4. Launch the app from `~/Applications`. Done permanently — you won't see the error again.

### Verify download

```sh
cd ~/Downloads
shasum -a 256 -c SHA256SUMS.txt
# expect: Gooner-Client-*.dmg: OK
```

## Sign in — 3 ways

Tokens live in app storage, passwords are never stored. Each method explains itself in the app after you tap it.

1. **Microsoft Device Link (another device) — RECOMMENDED** — `Accounts → Device Link` shows `microsoft.com/link` + code + countdown. Enter the code on your phone/PC, approve the Microsoft login there — the launcher completes automatically. Needs a Microsoft account that owns Minecraft Java.
2. **Offline** — `Accounts → Offline`, any name (3–16 letters/numbers/_). Instant, no Microsoft. Singleplayer + `online-mode=false` servers only — no Hypixel, Realms, or Mojang skins.
3. **Ely.by** — free Mojang-style accounts with working skins. Tutorial:
   1. Create a free account at https://account.ely.by (verify your email).
   2. In the launcher: `Accounts → Ely.by`, enter your Ely.by email (or nickname) + password.
   3. Press Sign in. Your Ely skin shows on Ely-enabled servers; everywhere else you appear default/offline.
   4. Wrong password? Reset it on the Ely.by site, then try again. The launcher only keeps the session token, never your password.

Advanced: Settings → Microsoft Client ID lets you use your own Azure app registration instead of the built-in one.

## Build from source

```sh
git clone https://github.com/etphli/gooner-client.git
cd gooner-client
npm ci
npm run dev        # Vite dev
npm run typecheck  # tsc
npm run dist:mac   # DMGs → release/
```

CI builds DMGs on tag `v*.*.*` (see `.github/workflows/release.yml`).

## Version numbers — how releases work

We use **SemVer**: `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`, `v1.2.3`).

- `MAJOR` — breaking changes (new auth flow, dropped macOS version)
- `MINOR` — new features (new mods, cosmetics, HUD presets)
- `PATCH` — bug fixes, small tweaks
- `-beta.N` / `-rc.N` suffix (e.g. `v0.2.0-beta.1`) = **Pre-release**, may be unstable. GitHub marks these as Pre-release automatically.

How to tell which is latest:

1. The badge at the top + **https://github.com/etphli/gooner-client/releases/latest** always redirect to the newest stable release.
2. Each release page shows its tag (`v0.1.0`), date, changelog, and Assets (`*-arm64.dmg`, `*-x64.dmg`, `SHA256SUMS.txt`).
3. `CHANGELOG.md` lists what changed per version. `package.json` `version` matches the tag (without `v`).

Maintainer flow: bump `package.json` + `CHANGELOG.md` → `git tag vX.Y.Z && git push origin vX.Y.Z` → CI builds DMGs → `softprops/action-gh-release` publishes. Current latest: **v0.1.0**.

## License & Credits

`GPL-3.0-only` — see [LICENSE](./LICENSE).

- Concepts inspired by [Polyfrost OneLauncher](https://github.com/Polyfrost/OneLauncher) © Polyfrost (GPL-3.0-only) and [OneConfig](https://github.com/Polyfrost/OneConfig) (LGPL-3.0 + Additional Terms). No vendored Polyfrost code; re-implemented.
- Independent community project. Not affiliated with Polyfrost, Mojang, or Microsoft.
- Redistribution must preserve notices, provide source, and state changes (GPL-3.0 §4–§6).
