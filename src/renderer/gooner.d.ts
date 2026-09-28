export interface LiteAccount {
  id: string;
  provider: string;
  minecraftUsername: string;
  minecraftUuid: string;
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
  proxy: string;
  theme: string;
  resolution: { w: number; h: number };
  showHud: boolean;
  closeOnLaunch: boolean;
  fov: number;
}
export interface DeviceFlow {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  sessionId: string;
  qrDataUrl?: string;
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
declare global {
  interface Window {
    gooner: {
      getVersion(): Promise<string>;
      getPlatform(): Promise<string>;
      getArch(): Promise<string>;
      getSystem(): Promise<{ platform: string; arch: string; release: string; totalMem: number; freeMem: number; cpus: number }>;
      openExternal(url: string): Promise<void>;
      pickDirectory(): Promise<string | null>;
      listAccounts(): Promise<LiteAccount[]>;
      activeAccount(): Promise<LiteAccount | null>;
      setActiveAccount(id: string): Promise<void>;
      signInOffline(username: string): Promise<unknown>;
      startDeviceFlow(): Promise<DeviceFlow>;
      pollDeviceFlow(deviceCode: string): Promise<unknown>;
      cancelDeviceFlow(deviceCode?: string): Promise<void>;
      getMsClientId(): Promise<string>;
      setMsClientId(id: string): Promise<string>;
      signInElyby(username: string, password: string): Promise<unknown>;
      removeAccount(id: string): Promise<void>;
      getInstances(): Promise<Instance[]>;
      createInstance(input: CreateInstanceInput): Promise<Instance>;
      deleteInstance(id: string): Promise<void>;
      getVersions(filter?: 'release' | 'snapshot' | 'all'): Promise<string[]>;
      launch(opts: { instanceId: string; version?: string }): Promise<{ pid?: number }>;
      cancelLaunch(): Promise<void>;
      onLaunchProgress(cb: (p: { percent: number; task: string }) => void): () => void;
      getMods(instanceId: string): Promise<InstalledModItem[]>;
      searchMods(query: string, mcVersion?: string): Promise<ModSearchResult[]>;
      installMod(instanceId: string, slug: string, mcVersion?: string): Promise<{ file: string; version: string }>;
      toggleMod(instanceId: string, slug: string | boolean, enabled?: boolean): Promise<void>;
      removeMod(instanceId: string, slug: string): Promise<void>;
      setModVersion(id?: string, version?: string): Promise<void>;
      ensureJava(mcVersion?: string, major?: 17 | 21): Promise<{ path: string; major: 17 | 21 }>;
      diagnoseNetwork(): Promise<Array<{ name: string; host: string; ok: boolean; ms: number; detail: string; hint: string }>>;
      onJavaProgress(cb: (p: { message: string }) => void): () => void;
      onUpdater(channel: UpdaterChannel, cb: (payload?: unknown) => void): () => void;
      getSettings(): Promise<ClientSettings>;
      saveSettings(s: ClientSettings): Promise<void>;
      browseJava(): Promise<string | null>;
      getCosmetics(): Promise<Cosmetic[]>;
      equipCosmetic(id: string): Promise<void>;
      checkForUpdates(): Promise<unknown>;
      quitAndInstall(): Promise<void>;
    };
  }
}
export {};
