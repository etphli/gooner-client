// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — main process entry (Electron)
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const isMac = process.platform === 'darwin';
let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) app.quit();

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
  ipcMain.handle('auth:list', async () => (await import('./auth/store.js')).listAccounts());
  ipcMain.handle('auth:offline', async (_e, username: string) => {
    if (typeof username !== 'string') throw new Error('Invalid username');
    const { createOfflineAccount } = await import('./auth/offline.js');
    const { saveAccount } = await import('./auth/store.js');
    const acc = createOfflineAccount(username.trim());
    await saveAccount(acc);
    return acc;
  });
  ipcMain.handle('auth:device:start', async () => {
    const { requestDeviceCode } = await import('./auth/deviceCode.js');
    const info = await requestDeviceCode();
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
      const microsoft = await pollDeviceCodeForToken({ userCode: '', deviceCode, verificationUri: 'https://www.microsoft.com/link', expiresIn, interval }, { signal: ctl.signal });
      const chain = await microsoftToMinecraft(microsoft.accessToken, { signal: ctl.signal });
      const now = Date.now();
      const account = { id: randomUUID(), provider: 'microsoft-device' as const, minecraftUsername: chain.profile.name, minecraftUuid: addUuidDashes(chain.profile.id), microsoft, xbox: { xblToken: chain.xblToken, xblUserHash: chain.xblUserHash, xstsToken: chain.xstsToken, xstsUserHash: chain.xstsUserHash }, minecraft: { accessToken: chain.mcAccessToken, expiresAt: chain.mcExpiresAt, ownsMinecraft: chain.ownsMinecraft }, profile: chain.profile, ownsMinecraft: chain.ownsMinecraft, createdAt: now, updatedAt: now };
      await saveAccount(account);
      return account;
    } finally {
      deviceAborts.delete(deviceCode);
    }
  });
  ipcMain.handle('auth:browser', async () => {
    const { signInWithBrowser } = await import('./auth/browser.js');
    const { saveAccount } = await import('./auth/store.js');
    const { account } = await signInWithBrowser();
    await saveAccount(account);
    return account;
  });
  ipcMain.handle('auth:elyby', async (_e, u: string, p: string) => {
    const { signInWithElyBy } = await import('./auth/elyby.js');
    const { saveAccount } = await import('./auth/store.js');
    const acc = await signInWithElyBy(u, p);
    await saveAccount(acc);
    return acc;
  });
  ipcMain.handle('auth:custom', async (_e, server: string, u: string, p: string) => {
    if (typeof server !== 'string' || server.length > 2083) throw new Error('Invalid server URL');
    if (typeof u !== 'string' || !u || typeof p !== 'string' || !p) throw new Error('Username and password required');
    const { signInWithCustomYggdrasil } = await import('./auth/elyby.js');
    const { saveAccount } = await import('./auth/store.js');
    const acc = await signInWithCustomYggdrasil(server, u, p);
    await saveAccount(acc);
    return acc;
  });
  ipcMain.handle('auth:remove', async (_e, id: string) => (await import('./auth/store.js')).removeAccount(id));

  // Launcher
  ipcMain.handle('launcher:versions', async () => (await import('./launcher/minecraft.js')).listMcVersions('release'));
  ipcMain.handle('launcher:instances', async () => (await import('./launcher/instances.js')).listInstances());
  ipcMain.handle('launcher:instances:create', async (_e, input) => (await import('./launcher/instances.js')).createInstance(input));
  ipcMain.handle('launcher:launch', async (_e, req) => {
    if (!req || typeof req.mcVersion !== 'string' || !/^[0-9a-z._-]+$/i.test(req.mcVersion)) {
      // Back-compat: renderer sends { instanceId, version }.
      if (req && typeof req.version === 'string' && typeof req.instanceId === 'string') {
        req = { ...req, mcVersion: req.version };
      } else {
        throw new Error('Invalid launch request');
      }
    }
    if (req.extraJvmArgs?.some((a: string) => /javaagent|xbootclasspath|Djava\.|Djdk\./i.test(a))) {
      throw new Error('Blocked JVM arg');
    }
    const { launchMinecraft } = await import('./launcher/minecraft.js');
    const { markPlayed } = await import('./launcher/instances.js');
    const child = await launchMinecraft(req);
    if (req.instanceId) await markPlayed(req.instanceId).catch(() => undefined);
    return { pid: child.pid };
  });
  ipcMain.handle('launcher:modpack:sync', async (_e, opts) => (await import('./launcher/modpack.js')).syncModpack(opts));
  ipcMain.handle('launcher:settings:get', async () => (await import('./launcher/settings.js')).loadSettings());
  ipcMain.handle('launcher:settings:save', async (_e, patch) => (await import('./launcher/settings.js')).saveSettings(patch));

  ipcMain.handle('updater:check', async () => {
    if (isDev) return { skipped: true };
    return autoUpdater.checkForUpdates();
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
  autoUpdater.on('update-downloaded', (i) => send('updater:downloaded', i));
  autoUpdater.on('error', (e) => send('updater:error', String(e)));
}

app.whenReady().then(async () => {
  registerIpc();
  wireAutoUpdater();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  if (!isDev && app.isPackaged) {
    try { await autoUpdater.checkForUpdatesAndNotify(); } catch { /* renderer can retry */ }
  }
});
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
