// SPDX-License-Identifier: GPL-3.0-only
import { contextBridge, ipcRenderer } from 'electron';

export interface LiteAccount {
  id: string;
  provider: string;
  minecraftUsername: string;
  minecraftUuid: string;
}

export interface DeviceFlow {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  sessionId: string;
  qrDataUrl?: string;
}

export interface Instance {
  id: string;
  name: string;
  version: string;
  loader?: string;
  lastPlayed?: number;
  icon?: string;
}

export interface CreateInstanceInput {
  name: string;
  mcVersion: string;
  modLoader?: 'vanilla' | 'fabric';
  loaderVersion?: string | null;
}

export interface InstalledModItem {
  slug: string;
  name: string;
  enabled: boolean;
  version: string;
  file: string;
}

export interface ModSearchResult {
  slug: string;
  title: string;
  description: string;
  iconUrl: string;
  downloads: number;
  clientSide: string;
}

export interface ModInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source: 'modrinth' | 'curseforge' | 'local';
  installedVersion: string;
  availableVersions: string[];
  iconUrl?: string;
}

export interface ClientSettings {
  ramMb: number;
  javaPath: string;
  theme: string;
  resolution: { w: number; h: number };
  showHud: boolean;
  closeOnLaunch: boolean;
  fov: number;
}

export interface Cosmetic {
  id: string;
  name: string;
  category: string;
  previewGradient: string;
  emoji: string;
  equipped: boolean;
}

export type UpdaterChannel =
  | 'updater:checking'
  | 'updater:available'
  | 'updater:not-available'
  | 'updater:progress'
  | 'updater:downloaded'
  | 'updater:error';

const UPDATER_CHANNELS: ReadonlySet<string> = new Set<string>([
  'updater:checking',
  'updater:available',
  'updater:not-available',
  'updater:progress',
  'updater:downloaded',
  'updater:error',
]);

interface RawInstance {
  id: string;
  name: string;
  mcVersion: string;
  modLoader: string;
  lastPlayedAt?: string | null;
  icon?: string | null;
}

function mapInstance(r: RawInstance): Instance {
  return {
    id: r.id,
    name: r.name,
    version: r.mcVersion,
    loader: r.modLoader,
    lastPlayed: r.lastPlayedAt ? Date.parse(r.lastPlayedAt) : undefined,
    icon: r.icon ?? undefined,
  };
}

const gooner = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('gooner:get-version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('gooner:get-platform'),
  getArch: (): Promise<string> => ipcRenderer.invoke('gooner:get-arch'),
  getSystem: (): Promise<{ platform: string; arch: string; release: string; totalMem: number; freeMem: number; cpus: number }> =>
    ipcRenderer.invoke('gooner:get-system'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('gooner:open-external', url),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('gooner:pick-directory'),
  listAccounts: (): Promise<LiteAccount[]> => ipcRenderer.invoke('auth:list'),
  activeAccount: (): Promise<LiteAccount | null> => ipcRenderer.invoke('auth:active:get'),
  setActiveAccount: (id: string): Promise<void> => ipcRenderer.invoke('auth:active:set', id).then(() => undefined),
  signInOffline: (username: string): Promise<unknown> => ipcRenderer.invoke('auth:offline', username),
  startDeviceFlow: (): Promise<DeviceFlow> => ipcRenderer.invoke('auth:device:start'),
  pollDeviceFlow: (deviceCode: string): Promise<unknown> => ipcRenderer.invoke('auth:device:poll', deviceCode),
  cancelDeviceFlow: (deviceCode?: string): Promise<void> =>
    ipcRenderer.invoke('auth:device:cancel', deviceCode).then(() => undefined),
  getMsClientId: (): Promise<string> => ipcRenderer.invoke('auth:ms-client-id:get'),
  setMsClientId: (id: string): Promise<string> => ipcRenderer.invoke('auth:ms-client-id:set', id),
  signInElyby: (username: string, password: string): Promise<unknown> =>
    ipcRenderer.invoke('auth:elyby', username, password),
  removeAccount: (id: string): Promise<void> => ipcRenderer.invoke('auth:remove', id),
  getInstances: (): Promise<Instance[]> =>
    ipcRenderer.invoke('launcher:instances').then((list: RawInstance[]) => list.map(mapInstance)),
  createInstance: (input: CreateInstanceInput): Promise<Instance> =>
    ipcRenderer.invoke('launcher:instances:create', input).then((r: RawInstance) => mapInstance(r)),
  deleteInstance: (id: string): Promise<void> => ipcRenderer.invoke('launcher:instances:delete', id).then(() => undefined),
  getVersions: (filter?: 'release' | 'snapshot' | 'all'): Promise<string[]> =>
    ipcRenderer.invoke('launcher:versions', filter),
  launch: (opts: { instanceId: string; version?: string }): Promise<{ pid?: number }> =>
    ipcRenderer.invoke('launcher:launch', opts),
  cancelLaunch: (): Promise<void> => Promise.resolve(),
  onLaunchProgress: (cb: (p: { percent: number; task: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { percent: number; task: string }): void => cb(payload);
    ipcRenderer.on('launcher:progress', handler as (...args: unknown[]) => void);
    return () => ipcRenderer.removeListener('launcher:progress', handler as (...args: unknown[]) => void);
  },
  getMods: (instanceId: string): Promise<InstalledModItem[]> => ipcRenderer.invoke('mods:list', instanceId),
  searchMods: (query: string, mcVersion?: string): Promise<ModSearchResult[]> =>
    ipcRenderer.invoke('mods:search', query, mcVersion),
  installMod: (instanceId: string, slug: string, mcVersion?: string): Promise<{ file: string; version: string }> =>
    ipcRenderer.invoke('mods:install', instanceId, slug, mcVersion),
  toggleMod: (instanceId: string, slug: string | boolean, enabled?: boolean): Promise<void> => {
    if (typeof slug === 'boolean') {
      const modId = instanceId;
      const want = slug;
      return ipcRenderer
        .invoke('launcher:instances')
        .then((list: RawInstance[]) => {
          const first = list[0];
          if (!first) return undefined;
          return ipcRenderer.invoke('mods:toggle', first.id, modId, want);
        })
        .then(() => undefined);
    }
    return ipcRenderer.invoke('mods:toggle', instanceId, slug, enabled).then(() => undefined);
  },
  removeMod: (instanceId: string, slug: string): Promise<void> =>
    ipcRenderer.invoke('mods:remove', instanceId, slug).then(() => undefined),
  setModVersion: (id?: string, version?: string): Promise<void> => {
    void id;
    void version;
    return Promise.resolve();
  },
  ensureJava: (mcVersion?: string, major?: 17 | 21): Promise<{ path: string; major: 17 | 21 }> =>
    ipcRenderer.invoke('java:ensure', mcVersion, major),
  onJavaProgress: (cb: (p: { message: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { message: string }): void => cb(payload);
    ipcRenderer.on('java:progress', handler as (...args: unknown[]) => void);
    return () => ipcRenderer.removeListener('java:progress', handler as (...args: unknown[]) => void);
  },
  onUpdater: (channel: UpdaterChannel, cb: (payload?: unknown) => void): (() => void) => {
    if (!UPDATER_CHANNELS.has(channel)) return () => undefined;
    const handler = (_e: unknown, payload?: unknown): void => cb(payload);
    ipcRenderer.on(channel, handler as (...args: unknown[]) => void);
    return () => ipcRenderer.removeListener(channel, handler as (...args: unknown[]) => void);
  },
  getSettings: (): Promise<ClientSettings> =>
    ipcRenderer
      .invoke('launcher:settings:get')
      .then((s: { theme: string; maxRamMb: number; javaPath: string | null; closeOnLaunch?: boolean }) => ({
        theme: s.theme === 'gooner' ? 'dark' : s.theme,
        ramMb: s.maxRamMb,
        javaPath: s.javaPath ?? '',
        resolution: { w: 1280, h: 720 },
        showHud: true,
        closeOnLaunch: Boolean(s.closeOnLaunch ?? false),
        fov: 90,
      })),
  saveSettings: (s: ClientSettings): Promise<void> =>
    ipcRenderer
      .invoke('launcher:settings:save', {
        theme: s.theme,
        maxRamMb: s.ramMb,
        javaPath: s.javaPath,
        closeOnLaunch: s.closeOnLaunch,
      })
      .then(() => undefined),
  browseJava: (): Promise<string | null> => ipcRenderer.invoke('gooner:pick-directory'),
  getCosmetics: (): Promise<Cosmetic[]> => ipcRenderer.invoke('launcher:cosmetics:list').catch(() => []),
  equipCosmetic: (id: string): Promise<void> =>
    ipcRenderer.invoke('launcher:cosmetics:equip', id).then(() => undefined).catch(() => undefined),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('updater:check'),
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:quit-and-install'),
};

contextBridge.exposeInMainWorld('gooner', gooner);
