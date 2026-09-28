// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/elyby.ts (Way 4) + custom Yggdrasil (Way 5)
import { randomUUID } from 'node:crypto';
import { AuthError, ELY_BY_AUTH_BASE, addUuidDashes, type AuthAccount } from './types.js';

async function yggPost<T>(base: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; errorMessage?: string };
  if (!res.ok) throw new AuthError('ELYBY_AUTH_FAILED', `Yggdrasil ${path} failed (HTTP ${res.status}): ${json.errorMessage ?? json.error ?? 'unknown'}`, { status: res.status, cause: json });
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

export function normalizeYggdrasilBaseUrl(baseUrl: string): string {
  const t = baseUrl.trim().replace(/\/+$/g, '').slice(0, 2083);
  let u: URL;
  try { u = new URL(t); }
  catch { throw new AuthError('YGGDRASIL_AUTH_FAILED', `Invalid URL "${baseUrl}"`); }
  const host = u.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  if (u.protocol !== 'https:' && !isLoopback) throw new AuthError('YGGDRASIL_AUTH_FAILED', 'Custom server must use https:// (http allowed only for localhost).');
  return t;
}

export async function signInWithCustomYggdrasil(baseUrl: string, username: string, password: string, signal?: AbortSignal): Promise<AuthAccount> {
  const base = normalizeYggdrasilBaseUrl(baseUrl);
  if (!username || !password) throw new AuthError('YGGDRASIL_AUTH_FAILED', 'Username and password required.');
  const clientToken = randomUUID().replace(/-/g, '');
  let json: { accessToken: string; clientToken: string; selectedProfile?: { id: string; name: string } };
  try {
    const res = await fetch(`${base}/authenticate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, clientToken, requestUser: true, agent: { name: 'Minecraft', version: 1 } }), signal });
    json = (await res.json()) as typeof json & { errorMessage?: string; error?: string };
    if (!res.ok) throw new AuthError('YGGDRASIL_AUTH_FAILED', `Custom server failed (HTTP ${res.status}): ${(json as unknown as { errorMessage?: string }).errorMessage ?? 'unknown'}`, { status: res.status });
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('NETWORK_ERROR', `Custom auth network error: ${(e as Error)?.message}`, { cause: e });
  }
  if (!json.accessToken || !json.selectedProfile) throw new AuthError('YGGDRASIL_AUTH_FAILED', 'Server returned no token/profile.');
  const now = Date.now();
  return {
    id: randomUUID(), provider: 'yggdrasil-custom',
    minecraftUsername: json.selectedProfile.name, minecraftUuid: addUuidDashes(json.selectedProfile.id),
    yggdrasil: { serverUrl: base, accessToken: json.accessToken, clientToken: json.clientToken, serverName: 'Custom' },
    authlibInjector: { baseUrl: base, prefetchUuid: true },
    ownsMinecraft: true, createdAt: now, updatedAt: now
  };
}

export function authlibInjectorArgs(account: AuthAccount): string[] {
  if (!account.authlibInjector?.baseUrl) return [];
  return [`-javaagent:authlib-injector.jar=${account.authlibInjector.baseUrl}`];
}
