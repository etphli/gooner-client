// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/elyby.ts (Ely.by sign-in)
import { randomUUID } from 'node:crypto';
import { AuthError, ELY_BY_AUTH_BASE, addUuidDashes, type AuthAccount } from './types.js';
import { fetchJson } from '../net.js';

async function yggPost<T>(base: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const { json } = await fetchJson<T & { error?: string; errorMessage?: string }>(
    `${base}${path}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) },
    { label: 'Ely.by auth', timeoutMs: 20000, retries: 2, signal },
  ).catch((e: unknown) => {
    if (e instanceof AuthError && e.status !== undefined) {
      const payload = (e as unknown as { payload?: { error?: string; errorMessage?: string } }).payload ?? {};
      throw new AuthError('ELYBY_AUTH_FAILED', `Ely.by ${path} failed (HTTP ${e.status}): ${payload.errorMessage ?? payload.error ?? e.message}`, {
        status: e.status,
        cause: e.cause,
      });
    }
    throw e;
  });
  return json;
}

export async function signInWithElyBy(username: string, password: string, signal?: AbortSignal): Promise<AuthAccount> {
  if (!username || !password) throw new AuthError('ELYBY_AUTH_FAILED', 'Ely.by username and password required.');
  const clientToken = randomUUID().replace(/-/g, '');
  const json = await yggPost<{ accessToken: string; clientToken: string; selectedProfile?: { id: string; name: string } }>(
    ELY_BY_AUTH_BASE, '/authenticate',
    { username, password, clientToken, requestUser: true, agent: { name: 'Minecraft', version: 1 } }, signal);
  if (!json.accessToken || !json.selectedProfile) throw new AuthError('ELYBY_AUTH_FAILED', 'Ely.by returned no token/profile.', { cause: json });
  const now = Date.now();
  return {
    id: randomUUID(), provider: 'elyby',
    minecraftUsername: json.selectedProfile.name, minecraftUuid: addUuidDashes(json.selectedProfile.id),
    yggdrasil: { serverUrl: 'https://authserver.ely.by', accessToken: json.accessToken, clientToken: json.clientToken, serverName: 'Ely.by' },
    authlibInjector: { baseUrl: 'https://authserver.ely.by', prefetchUuid: true },
    ownsMinecraft: true, createdAt: now, updatedAt: now
  };
}

export function authlibInjectorArgs(account: AuthAccount): string[] {
  if (!account.authlibInjector?.baseUrl) return [];
  return [`-javaagent:authlib-injector.jar=${account.authlibInjector.baseUrl}`];
}
