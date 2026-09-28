/*
 * Gooner Client — launcher/discord.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Discord Rich Presence stub. Lazily requires 'discord-rpc' so the launcher
 * runs fine without it installed; all methods are safe no-ops when disabled
 * or when the module / Discord client is unavailable.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface PresenceOpts {
  details?: string;
  state?: string;
  startTimestamp?: number;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
}

// TODO: replace with the real Gooner Client application id from the Discord dev portal.
export const DISCORD_CLIENT_ID = '000000000000000000';

type RpcClient = {
  login: (opts: { clientId: string }) => Promise<void>;
  setActivity: (a: Record<string, unknown>) => Promise<void> | void;
  clearActivity: () => Promise<void> | void;
  destroy: () => Promise<void> | void;
  on: (ev: string, cb: (...a: never[]) => void) => void;
};

let client: RpcClient | null = null;
let connected = false;
let enabled = true;
let pending: PresenceOpts | null = null;

function tryRequire(): (new () => RpcClient) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('discord-rpc') as { Client?: new () => RpcClient };
    return mod.Client ?? null;
  } catch {
    return null;
  }
}

export function setRpcEnabled(v: boolean): void {
  enabled = v;
  if (!v) void shutdownRpc();
}

export async function connectRpc(clientId = DISCORD_CLIENT_ID): Promise<boolean> {
  if (!enabled || connected) return connected;
  const Ctor = tryRequire();
  if (!Ctor) return false; // discord-rpc not installed — silent no-op
  try {
    client = new Ctor() as RpcClient;
    await client.login({ clientId });
    connected = true;
    if (pending) await setActivity(pending);
    return true;
  } catch {
    client = null;
    connected = false;
    return false;
  }
}

export async function setActivity(opts: PresenceOpts): Promise<void> {
  pending = opts;
  if (!enabled || !connected || !client) return;
  try {
    await client.setActivity({
      details: opts.details ?? 'Gooner Client',
      state: opts.state ?? 'In the launcher',
      startTimestamp: opts.startTimestamp ?? Date.now(),
      largeImageKey: opts.largeImageKey ?? 'gooner',
      largeImageText: opts.largeImageText ?? 'Gooner Client',
      smallImageKey: opts.smallImageKey,
      smallImageText: opts.smallImageText,
      instance: false,
    });
  } catch { /* Discord closed — ignore */ }
}

export const setPlayingActivity = (instanceName: string, mcVersion: string): Promise<void> =>
  setActivity({ details: `Playing ${mcVersion}`, state: instanceName });

export const setLauncherActivity = (): Promise<void> =>
  setActivity({ details: 'Gooner Client', state: 'In the launcher' });

export async function clearActivity(): Promise<void> {
  pending = null;
  if (!client || !connected) return;
  try {
    await client.clearActivity();
  } catch { /* ignore */ }
}

export async function shutdownRpc(): Promise<void> {
  pending = null;
  if (!client) {
    connected = false;
    return;
  }
  try {
    await client.destroy();
  } catch { /* ignore */ } finally {
    client = null;
    connected = false;
  }
}

export const isRpcConnected = (): boolean => connected;
