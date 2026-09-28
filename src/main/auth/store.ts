// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/store.ts (JSON file store; tokens chmod 0600, atomic write)
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultDataDir } from '../launcher/settings.js';
import { AuthError } from './types.js';
import type { AuthAccount } from './types.js';

function accountsPath(dataDir?: string): string {
  return path.join(dataDir ?? getDefaultDataDir(), 'accounts.json');
}

// Single-process mutex: main process is the only writer, so this prevents
// last-writer-wins races between concurrent save/remove calls.
let mu: Promise<void> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const cur = mu.then(fn);
  mu = cur.then(() => undefined, () => undefined);
  return cur;
}

export async function listAccounts(dataDir?: string): Promise<AuthAccount[]> {
  try {
    const raw = await fs.readFile(accountsPath(dataDir), 'utf-8');
    const parsed = JSON.parse(raw) as AuthAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    // Don't wipe corrupt data: back it up and surface the error.
    try { await fs.copyFile(accountsPath(dataDir), `${accountsPath(dataDir)}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    throw new AuthError('STORAGE_ERROR', 'accounts.json is corrupt (backup made).', { cause: e });
  }
}

async function writeAccounts(all: AuthAccount[], dataDir?: string): Promise<void> {
  const file = accountsPath(dataDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(all, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
}

export async function saveAccount(acc: AuthAccount, dataDir?: string): Promise<void> {
  return locked(async () => {
    const all = await listAccounts(dataDir);
    const idx = all.findIndex((a) => a.id === acc.id);
    if (idx === -1) all.push(acc);
    else all[idx] = acc;
    await writeAccounts(all, dataDir);
  });
}

export async function removeAccount(id: string, dataDir?: string): Promise<void> {
  return locked(async () => {
    await writeAccounts((await listAccounts(dataDir)).filter((a) => a.id !== id), dataDir);
  });
}

export async function getActiveAccount(activeId: string | null, dataDir?: string): Promise<AuthAccount | null> {
  const all = await listAccounts(dataDir);
  if (!all.length) return null;
  return all.find((a) => a.id === activeId) ?? all[0];
}
