export interface Instance {
  id: string;
  name: string;
  version: string;
  loader?: string;
  lastPlayed?: number;
  icon?: string;
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
export interface DeviceFlow {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  qrDataUrl?: string;
  sessionId: string;
}
export interface Cosmetic {
  id: string;
  name: string;
  category: string;
  previewGradient: string;
  emoji: string;
  equipped: boolean;
}
declare global {
  interface Window {
    gooner: {
      getInstances(): Promise<Instance[]>;
      getVersions(): Promise<string[]>;
      launch(opts: { instanceId: string; version: string }): Promise<void>;
      cancelLaunch(): Promise<void>;
      onLaunchProgress(cb: (p: { percent: number; task: string }) => void): () => void;
      getMods(instanceId?: string): Promise<ModInfo[]>;
      searchMods(query?: string): Promise<ModInfo[]>;
      toggleMod(id?: string, enabled?: boolean): Promise<void>;
      setModVersion(id?: string, version?: string): Promise<void>;
      getSettings(): Promise<ClientSettings>;
      saveSettings(s: ClientSettings): Promise<void>;
      browseJava(): Promise<string | null>;
      getCosmetics(): Promise<Cosmetic[]>;
      equipCosmetic(id: string): Promise<void>;
      startDeviceFlow(): Promise<DeviceFlow>;
      cancelDeviceFlow(sessionId?: string): Promise<void>;
      signInBrowser(): Promise<unknown>;
      signInOffline(username: string): Promise<unknown>;
      signInElyby(username: string, password: string): Promise<unknown>;
      signInCustom(server: string, username: string, password: string): Promise<void>;
    };
  }
}
export {};
