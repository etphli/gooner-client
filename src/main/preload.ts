// SPDX-License-Identifier: GPL-3.0-only
import { contextBridge, ipcRenderer } from 'electron';

const gooner = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('gooner:get-version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('gooner:get-platform'),
  getArch: (): Promise<string> => ipcRenderer.invoke('gooner:get-arch'),
  getSystem: (): Promise<unknown> => ipcRenderer.invoke('gooner:get-system'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('gooner:open-external', url),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('gooner:pick-directory'),
  // accounts (5 ways)
  listAccounts: (): Promise<unknown> => ipcRenderer.invoke('auth:list'),
  signInOffline: (username: string): Promise<unknown> => ipcRenderer.invoke('auth:offline', username),
  startDeviceFlow: (): Promise<{ userCode: string; verificationUri: string; verificationUriComplete?: string; expiresIn: number; sessionId: string }> => ipcRenderer.invoke('auth:device:start'),
  pollDeviceFlow: (deviceCode: string): Promise<unknown> => ipcRenderer.invoke('auth:device:poll', deviceCode),
  cancelDeviceFlow: (deviceCode?: string): Promise<void> => ipcRenderer.invoke('auth:device:cancel', deviceCode).then(() => undefined),
  signInBrowser: (): Promise<unknown> => ipcRenderer.invoke('auth:browser'),
  signInElyby: (u: string, p: string): Promise<unknown> => ipcRenderer.invoke('auth:elyby', u, p),
  signInCustom: (server: string, u: string, p: string): Promise<unknown> => ipcRenderer.invoke('auth:custom', server, u, p),
  removeAccount: (id: string): Promise<void> => ipcRenderer.invoke('auth:remove', id),
  // launcher (compat with renderer UI)
  getInstances: (): Promise<Array<{ id: string; name: string; version: string; loader?: string }>> => ipcRenderer.invoke('launcher:instances').then((list: Array<{ id: string; name: string; mcVersion: string; modLoader: string }>) => list.map((i) => ({ id: i.id, name: i.name, version: i.mcVersion, loader: i.modLoader }))),
  getVersions: (): Promise<string[]> => ipcRenderer.invoke('launcher:versions'),
  launch: (opts: { instanceId: string; version: string }): Promise<void> => ipcRenderer.invoke('launcher:launch', opts).then(() => undefined),
  cancelLaunch: async (): Promise<void> => undefined,
  onLaunchProgress: (_cb: (p: { percent: number; task: string }) => void): (() => void) => () => undefined,
  getMods: (instanceId?: string): Promise<unknown> => ipcRenderer.invoke('launcher:mods:list', instanceId).catch(() => []),
  searchMods: (query?: string): Promise<unknown> => ipcRenderer.invoke('launcher:mods:search', query).catch(() => []),
  toggleMod: (id?: string, enabled?: boolean): Promise<void> => ipcRenderer.invoke('launcher:mods:toggle', id, enabled).then(() => undefined).catch(() => undefined),
  setModVersion: (id?: string, version?: string): Promise<void> => ipcRenderer.invoke('launcher:mods:version', id, version).then(() => undefined).catch(() => undefined),
  getSettings: (): Promise<{ theme: string; ramMb: number; javaPath: string; resolution: { w: number; h: number }; showHud: boolean; closeOnLaunch: boolean; fov: number }> => ipcRenderer.invoke('launcher:settings:get').then((s: { theme: string; maxRamMb: number; javaPath: string | null }) => ({ theme: s.theme === 'gooner' ? 'dark' : (s.theme as string), ramMb: s.maxRamMb, javaPath: s.javaPath ?? '', resolution: { w: 1280, h: 720 }, showHud: true, closeOnLaunch: false, fov: 90 })),
  saveSettings: (s: { theme?: string; ramMb?: number; javaPath?: string }): Promise<void> => ipcRenderer.invoke('launcher:settings:save', { theme: s.theme, maxRamMb: s.ramMb, javaPath: s.javaPath }).then(() => undefined),
  browseJava: (): Promise<string | null> => ipcRenderer.invoke('gooner:pick-directory'),
  getCosmetics: (): Promise<unknown> => ipcRenderer.invoke('launcher:cosmetics:list').catch(() => []),
  equipCosmetic: (id: string): Promise<void> => ipcRenderer.invoke('launcher:cosmetics:equip', id).then(() => undefined).catch(() => undefined),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('updater:check'),
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:quit-and-install')
};

contextBridge.exposeInMainWorld('gooner', gooner);
