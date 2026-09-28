// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/minecraftChain.ts
import {
  AuthError, xerrToAuthError,
  MC_ENTITLEMENTS_URL, MC_LOGIN_WITH_XBOX_URL, MC_PROFILE_URL, MS_TOKEN_URL,
  XBOX_USER_AUTH_URL, XSTS_AUTHORIZE_URL, XSTS_RELYING_PARTY_MINECRAFT,
  type MinecraftEntitlements, type MinecraftProfile, type MicrosoftTokens
} from './types.js';

const UA = 'GoonerClient/1.0 (+macOS)';

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; json: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
    signal
  });
  const text = await res.text();
  let json: T;
  try { json = (text ? JSON.parse(text) : {}) as T; }
  catch (e) { throw new AuthError('NETWORK_ERROR', `Invalid JSON from ${url} (HTTP ${res.status})`, { status: res.status, cause: e }); }
  if (!res.ok) {
    const err = new AuthError('NETWORK_ERROR', `HTTP ${res.status} from ${url}`, { status: res.status, cause: json });
    (err as unknown as { payload: unknown }).payload = json;
    throw err;
  }
  return { status: res.status, json };
}

async function getJson<T>(url: string, bearer: string, signal?: AbortSignal): Promise<{ status: number; json: T }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json', 'User-Agent': UA },
    signal
  });
  const text = await res.text();
  let json: T;
  try { json = (text ? JSON.parse(text) : {}) as T; }
  catch (e) { throw new AuthError('NETWORK_ERROR', `Invalid JSON from ${url} (HTTP ${res.status})`, { status: res.status, cause: e }); }
  if (!res.ok) {
    const err = new AuthError('NETWORK_ERROR', `HTTP ${res.status} from ${url}`, { status: res.status, cause: json });
    (err as unknown as { payload: unknown }).payload = json;
    throw err;
  }
  return { status: res.status, json };
}

export async function xboxLiveAuthenticate(msAccessToken: string, signal?: AbortSignal) {
  const { json } = await postJson<{ Token?: string; DisplayClaims?: { xui?: Array<{ uhs?: string }> } }>(
    XBOX_USER_AUTH_URL,
    { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' },
    signal
  );
  if (!json.Token || !json.DisplayClaims?.xui?.[0]?.uhs) throw new AuthError('XBOX_AUTH_FAILED', 'XboxLive returned no token/uhs.');
  return { token: json.Token, userHash: json.DisplayClaims.xui[0].uhs! };
}

export async function xstsAuthorize(xblToken: string, signal?: AbortSignal) {
  try {
    const { json } = await postJson<{ Token?: string; DisplayClaims?: { xui?: Array<{ uhs?: string }> }; XErr?: number; Message?: string }>(
      XSTS_AUTHORIZE_URL,
      { Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] }, RelyingParty: XSTS_RELYING_PARTY_MINECRAFT, TokenType: 'JWT' },
      signal
    );
    if (json.XErr) throw xerrToAuthError(Number(json.XErr), json.Message);
    if (!json.Token || !json.DisplayClaims?.xui?.[0]?.uhs) throw new AuthError('XSTS_FAILED', 'XSTS returned no token/uhs.');
    return { token: json.Token, userHash: json.DisplayClaims.xui[0].uhs! };
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) {
      const payload = (e as unknown as { payload?: { XErr?: number; Message?: string } }).payload ?? (e.cause as { XErr?: number; Message?: string });
      const xerr = Number(payload?.XErr);
      if (Number.isFinite(xerr) && xerr > 0) throw xerrToAuthError(xerr, payload?.Message);
      throw new AuthError('XSTS_FAILED', `XSTS authorize failed (HTTP 401)`, { status: 401, cause: payload });
    }
    throw e;
  }
}

export async function loginWithXbox(userHash: string, xstsToken: string, signal?: AbortSignal) {
  try {
    const { json } = await postJson<{ access_token?: string; expires_in?: number }>(
      MC_LOGIN_WITH_XBOX_URL, { identityToken: `XBL3.0 x=${userHash};${xstsToken}` }, signal);
    if (!json.access_token) throw new AuthError('MC_INVALID_APP_REGISTRATION', 'login_with_xbox returned no access_token.');
    return { accessToken: json.access_token, expiresIn: json.expires_in ?? 86400 };
  } catch (e) {
    if (e instanceof AuthError && e.status === 403) {
      throw new AuthError('MC_INVALID_APP_REGISTRATION', '403 from login_with_xbox: invalid app registration. Use a whitelisted client ID or request Minecraft API approval.', { status: 403, cause: e.cause });
    }
    throw e;
  }
}

export async function fetchMinecraftEntitlements(mcAccessToken: string, signal?: AbortSignal): Promise<MinecraftEntitlements> {
  const { json } = await getJson<MinecraftEntitlements>(MC_ENTITLEMENTS_URL, mcAccessToken, signal);
  return { items: Array.isArray(json.items) ? json.items : [] };
}

export function hasMinecraftOwnership(ent: MinecraftEntitlements): boolean {
  return Array.isArray(ent.items) && ent.items.length > 0;
}

export async function fetchMinecraftProfile(mcAccessToken: string, signal?: AbortSignal): Promise<MinecraftProfile> {
  try {
    const { json } = await getJson<MinecraftProfile>(MC_PROFILE_URL, mcAccessToken, signal);
    if (!json.id || !json.name) throw new AuthError('MC_PROFILE_FAILED', 'Minecraft profile missing id/name.');
    return json;
  } catch (e) {
    if (e instanceof AuthError && e.status === 404) throw new AuthError('MC_NOT_OWNED', 'No Minecraft profile (404): account does not own Minecraft Java.', { status: 404 });
    throw e;
  }
}

export async function refreshMicrosoftToken(refreshToken: string, clientId: string, signal?: AbortSignal): Promise<MicrosoftTokens> {
  const params = new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken });
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
    body: params.toString(), signal
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new AuthError('TOKEN_REFRESH_FAILED', `Microsoft refresh failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`, { status: res.status, cause: json });
  const expiresIn = json.expires_in ?? 3600;
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? refreshToken, expiresIn, expiresAt: Date.now() + expiresIn * 1000, tokenType: json.token_type ?? 'Bearer', scope: json.scope ?? '' };
}

export async function microsoftToMinecraft(msAccessToken: string, opts: { signal?: AbortSignal; allowNoOwnership?: boolean } = {}) {
  const { token: xblToken, userHash: xblUserHash } = await xboxLiveAuthenticate(msAccessToken, opts.signal);
  const { token: xstsToken, userHash: xstsUserHash } = await xstsAuthorize(xblToken, opts.signal);
  const { accessToken: mcAccessToken, expiresIn } = await loginWithXbox(xstsUserHash, xstsToken, opts.signal);
  const entitlements = await fetchMinecraftEntitlements(mcAccessToken, opts.signal);
  const ownsMinecraft = hasMinecraftOwnership(entitlements);
  if (!ownsMinecraft && !opts.allowNoOwnership) throw new AuthError('MC_NOT_OWNED', 'Account does not own Minecraft Java.', { cause: entitlements });
  const profile = await fetchMinecraftProfile(mcAccessToken, opts.signal);
  return { xblToken, xblUserHash, xstsToken, xstsUserHash, mcAccessToken, mcExpiresAt: Date.now() + expiresIn * 1000, entitlements, ownsMinecraft, profile };
}
