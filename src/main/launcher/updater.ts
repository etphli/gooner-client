/*
 * Gooner Client — launcher/updater.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * electron-updater wrapper (macOS-first: zip target for Squirrel.Mac).
 * Forwards lifecycle events to the renderer via `updater:*` IPC channels.
 * Safe to import in dev (no-op when electron-updater is missing).
 */

import type { BrowserWindow } from 'electron';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterEvents {
  onStatus?: (s: UpdaterStatus, info?: string) => void;
}

let started = false;

function send(win: BrowserWindow | undefined, channel: string, ...args: unknown[]): void {
  try {
    win?.webContents.send(channel, ...args);
  } catch { /* window closed */ }
}

function requireAutoUpdater(): {
  autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    checkForUpdatesAndNotify: () => Promise<unknown>;
    checkForUpdates: () => Promise<unknown>;
    quitAndInstall: () => void;
    on: (ev: string, cb: (...a: unknown[]) => void) => void;
  };
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('electron-updater') as unknown as NonNullable<ReturnType<typeof requireAutoUpdater>>;
  } catch {
    return null;
  }
}

/**
 * Wire auto-updates. Call once from app.whenReady() in the main process.
 * Skips silently in dev (`!app.isPackaged`) unless `force` is set.
 */
export function initUpdater(win?: BrowserWindow, events: UpdaterEvents = {}, force = false): void {
  if (started) return;
  started = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  const set = (s: UpdaterStatus, info?: string) => {
    events.onStatus?.(s, info);
    send(win, 'updater:status', s, info);
  };

  if (!app.isPackaged && !force) {
    set('idle', 'dev — updater disabled');
    return;
  }
  const mod = requireAutoUpdater();
  if (!mod) {
    set('idle', 'electron-updater not installed');
    return;
  }
  const { autoUpdater } = mod;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => set('checking'));
  autoUpdater.on('update-available', (info: unknown) => {
    const v = (info as { version?: string } | undefined)?.version;
    set('available', v);
    send(win, 'updater:available', info);
  });
  autoUpdater.on('update-not-available', () => set('not-available'));
  autoUpdater.on('download-progress', (p: unknown) => send(win, 'updater:progress', p));
  autoUpdater.on('update-downloaded', (info: unknown) => {
    set('downloaded');
    send(win, 'updater:downloaded', info);
  });
  autoUpdater.on('error', (err: unknown) =>
    set('error', err instanceof Error ? err.message : String(err))
  );

  set('checking');
  void autoUpdater.checkForUpdatesAndNotify().catch((e: unknown) =>
    set('error', e instanceof Error ? e.message : String(e)),
  );
}

export async function checkForUpdates(): Promise<unknown> {
  const mod = requireAutoUpdater();
  if (!mod) throw new Error('electron-updater not installed');
  return mod.autoUpdater.checkForUpdates();
}

export function quitAndInstall(): void {
  const mod = requireAutoUpdater();
  mod?.autoUpdater.quitAndInstall();
}
