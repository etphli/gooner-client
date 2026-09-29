// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — main process entry (Electron)
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const isMac = process.platform === 'darwin';
let mainWindow: BrowserWindow | null = null;

const runningGames = new Set<ChildProcess>();

if (!app.requestSingleInstanceLock()) app.quit();

app.on('before-quit', () => {
  for (const child of runningGames) {
    try {
      child.kill();
    } catch {
      /* already exited */
    }
  }
  runningGames.clear();
});

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    title: 'Gooner Client', backgroundColor: '#0e0f13',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

function toLiteAccount(a: { id: string; provider: string; minecraftUsername: string; minecraftUuid: string }): {
  id: string; provider: string; minecraftUsername: string; minecraftUuid: string;
} {
  return { id: a.id, provider: a.provider, minecraftUsername: a.minecraftUsername, minecraftUuid: a.minecraftUuid };
}

function registerIpc(): void {
  ipcMain.handle('gooner:get-version', () => app.getVersion());
  ipcMain.handle('gooner:get-platform', () => process.platform);
  ipcMain.handle('gooner:get-arch', () => process.arch);
  ipcMain.handle('gooner:get-system', () => ({
    platform: process.platform, arch: process.arch, release: os.release(),
    totalMem: os.totalmem(), freeMem: os.freemem(), cpus: os.cpus().length
  }));
  ipcMain.handle('gooner:open-external', async (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('Invalid URL');
    await shell.openExternal(url);
  });
  ipcMain.handle('gooner:pick-directory', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0] ?? null;
  });

  // Accounts
  const deviceAborts = new Map<string, AbortController>();
  ipcMain.handle('auth:list', async () => {
    const { listAccounts } = await import('./auth/store.js');
    const all = await listAccounts();
    return all.map(toLiteAccount);
  });
  ipcMain.handle('auth:active:get', async () => {
    const { listAccounts } = await import('./auth/store.js');
    const { loadSettings } = await import('./launcher/settings.js');
    const settings = await loadSettings();
    const activeId = (settings as { activeAccountId?: string | null }).activeAccountId ?? null;
    if (!activeId) return null;
    const all = await listAccounts();
    const found = all.find((a) => a.id === activeId);
    return found ? toLiteAccount(found) : null;
  });
  ipcMain.handle('auth:active:set', async (_e, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid account id');
    const { listAccounts } = await import('./auth/store.js');
    const { saveSettings } = await import('./launcher/settings.js');
    const all = await listAccounts();
    const found = all.find((a) => a.id === id);
    if (!found) throw new Error(`Account not found: ${id}`);
    await saveSettings({ activeAccountId: id });
  });
  ipcMain.handle('auth:offline', async (_e, username: string) => {
    if (typeof username !== 'string') throw new Error('Invalid username');
    const { createOfflineAccount } = await import('./auth/offline.js');
    const { saveAccount } = await import('./auth/store.js');
    const acc = createOfflineAccount(username.trim());
    await saveAccount(acc);
    return acc;
  });
  const getMsClientId = async (): Promise<string> => {
    const { loadSettings } = await import('./launcher/settings.js');
    const { DEFAULT_MS_CLIENT_ID } = await import('./auth/types.js');
    const s = await loadSettings();
    return (s as { msClientId?: string | null }).msClientId ?? DEFAULT_MS_CLIENT_ID;
  };
  ipcMain.handle('auth:ms-client-id:get', async () => getMsClientId());
  ipcMain.handle('auth:ms-client-id:set', async (_e, id?: string) => {
    const { saveSettings } = await import('./launcher/settings.js');
    const { DEFAULT_MS_CLIENT_ID } = await import('./auth/types.js');
    const clean = typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
    await saveSettings({ msClientId: clean });
    return clean ?? DEFAULT_MS_CLIENT_ID;
  });
  ipcMain.handle('auth:device:start', async () => {
    const { requestDeviceCode } = await import('./auth/deviceCode.js');
    const info = await requestDeviceCode(await getMsClientId());
    deviceAborts.set(info.deviceCode, new AbortController());
    return { userCode: info.userCode, verificationUri: info.verificationUri, verificationUriComplete: info.verificationUriComplete, expiresIn: info.expiresIn, sessionId: info.deviceCode };
  });
  ipcMain.handle('auth:device:cancel', async (_e, deviceCode?: string) => {
    if (typeof deviceCode === 'string' && deviceCode) {
      deviceAborts.get(deviceCode)?.abort();
      deviceAborts.delete(deviceCode);
    }
  });
  ipcMain.handle('auth:device:poll', async (_e, deviceCode: string, interval = 5, expiresIn = 900) => {
    if (typeof deviceCode !== 'string' || !deviceCode) throw new Error('Invalid deviceCode');
    const ctl = deviceAborts.get(deviceCode) ?? new AbortController();
    try {
      const { pollDeviceCodeForToken } = await import('./auth/deviceCode.js');
      const { microsoftToMinecraft } = await import('./auth/minecraftChain.js');
      const { saveAccount } = await import('./auth/store.js');
      const { addUuidDashes } = await import('./auth/types.js');
      const { randomUUID } = await import('node:crypto');
      const microsoft = await pollDeviceCodeForToken({ userCode: '', deviceCode, verificationUri: 'https://www.microsoft.com/link', expiresIn, interval }, { clientId: await getMsClientId(), signal: ctl.signal });
      const chain = await microsoftToMinecraft(microsoft.accessToken, { signal: ctl.signal });
      const now = Date.now();
      const account = { id: randomUUID(), provider: 'microsoft-device' as const, minecraftUsername: chain.profile.name, minecraftUuid: addUuidDashes(chain.profile.id), microsoft, xbox: { xblToken: chain.xblToken, xblUserHash: chain.xblUserHash, xstsToken: chain.xstsToken, xstsUserHash: chain.xstsUserHash }, minecraft: { accessToken: chain.mcAccessToken, expiresAt: chain.mcExpiresAt, ownsMinecraft: chain.ownsMinecraft }, profile: chain.profile, ownsMinecraft: chain.ownsMinecraft, createdAt: now, updatedAt: now };
      await saveAccount(account);
      return account;
    } finally {
      deviceAborts.delete(deviceCode);
    }
  });
  ipcMain.handle('auth:elyby', async (_e, u: string, p: string) => {
    const { signInWithElyBy } = await import('./auth/elyby.js');
    const { saveAccount } = await import('./auth/store.js');
    const acc = await signInWithElyBy(u, p);
    await saveAccount(acc);
    return acc;
  });
  ipcMain.handle('auth:remove', async (_e, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid account id');
    const { removeAccount } = await import('./auth/store.js');
    await removeAccount(id);
    try {
      const { loadSettings, saveSettings } = await import('./launcher/settings.js');
      const settings = await loadSettings();
      if ((settings as { activeAccountId?: string | null }).activeAccountId === id) {
        await saveSettings({ activeAccountId: null });
      }
    } catch {
      /* non-fatal */
    }
  });

  // Launcher
  ipcMain.handle('launcher:versions', async (_e, filter?: string) => {
    const f = filter === 'snapshot' || filter === 'all' || filter === 'release' ? filter : 'release';
    const mod = await import('./launcher/minecraft.js');
    if (f === 'all') return mod.listMcVersions('all');
    if (f === 'release') return mod.listMcVersions('release');
    const manifest = await mod.fetchVersionManifest();
    return manifest.versions.filter((v) => v.type === 'snapshot').map((v) => v.id);
  });
  ipcMain.handle('launcher:instances', async () => (await import('./launcher/instances.js')).listInstances());
  ipcMain.handle('launcher:instances:create', async (_e, input) => (await import('./launcher/instances.js')).createInstance(input));
  ipcMain.handle('launcher:instances:delete', async (_e, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid instance id');
    return (await import('./launcher/instances.js')).deleteInstance(id);
  });
  ipcMain.handle('launcher:launch', async (e, req: { instanceId?: unknown }) => {
    const sender = e.sender;
    const emit = (percent: number, task: string): void => {
      try {
        sender.send('launcher:progress', { percent, task });
      } catch {
        /* window closed */
      }
    };
    emit(10, 'Resolving instance...');
    const rawId = (req as { instanceId?: unknown } | null | undefined)?.instanceId;
    if (typeof rawId !== 'string' || !rawId) throw new Error('Invalid instanceId');
    const { getInstance, getInstanceDir, markPlayed, updateInstance } = await import('./launcher/instances.js');
    const inst = await getInstance(rawId);
    if (!inst) throw new Error(`Instance not found: ${rawId}. Create a profile in Mods → Profiles first.`);
    // The version picked in Play wins for this launch (and becomes the default).
    const rawVer = (req as { version?: unknown } | null | undefined)?.version;
    let mcVersion = inst.mcVersion;
    if (typeof rawVer === 'string' && /^[0-9a-z._-]+$/i.test(rawVer) && rawVer !== inst.mcVersion) {
      mcVersion = rawVer;
      await updateInstance(rawId, { mcVersion }).catch(() => undefined);
    }
    const gameDir = getInstanceDir(rawId);
    const { listAccounts } = await import('./auth/store.js');
    const { loadSettings } = await import('./launcher/settings.js');
    const settings = await loadSettings();
    const all = await listAccounts();
    if (!all.length) throw new Error('No accounts signed in');
    const activeId = (settings as { activeAccountId?: string | null }).activeAccountId ?? null;
    const raw = all.find((a) => a.id === activeId) ?? all[0];
    if (!raw) throw new Error('No accounts signed in');
    const accessToken =
      raw.minecraft?.accessToken ??
      (raw as unknown as { yggdrasil?: { accessToken?: string } }).yggdrasil?.accessToken ??
      '0';
    const account = { username: raw.minecraftUsername, uuid: raw.minecraftUuid, accessToken };
    emit(40, 'Ensuring Java...');
    const { ensureJavaForMinecraft } = await import('./launcher/java.js');
    await ensureJavaForMinecraft(mcVersion, {
      onProgress: (msg: string) => {
        try {
          sender.send('launcher:progress', { percent: 40, task: msg });
        } catch {
          /* closed */
        }
      },
    });
    emit(70, 'Preparing libraries and assets...');
    const { launchMinecraft } = await import('./launcher/minecraft.js');
    const child = await launchMinecraft({
      mcVersion,
      modLoader: inst.modLoader,
      loaderVersion: inst.loaderVersion ?? undefined,
      account,
      instanceDir: gameDir,
    });
    await markPlayed(rawId).catch(() => undefined);
    if (child.pid !== undefined) {
      runningGames.add(child);
      child.on('exit', () => {
        runningGames.delete(child);
      });
    }
    emit(100, 'Running');
    return { pid: child.pid };
  });
  ipcMain.handle('launcher:modpack:sync', async (_e, opts) => (await import('./launcher/modpack.js')).syncModpack(opts));
  ipcMain.handle('launcher:settings:get', async () => (await import('./launcher/settings.js')).loadSettings());
  ipcMain.handle('launcher:settings:save', async (_e, patch) => (await import('./launcher/settings.js')).saveSettings(patch));

  // Mods (Modrinth)
  ipcMain.handle('mods:search', async (_e, query?: string, mcVersion?: string) => {
    const q = typeof query === 'string' ? query : '';
    const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : undefined;
    const { searchMods } = await import('./modrinth.js');
    return searchMods(q, mc);
  });
  ipcMain.handle('mods:list', async (_e, instanceId?: string) => {
    if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
    const { getInstanceDir } = await import('./launcher/instances.js');
    const { listInstalledMods } = await import('./launcher/modpack.js');
    const dir = getInstanceDir(instanceId);
    const installed = await listInstalledMods(dir);
    return installed.map((m) => ({ slug: m.slug, name: m.slug, enabled: m.enabled, version: '', file: m.file }));
  });
  ipcMain.handle('mods:install', async (_e, instanceId?: string, slug?: string, mcVersion?: string) => {
    if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
    if (typeof slug !== 'string' || !slug) throw new Error('Invalid slug');
    const { getInstance, getInstanceDir } = await import('./launcher/instances.js');
    const inst = await getInstance(instanceId);
    if (!inst) throw new Error(`Instance not found: ${instanceId}`);
    const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : inst.mcVersion;
    const dir = getInstanceDir(instanceId);
    const { installModFile } = await import('./modrinth.js');
    return installModFile(dir, slug, mc);
  });
  ipcMain.handle('mods:toggle', async (_e, instanceId?: string, slug?: string, enabled?: boolean) => {
    if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
    if (typeof slug !== 'string' || !slug) throw new Error('Invalid slug');
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled');
    const { getInstanceDir } = await import('./launcher/instances.js');
    const { enableMod, disableMod } = await import('./launcher/modpack.js');
    const dir = getInstanceDir(instanceId);
    if (enabled) await enableMod(dir, slug);
    else await disableMod(dir, slug);
  });
  ipcMain.handle('mods:remove', async (_e, instanceId?: string, slug?: string) => {
    if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
    if (typeof slug !== 'string' || !slug) throw new Error('Invalid slug');
    const { getInstanceDir } = await import('./launcher/instances.js');
    const { modPaths } = await import('./launcher/modpack.js');
    const { enabled, disabled } = modPaths(getInstanceDir(instanceId), slug);
    const fs = await import('node:fs/promises');
    await fs.rm(enabled, { force: true });
    await fs.rm(disabled, { force: true });
  });
  ipcMain.handle('mods:search-ex', async (_e, query?: string, mcVersion?: string, projectType?: string) => {
    const q = typeof query === 'string' ? query : '';
    const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : undefined;
    const t =
      projectType === 'shader' || projectType === 'resourcepack' || projectType === 'datapack' || projectType === 'modpack' || projectType === 'mod'
        ? projectType
        : 'mod';
    const { searchProjects } = await import('./modrinth.js');
    return searchProjects(q, mc, t as 'mod' | 'shader' | 'resourcepack' | 'datapack' | 'modpack');
  });
  ipcMain.handle(
    'mods:install-to',
    async (_e, instanceId?: string, slug?: string, mcVersion?: string, kind?: string) => {
      if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
      if (typeof slug !== 'string' || !slug) throw new Error('Invalid slug');
      const { getInstance, getInstanceDir } = await import('./launcher/instances.js');
      const inst = await getInstance(instanceId);
      if (!inst) throw new Error(`Instance not found: ${instanceId}`);
      const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : inst.mcVersion;
      const dir = getInstanceDir(instanceId);
      const k = kind === 'shader' ? 'shader' : kind === 'resourcepack' ? 'resourcepack' : 'mod';
      const subdir = k === 'shader' ? 'shaderpacks' : k === 'resourcepack' ? 'resourcepacks' : 'mods';
      const projectType = k === 'shader' ? 'shader' : k === 'resourcepack' ? 'resourcepack' : 'mod';
      const { installProjectTo } = await import('./modrinth.js');
      return installProjectTo(
        dir,
        slug,
        mc,
        projectType as 'mod' | 'shader' | 'resourcepack',
        subdir as 'mods' | 'shaderpacks' | 'resourcepacks',
      );
    },
  );
  ipcMain.handle('datapacks:worlds', async (_e, instanceId?: string) => {
    if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
    const { getInstance, getInstanceDir } = await import('./launcher/instances.js');
    const inst = await getInstance(instanceId);
    if (!inst) throw new Error(`Instance not found: ${instanceId}`);
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const savesDir = path.join(getInstanceDir(instanceId), 'saves');
    const entries = await fs.readdir(savesDir).catch(() => [] as string[]);
    const out: Array<{ name: string; packs: string[] }> = [];
    for (const name of entries) {
      if (!/^[A-Za-z0-9 _-]+$/.test(name)) continue;
      const levelDat = path.join(savesDir, name, 'level.dat');
      const st = await fs.stat(levelDat).catch(() => null);
      if (!st || !st.isFile()) continue;
      const packsDir = path.join(savesDir, name, 'datapacks');
      const packFiles = await fs.readdir(packsDir).catch(() => [] as string[]);
      const packs = packFiles.filter((f) => f.toLowerCase().endsWith('.zip')).sort();
      out.push({ name, packs });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  });
  ipcMain.handle(
    'datapacks:install-url',
    async (_e, instanceId?: string, world?: string, url?: string, filename?: string) => {
      if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
      if (typeof world !== 'string' || !/^[A-Za-z0-9 _-]+$/.test(world)) throw new Error('Invalid world');
      if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('Invalid URL');
      if (typeof filename !== 'string' || !filename) throw new Error('Invalid filename');
      const path = await import('node:path');
      const safe = path.basename(filename).trim();
      if (!/^[A-Za-z0-9 _.-]+\.zip$/i.test(safe)) throw new Error('Filename must be a safe *.zip name');
      const { getInstance, getInstanceDir } = await import('./launcher/instances.js');
      const inst = await getInstance(instanceId);
      if (!inst) throw new Error(`Instance not found: ${instanceId}`);
      const { fetchWithRetry } = await import('./net.js');
      const res = await fetchWithRetry(url, {}, { label: 'Datapack', timeoutMs: 60000, retries: 2 });
      if (!res.ok || !res.body) throw new Error(`Datapack download failed ${res.status}: ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const fs = await import('node:fs/promises');
      const dest = path.join(getInstanceDir(instanceId), 'saves', world, 'datapacks', safe);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      return { file: dest };
    },
  );
  ipcMain.handle('datapacks:import-file', async (_e, instanceId?: string, world?: string) => {
    if (typeof instanceId !== 'string' || !instanceId) throw new Error('Invalid instanceId');
    if (typeof world !== 'string' || !/^[A-Za-z0-9 _-]+$/.test(world)) throw new Error('Invalid world');
    const { getInstance, getInstanceDir } = await import('./launcher/instances.js');
    const inst = await getInstance(instanceId);
    if (!inst) throw new Error(`Instance not found: ${instanceId}`);
    if (!mainWindow) throw new Error('Window not ready');
    const picked = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Datapack', extensions: ['zip'] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const src = picked.filePaths[0];
    const safe = path.basename(src).trim();
    if (!/^[A-Za-z0-9 _.-]+\.zip$/i.test(safe)) throw new Error('File must be a *.zip datapack');
    const dest = path.join(getInstanceDir(instanceId), 'saves', world, 'datapacks', safe);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return { file: dest };
  });

  // Network diagnostics
  ipcMain.handle('net:diagnose', async () => {
    const { diagnoseEndpoints } = await import('./net.js');
    return diagnoseEndpoints();
  });

  // Java
  ipcMain.handle('java:ensure', async (e, mcVersion?: string | number, major?: number) => {    const sender = e.sender;
    const onProgress = (message: string): void => {
      try {
        sender.send('java:progress', { message });
      } catch {
        /* closed */
      }
    };
    const { ensureJava, ensureJavaForMinecraft } = await import('./launcher/java.js');
    let majorNum: 17 | 21 | undefined;
    if (major === 17 || major === 21) majorNum = major;
    else if (mcVersion === 17 || mcVersion === 21) majorNum = mcVersion;
    if (majorNum !== undefined) {
      const p = await ensureJava(majorNum, { onProgress });
      return { path: p, major: majorNum };
    }
    const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : '1.21.1';
    const res = await ensureJavaForMinecraft(mc, { onProgress });
    return { path: res.path, major: res.major };
  });

  ipcMain.handle('updater:check', async () => {
    if (isDev) return { skipped: true };
    // checkForUpdates() returns objects (cancellation tokens, etc.) that
    // structured-clone cannot cross IPC ("An object could not be cloned"),
    // so project to plain JSON before returning.
    const res = await autoUpdater.checkForUpdates();
    const info = res?.updateInfo as
      | { version?: unknown; releaseDate?: unknown; releaseName?: unknown; releaseNotes?: unknown }
      | undefined;
    return {
      version: typeof info?.version === 'string' ? info.version : null,
      releaseDate: typeof info?.releaseDate === 'string' ? info.releaseDate : null,
      releaseName: typeof info?.releaseName === 'string' ? info.releaseName : null,
      hasNotes: info?.releaseNotes !== undefined && info?.releaseNotes !== null,
    };
  });
  ipcMain.handle('updater:quit-and-install', () => autoUpdater.quitAndInstall(false, true));
}

function wireAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const send = (ch: string, p?: unknown) => { try { mainWindow?.webContents.send(ch, p); } catch { /* closed */ } };
  autoUpdater.on('checking-for-update', () => send('updater:checking'));
  autoUpdater.on('update-available', (i) => send('updater:available', i));
  autoUpdater.on('update-not-available', (i) => send('updater:not-available', i));
  autoUpdater.on('download-progress', (p) => send('updater:progress', p));
  autoUpdater.on('update-downloaded', (i) => {
    send('updater:downloaded', i);
    try {
      if (process.platform === 'darwin' && app.dock) {
        app.dock.setBadge('•');
        app.dock.bounce('informational');
      }
    } catch {
      /* dock badge best-effort */
    }
  });
  autoUpdater.on('error', (e) => send('updater:error', String(e)));
}

function clearDockBadge(): void {
  try {
    if (process.platform === 'darwin' && app.dock) app.dock.setBadge('');
  } catch {
    /* ignore */
  }
}

app.whenReady().then(async () => {
  registerIpc();
  wireAutoUpdater();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  app.on('browser-window-focus', () => clearDockBadge());
  if (!isDev && app.isPackaged) {
    try { await autoUpdater.checkForUpdatesAndNotify(); } catch { /* renderer can retry */ }
  }
  // Background Java prefetch so first launch rarely waits on a 200MB download.
  void (async () => {
    try {
      const { fetchVersionManifest } = await import('./launcher/minecraft.js');
      const manifest = await fetchVersionManifest().catch(() => null);
      const target = manifest?.latest?.release ?? '1.21.1';
      const { ensureJavaForMinecraft } = await import('./launcher/java.js');
      await ensureJavaForMinecraft(target, {}).catch(() => undefined);
    } catch {
      /* background best-effort */
    }
  })();
});
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });

// Check for updates on quit: if one is found, download it and offer to
// install immediately instead of silently quitting. Second quit attempt
// within the flow always quits (never trap the user).
let quitArmed = false;
let quitAttempts = 0;
app.on('before-quit', (e) => {
  if (isDev || !app.isPackaged || quitArmed) return;
  quitAttempts += 1;
  if (quitAttempts > 1) return;
  e.preventDefault();
  void (async () => {
    try {
      const res = await autoUpdater.checkForUpdates();
      const v = res?.updateInfo?.version;
      if (v && v !== app.getVersion()) {
        await autoUpdater.downloadUpdate();
        clearDockBadge();
        const { dialog: dlg } = await import('electron');
        const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        const { response } = parent
          ? await dlg.showMessageBox(parent, {
              type: 'question',
              title: 'Update ready',
              message: `Gooner Client v${v} downloaded. Install now?`,
              buttons: ['Install & restart', 'Quit without updating'],
              defaultId: 0,
              cancelId: 1,
            })
          : await dlg.showMessageBox({
              type: 'question',
              title: 'Update ready',
              message: `Gooner Client v${v} downloaded. Install now?`,
              buttons: ['Install & restart', 'Quit without updating'],
              defaultId: 0,
              cancelId: 1,
            });
        if (response === 0) {
          quitArmed = true;
          autoUpdater.quitAndInstall(false, true);
          return;
        }
      }
    } catch {
      /* any failure → just quit */
    }
    quitArmed = true;
    app.quit();
  })();
});
