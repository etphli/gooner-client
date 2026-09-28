# Release notes template (use for EVERY release — keep sections + order)

## Download (macOS)

**Default: Apple Silicon (M1/M2/M3/M4) → `arm64` DMG.** Intel Macs → `x64`. Unsure: Apple menu → About This Mac → Chip.

- `Gooner-Client-<version>-mac-arm64.dmg` — Apple Silicon, **default**
- `Gooner-Client-<version>-mac-x64.dmg` — Intel only
- `SHA256SUMS.txt` — verify: `shasum -a 256 -c SHA256SUMS.txt`

## First launch — one-time Terminal fix

macOS will say the app is "damaged" (not Apple-notarized yet). Fix:

1. Drag `Gooner Client` into your `~/Applications` (`/Users/<you>/Applications`, create it if missing).
2. Open Terminal, type `xattr -cr ` (trailing space), drag the app from `~/Applications` into Terminal, press Enter.
3. Launch from `~/Applications`. Done permanently.

## What's changed

- ...

## Version

`vX.Y.Z` (SemVer: MAJOR breaking / MINOR features / PATCH fixes; `-beta.N` = pre-release). See README "Version numbers" + CHANGELOG.md.

**Full changelog:** `https://github.com/etphli/gooner-client/compare/<prev>...<new>`
