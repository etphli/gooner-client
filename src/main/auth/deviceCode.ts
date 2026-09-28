// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/deviceCode.ts (Way 1: link on another device)
import { randomUUID } from 'node:crypto';
import { AuthError, DEFAULT_MS_CLIENT_ID, DEFAULT_MS_SCOPES, MS_DEVICE_CODE_URL, MS_TOKEN_URL, addUuidDashes, type AuthAccount, type DeviceCodeInfo, type MicrosoftTokens } from './types.js';
import { microsoftToMinecraft } from './minecraftChain.js';
import { fetchJson, fetchWithRetry } from '../net.js';

export async function requestDeviceCode(clientId = DEFAULT_MS_CLIENT_ID, scopes: readonly string[] = DEFAULT_MS_SCOPES, signal?: AbortSignal): Promise<DeviceCodeInfo> {
  const params = new URLSearchParams({ client_id: clientId, scope: [...scopes].join(' ') });
  const { json } = await fetchJson<{ user_code?: string; device_code?: string; verification_uri?: string; verification_uri_complete?: string; expires_in?: number; interval?: number; message?: string; error_description?: string; error?: string }>(
    MS_DEVICE_CODE_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: params.toString() },
    { label: 'Microsoft sign-in', timeoutMs: 20000, retries: 2, signal },
  ).catch((e: unknown) => {
    if (e instanceof AuthError && e.code === 'MICROSOFT_TOKEN_EXCHANGE_FAILED') throw e;
    if (e instanceof AuthError) {
      throw new AuthError('MICROSOFT_TOKEN_EXCHANGE_FAILED', `Could not reach Microsoft sign-in (${e.message})`, { status: e.status, cause: e.cause });
    }
    throw e;
  });
  if (!json.device_code || !json.user_code) throw new AuthError('MICROSOFT_TOKEN_EXCHANGE_FAILED', `devicecode failed: ${json.error_description ?? json.error ?? 'unknown response'}`);
  return { userCode: json.user_code, deviceCode: json.device_code, verificationUri: json.verification_uri ?? 'https://www.microsoft.com/link', verificationUriComplete: json.verification_uri_complete, expiresIn: json.expires_in ?? 900, interval: json.interval ?? 5, message: json.message };
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new AuthError('ABORTED', 'Device polling aborted.'));
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(t); reject(new AuthError('ABORTED', 'Device polling aborted.')); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function pollDeviceCodeForToken(info: DeviceCodeInfo, opts: { clientId?: string; signal?: AbortSignal; onPending?: (e: { elapsedSec: number; nextPollInSec: number }) => void } = {}): Promise<MicrosoftTokens> {
  const clientId = opts.clientId ?? DEFAULT_MS_CLIENT_ID;
  const deadline = Date.now() + info.expiresIn * 1000;
  let intervalSec = Math.max(5, info.interval);
  const started = Date.now();
  for (;;) {
    if (opts.signal?.aborted) throw new AuthError('ABORTED', 'Device polling aborted.');
    if (Date.now() >= deadline) throw new AuthError('MICROSOFT_DEVICE_EXPIRED', 'Device code expired. Restart sign-in.');
    opts.onPending?.({ elapsedSec: Math.floor((Date.now() - started) / 1000), nextPollInSec: intervalSec });
    const params = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: info.deviceCode });
    let raw: { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error?: string; error_description?: string };
    try {
      // No retries here — the loop itself retries every interval until expiry.
      const res = await fetchWithRetry(
        MS_TOKEN_URL,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: params.toString() },
        { label: 'Microsoft sign-in', timeoutMs: 25000, retries: 0, signal: opts.signal },
      );
      raw = (await res.json()) as typeof raw;
    } catch (e) {
      if (e instanceof AuthError && e.code === 'ABORTED') throw e;
      // Transient network failure mid-poll: wait out the interval and try again.
      await sleep(intervalSec * 1000, opts.signal);
      continue;
    }
    if (raw.access_token && raw.refresh_token) {
      const expiresIn = raw.expires_in ?? 3600;
      return { accessToken: raw.access_token, refreshToken: raw.refresh_token, expiresIn, expiresAt: Date.now() + expiresIn * 1000, tokenType: raw.token_type ?? 'Bearer', scope: raw.scope ?? '' };
    }
    switch (raw.error) {
      case 'authorization_pending': await sleep(intervalSec * 1000, opts.signal); continue;
      case 'slow_down': intervalSec += 5; await sleep(intervalSec * 1000, opts.signal); continue;
      case 'expired_token': throw new AuthError('MICROSOFT_DEVICE_EXPIRED', 'Device code expired (expired_token).');
      case 'access_denied': throw new AuthError('MICROSOFT_ACCESS_DENIED', 'Sign-in denied on microsoft.com/link.');
      default: throw new AuthError('MICROSOFT_TOKEN_EXCHANGE_FAILED', `Device polling failed: ${raw.error_description ?? raw.error ?? 'unknown'}`, { cause: raw });
    }
  }
}

export async function signInWithDeviceCode(onDeviceCode: (info: DeviceCodeInfo) => void | Promise<void>, opts: { clientId?: string; signal?: AbortSignal; allowNoOwnership?: boolean } = {}): Promise<{ account: AuthAccount; microsoft: MicrosoftTokens }> {
  const clientId = opts.clientId ?? DEFAULT_MS_CLIENT_ID;
  const info = await requestDeviceCode(clientId, DEFAULT_MS_SCOPES, opts.signal);
  await onDeviceCode(info);
  const microsoft = await pollDeviceCodeForToken(info, { clientId, signal: opts.signal });
  const chain = await microsoftToMinecraft(microsoft.accessToken, { signal: opts.signal, allowNoOwnership: opts.allowNoOwnership });
  const now = Date.now();
  const account: AuthAccount = {
    id: randomUUID(), provider: 'microsoft-device',
    minecraftUsername: chain.profile.name, minecraftUuid: addUuidDashes(chain.profile.id),
    microsoft, xbox: { xblToken: chain.xblToken, xblUserHash: chain.xblUserHash, xstsToken: chain.xstsToken, xstsUserHash: chain.xstsUserHash },
    minecraft: { accessToken: chain.mcAccessToken, expiresAt: chain.mcExpiresAt, ownsMinecraft: chain.ownsMinecraft },
    profile: chain.profile, ownsMinecraft: chain.ownsMinecraft, createdAt: now, updatedAt: now
  };
  return { account, microsoft };
}
