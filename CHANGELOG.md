# Changelog
All notable changes documented. Format based on Keep a Changelog, SemVer.

## [Unreleased]

## [0.1.3] - 2026-09-28
### Removed
- Windows NSIS build (macOS-first: DMGs + Linux AppImage only).

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
