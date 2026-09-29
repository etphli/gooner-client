// electron-builder afterPack hook: ad-hoc seal for macOS bundles.
//
// CI has no Developer ID certificate, so electron-builder skips signing
// entirely — leaving bundles with a broken seal that Squirrel.Mac rejects
// at update time ("code signature ... did not pass validation").
// A plain ad-hoc signature (`-`) seals the bundle so updates install, while
// changing nothing about Gatekeeper first-launch (still needs the xattr step).
// Deliberately NO --options runtime / entitlements: hardened runtime would add
// new restrictions; plain ad-hoc keeps runtime behavior identical to before.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  console.log(`[afterPack] ad-hoc sealing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log('[afterPack] ad-hoc seal verified');
};
