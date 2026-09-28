/*
 * Gooner Client — launcher/instances.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * JSON-backed instance store (no native SQLite dep — painless on macOS arm64).
 * Store file: <dataDir>/instances.json
 * Instance content: <dataDir>/instances/<id>/ (gameDir, mods/, config/…)
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultDataDir } from './settings.js';

export type ModLoader = 'vanilla' | 'fabric';

export interface GoonerInstance {
  id: string;
  name: string;
  mcVersion: string;
  modLoader: ModLoader;
  loaderVersion: string | null;
  /** Per-mod enable overrides (slug -> enabled). */
  modsEnabled: Record<string, boolean>;
  ramOverrideMb: number | null;
  createdAt: string;
  lastPlayedAt: string | null;
  icon: string | null;
}

export interface CreateInstanceInput {
  name: string;
  mcVersion: string;
  modLoader?: ModLoader;
  loaderVersion?: string | null;
  modsEnabled?: Record<string, boolean>;
  ramOverrideMb?: number | null;
  icon?: string | null;
}

function storePath(dataDir?: string): string {
  return path.join(dataDir ?? getDefaultDataDir(), 'instances.json');
}

export function getInstanceDir(id: string, dataDir?: string): string {
  assertValidId(id);
  return path.join(dataDir ?? getDefaultDataDir(), 'instances', id);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
function assertValidId(id: string): void {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error(`Invalid instance id: ${id}`);
}

let mu: Promise<void> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const cur = mu.then(fn);
  mu = cur.then(() => undefined, () => undefined);
  return cur;
}

async function readAll(dataDir?: string): Promise<GoonerInstance[]> {
  try {
    const raw = await fs.readFile(storePath(dataDir), 'utf-8');
    const parsed = JSON.parse(raw) as GoonerInstance[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    try { await fs.copyFile(storePath(dataDir), `${storePath(dataDir)}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    throw new Error('instances.json is corrupt (backup made).');
  }
}

async function writeAll(instances: GoonerInstance[], dataDir?: string): Promise<void> {
  const file = storePath(dataDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(instances, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function listInstances(dataDir?: string): Promise<GoonerInstance[]> {
  const all = await readAll(dataDir);
  return all.sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''));
}

export async function getInstance(id: string, dataDir?: string): Promise<GoonerInstance | null> {
  const all = await readAll(dataDir);
  return all.find((i) => i.id === id) ?? null;
}

export async function createInstance(input: CreateInstanceInput, dataDir?: string): Promise<GoonerInstance> {
  return locked(async () => {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 64) || 'New Instance' : 'New Instance';
    if (typeof input.mcVersion !== 'string' || !/^[0-9a-z._-]+$/i.test(input.mcVersion)) throw new Error(`Invalid mcVersion: ${input.mcVersion}`);
    const modLoader = input.modLoader ?? 'fabric';
    if (modLoader !== 'vanilla' && modLoader !== 'fabric') throw new Error(`Invalid modLoader: ${modLoader}`);
    const now = new Date().toISOString();
    const inst: GoonerInstance = {
      id: randomUUID(),
      name,
      mcVersion: input.mcVersion,
      modLoader,
      loaderVersion: typeof input.loaderVersion === 'string' ? input.loaderVersion.slice(0, 32) : null,
      modsEnabled: typeof input.modsEnabled === 'object' && input.modsEnabled ? input.modsEnabled : {},
      ramOverrideMb: typeof input.ramOverrideMb === 'number' && Number.isFinite(input.ramOverrideMb) ? Math.min(65536, Math.max(512, Math.floor(input.ramOverrideMb))) : null,
      createdAt: now,
      lastPlayedAt: null,
      icon: typeof input.icon === 'string' ? input.icon.slice(0, 32) : null
    };
    const all = await readAll(dataDir);
    all.push(inst);
    await writeAll(all, dataDir);
    await fs.mkdir(getInstanceDir(inst.id, dataDir), { recursive: true });
    return inst;
  });
}

export async function updateInstance(
  id: string,
  patch: Partial<Omit<GoonerInstance, 'id' | 'createdAt'>>,
  dataDir?: string
): Promise<GoonerInstance> {
  assertValidId(id);
  return locked(async () => {
    const all = await readAll(dataDir);
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Instance not found: ${id}`);
    const { id: _drop, createdAt: _drop2, ...safe } = patch as Record<string, unknown>;
    void _drop; void _drop2;
    all[idx] = { ...all[idx], ...safe, id };
    await writeAll(all, dataDir);
    return all[idx];
  });
}

export async function markPlayed(id: string, dataDir?: string): Promise<void> {
  assertValidId(id);
  await updateInstance(id, { lastPlayedAt: new Date().toISOString() }, dataDir);
}

export async function deleteInstance(id: string, dataDir?: string, deleteFiles = true): Promise<void> {
  assertValidId(id);
  return locked(async () => {
    const all = await readAll(dataDir);
    await writeAll(
      all.filter((i) => i.id !== id),
      dataDir
    );
    if (deleteFiles) {
      await fs.rm(getInstanceDir(id, dataDir), { recursive: true, force: true });
    }
  });
}
