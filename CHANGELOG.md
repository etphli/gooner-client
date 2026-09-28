# Changelog
All notable changes documented. Format based on Keep a Changelog, SemVer.

## [Unreleased]

## [0.3.0] - 2026-09-28
### Added
- Proxy support: OS proxy auto-detect + manual proxy in Settings (no VPN needed).
- Update banner + Dock badge when an update is ready (visible update test).
- Mods: CurseForge-style browser (sort, detail view, version-aware install), profile chips.
- Offline-proof version picker (disk cache + bundled fallback); background Java prefetch.
### Fixed
- Play no longer uses a fake profile (auto-creates a real Main); picked version is what launches.
### Fixed
- Microsoft Device Link: working client ID (verified live) + overridable in Settings.
- Network hardening: timeouts, retries, actionable errors (no more bare "fetch failed") across auth, Java, Modrinth.
- Login rewrite: per-method guides, busy guards, cancel, no demo codes, offline validation.
- Onboarding: version dropdown, Java skip option.
- DMG: drag-cue arrow in installer art.
### Removed
- Microsoft Browser + Custom server sign-in.

## [0.2.0] - 2026-09-28
### Added
- Onboarding: first-launch sign-in gate (all 5 auth ways) + Java setup with progress.
- Profile menu (top-right): switch/add/remove accounts.
- In-app updates: check, download progress, restart (no reinstall).
- Mod browser: search + install any Fabric Modrinth mod; per-profile mod folders.
- Profiles: create/delete mod profiles, launch the game from any profile.
- Any game version: release/snapshot picker via live Mojang manifest.
- Premium Notion-style light/dark UI; native traffic lights (no more dupes).
### Fixed
- Crisp multi-size app icon; tighter DMG layout.
### Removed
- Windows NSIS build (macOS-first: DMGs + Linux AppImage only).

## [0.1.3] - 2026-09-28
### Added
- Per-Mac download guidance (default M-chip arm64).
- Release-notes template (docs/RELEASE_NOTES_TEMPLATE.md).

## [0.1.2] - 2026-09-28
### Added
- Branded DMG: custom app icon, dark installer background, arranged drag-to-Applications window.
- Visual polish + auth/launcher hardening (see README).
### Fixed
- DMG build: background image only (removed conflicting backgroundColor).
- Linux NSIS build without wine (unsigned: signAndEditExecutable off).

## [0.1.1] - 2026-09-28
### Added
- Version bump for first CI-built release.

## [0.1.0] - 2026-09-28
### Added
- Initial Gooner Client: Electron launcher, 5-way auth (device-link/browser/offline/elyby/custom), curated modpack minus World Hosting, HUD presets, cosmetics, mac DMG via electron-builder, CI + Release workflows, README with latest-release download docs.
### Removed
- World Hosting (world-host / e4mc) — out of scope.
