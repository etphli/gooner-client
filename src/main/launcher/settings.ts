/*
 * Gooner Client — launcher/settings.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type ThemeName = 'system' | 'dark' | 'light' | 'gooner';

export interface GoonerSettings {
  /** Max heap in MB (maps to -Xmx). */
  maxRamMb: number;
  /** Initial heap in MB (maps to -Xms). */
  minRamMb: number;
  /** Explicit java binary override. null = auto-provision Temurin. */
  javaPath: string | null;
  /** Pin JDK major, else auto by MC version (17/21). */
  javaMajorOverride: 17 | 21 | null;
  theme: ThemeName;
  /** Root data dir (instances, java, mods cache, settings live here). */
  dataDir: string;
  concurrentDownloads: number;
  closeOnLaunch: boolean;
  discordRpc: boolean;
  /** Active account id (auth:active:get/set). null = none selected. */
  activeAccountId: string | null;
}

export function getDefaultDataDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'GoonerClient');
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'GoonerClient');
  }
  return path.join(os.homedir(), '.local', 'share', 'GoonerClient');
}

function systemRamMb(): number {
  return Math.floor(os.totalmem() / 1024 / 1024);
}

export function defaultSettings(): GoonerSettings {
  const total = systemRamMb();
  // Sensible default: min(4096, 50% of RAM), clamped to [1024, 16384].
  const maxRamMb = Math.min(16384, Math.max(2048, Math.floor(total / 2)));
  return {
    maxRamMb: Math.min(maxRamMb, 4096),
    minRamMb: 512,
    javaPath: null,
    javaMajorOverride: null,
    theme: 'gooner',
    dataDir: getDefaultDataDir(),
    concurrentDownloads: 6,
    closeOnLaunch: false,
    discordRpc: true,
    activeAccountId: null,
  };
}

export function getSettingsPath(dataDir?: string): string {
  return path.join(dataDir ?? getDefaultDataDir(), 'settings.json');
}

function sanitize(input: Partial<GoonerSettings>, base: GoonerSettings): GoonerSettings {
  const total = systemRamMb();
  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.floor(n)));
  const maxHi = Math.max(1024, Math.min(65536, total - 512));
  const maxRamMb = clamp(input.maxRamMb ?? base.maxRamMb, 512, maxHi);
  const minRamMb = clamp(input.minRamMb ?? base.minRamMb, 256, maxRamMb);
  const theme: ThemeName =
    input.theme === 'dark' || input.theme === 'light' || input.theme === 'system' || input.theme === 'gooner'
      ? input.theme
      : base.theme;
  const rawActive = input.activeAccountId ?? base.activeAccountId;
  const activeAccountId = typeof rawActive === 'string' && rawActive.length > 0 ? rawActive : null;
  return {
    maxRamMb,
    minRamMb,
    javaPath: typeof input.javaPath === 'string' && input.javaPath.length > 0 ? input.javaPath : null,
    javaMajorOverride:
      input.javaMajorOverride === 17 || input.javaMajorOverride === 21 ? input.javaMajorOverride : null,
    theme,
    dataDir:
      typeof input.dataDir === 'string' && input.dataDir.length > 0 ? input.dataDir : base.dataDir,
    concurrentDownloads: clamp(input.concurrentDownloads ?? base.concurrentDownloads, 1, 16),
    closeOnLaunch: Boolean(input.closeOnLaunch ?? base.closeOnLaunch),
    discordRpc: input.discordRpc ?? base.discordRpc,
    activeAccountId,
  };
}

export async function loadSettings(dataDir?: string): Promise<GoonerSettings> {
  const base = defaultSettings();
  if (dataDir) base.dataDir = dataDir;
  try {
    const raw = await fs.readFile(getSettingsPath(base.dataDir), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GoonerSettings>;
    return sanitize(parsed, base);
  } catch {
    return base;
  }
}

export async function saveSettings(
  partial: Partial<GoonerSettings>,
  dataDir?: string,
): Promise<GoonerSettings> {
  const current = await loadSettings(dataDir);
  const next = sanitize({ ...current, ...partial }, current);
  const file = getSettingsPath(next.dataDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8');
  await fs.rename(tmp, file);
  return next;
}

/** -Xmx/-Xms flags derived from settings. */
export function ramJvmArgs(s: Pick<GoonerSettings, 'maxRamMb' | 'minRamMb'>): string[] {
  return [`-Xms${s.minRamMb}M`, `-Xmx${s.maxRamMb}M`];
}
