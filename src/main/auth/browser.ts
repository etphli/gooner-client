// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/browser.ts (Way 2: system browser + PKCE localhost)
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import { AuthError, DEFAULT_MS_CLIENT_ID, DEFAULT_MS_SCOPES, MS_AUTHORIZE_URL, MS_TOKEN_URL, addUuidDashes, type AuthAccount, type MicrosoftTokens } from './types.js';
import { microsoftToMinecraft } from './minecraftChain.js';

function base64Url(b: Buffer): string { return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
export function createPkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, state: base64Url(randomBytes(16)) };
}

export function buildMicrosoftAuthUrl(opts: { clientId?: string; scopes?: readonly string[]; redirectUri: string; pkce: { challenge: string; state: string } }): string {
  const q = new URLSearchParams({
    client_id: opts.clientId ?? DEFAULT_MS_CLIENT_ID,
    response_type: 'code', redirect_uri: opts.redirectUri,
    scope: [...(opts.scopes ?? DEFAULT_MS_SCOPES)].join(' '),
    state: opts.pkce.state, code_challenge: opts.pkce.challenge, code_challenge_method: 'S256', prompt: 'select_account'
  });
  return `${MS_AUTHORIZE_URL}?${q.toString()}`;
}

export async function exchangeAuthCodeForToken(opts: { code: string; verifier: string; redirectUri: string; clientId?: string; signal?: AbortSignal }): Promise<MicrosoftTokens> {
  const params = new URLSearchParams({ client_id: opts.clientId ?? DEFAULT_MS_CLIENT_ID, grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.redirectUri, code_verifier: opts.verifier });
  const res = await fetch(MS_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: params.toString(), signal: opts.signal });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token || !json.refresh_token) throw new AuthError('MICROSOFT_TOKEN_EXCHANGE_FAILED', `Code exchange failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`, { status: res.status, cause: json });
  const expiresIn = json.expires_in ?? 3600;
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn, expiresAt: Date.now() + expiresIn * 1000, tokenType: json.token_type ?? 'Bearer', scope: json.scope ?? '' };
}

export async function signInWithBrowser(opts: { clientId?: string; port?: number; timeoutMs?: number; signal?: AbortSignal; allowNoOwnership?: boolean; openUrl?: (url: string) => void | Promise<void> } = {}): Promise<{ account: AuthAccount; microsoft: MicrosoftTokens }> {
  const clientId = opts.clientId ?? DEFAULT_MS_CLIENT_ID;
  const pkce = createPkcePair();
  const path = '/callback';
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let server: Server | undefined;
    let settled = false;
    const timer = setTimeout(() => cleanup(new AuthError('MICROSOFT_TOKEN_EXCHANGE_FAILED', 'Browser sign-in timed out.')), opts.timeoutMs ?? 10 * 60 * 1000);
    const cleanup = (err?: unknown, result?: { code: string; redirectUri: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      setTimeout(() => server?.close(() => undefined), 100);
      if (err) reject(err);
      else if (result) resolve(result);
    };
    const onAbort = () => cleanup(new AuthError('ABORTED', 'Browser sign-in aborted.'));
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    server = createServer((req, res) => {
      try {
        const remote = req.socket.remoteAddress ?? '';
        if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') { res.writeHead(403).end('Forbidden.'); return; }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== path) { res.writeHead(404).end('Not found.'); return; }
        const err = url.searchParams.get('error');
        if (err) { res.writeHead(400, { 'Content-Type': 'text/html' }).end('<h1>Sign-in failed</h1>'); cleanup(new AuthError('MICROSOFT_ACCESS_DENIED', `Browser failed: ${url.searchParams.get('error_description') ?? err}`)); return; }
        const c = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!c || state !== pkce.state) { res.writeHead(400).end('Invalid callback.'); cleanup(new AuthError('MICROSOFT_TOKEN_EXCHANGE_FAILED', 'State mismatch (possible CSRF).')); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Signed in</h1><p>Close this tab and return to Gooner Client.</p>');
        const address = server?.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        cleanup(undefined, { code: c, redirectUri: `http://127.0.0.1:${port}${path}` });
      } catch (e) { cleanup(e); }
    });
    server.on('error', (e) => cleanup(new AuthError('NETWORK_ERROR', `Localhost bind failed: ${(e as Error).message}`, { cause: e })));
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const address = server?.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}${path}`;
      const url = buildMicrosoftAuthUrl({ clientId, redirectUri, pkce });
      if (opts.openUrl) void Promise.resolve(opts.openUrl(url)).catch(cleanup);
      else shell.openExternal(url).catch(() => cleanup(new AuthError('UNKNOWN', `Open manually:\n${url}`)));
    });
  });
  const microsoft = await exchangeAuthCodeForToken({ code, verifier: pkce.verifier, redirectUri, clientId, signal: opts.signal });
  const chain = await microsoftToMinecraft(microsoft.accessToken, { signal: opts.signal, allowNoOwnership: opts.allowNoOwnership });
  const now = Date.now();
  const account: AuthAccount = {
    id: randomUUID(), provider: 'microsoft-browser',
    minecraftUsername: chain.profile.name, minecraftUuid: addUuidDashes(chain.profile.id),
    microsoft, xbox: { xblToken: chain.xblToken, xblUserHash: chain.xblUserHash, xstsToken: chain.xstsToken, xstsUserHash: chain.xstsUserHash },
    minecraft: { accessToken: chain.mcAccessToken, expiresAt: chain.mcExpiresAt, ownsMinecraft: chain.ownsMinecraft },
    profile: chain.profile, ownsMinecraft: chain.ownsMinecraft, createdAt: now, updatedAt: now
  };
  return { account, microsoft };
}
