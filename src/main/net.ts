// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — main/net.ts
// Shared fetch hardening: per-request timeouts, retries with backoff, and
// network errors translated into actionable AuthError messages (with the
// underlying cause code like ENOTFOUND/ECONNREFUSED/CERT preserved).
// Without this, any connectivity blip surfaces as bare "TypeError: fetch failed".
//
// Proxy support (no traffic ever goes through a third-party VPN — that would
// hand Microsoft/Ely.by credentials to strangers and get logins flagged):
//   1. Manual proxy from Settings (http://host:port), when set.
//   2. Otherwise the OS-configured proxy via Electron session.resolveProxy.
//   3. Otherwise direct.
import { AuthError } from './auth/types.js';

export interface FetchRetryOpts {
  timeoutMs?: number;
  retries?: number;
  label?: string;
  signal?: AbortSignal;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Extract the actionable bit from undici/Node fetch failures. */
export function describeNetworkError(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } | unknown };
  if (err?.name === 'AbortError') return 'request timed out';
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  const code = typeof cause?.code === 'string' ? cause.code : undefined;
  if (code) {
    switch (code) {
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return `DNS lookup failed (${code}) — no network or DNS blocked`;
      case 'ECONNREFUSED':
        return `connection refused (${code})`;
      case 'ECONNRESET':
      case 'EPIPE':
        return `connection dropped (${code})`;
      case 'ETIMEDOUT':
      case 'UND_ERR_CONNECT_TIMEOUT':
        return `connection timed out (${code})`;
      case 'CERT_HAS_EXPIRED':
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
        return `TLS certificate problem (${code}) — check clock/VPN/proxy`;
      default:
        return code;
    }
  }
  return err?.message ?? String(e);
}

function combineSignals(user?: AbortSignal, timeoutMs?: number): { signal: AbortSignal | undefined; cancel: () => void } {
  if (timeoutMs === undefined || timeoutMs <= 0) return { signal: user, cancel: () => undefined };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
  if (!user) return { signal: ctl.signal, cancel: () => clearTimeout(t) };
  if (user.aborted) {
    clearTimeout(t);
    return { signal: user, cancel: () => undefined };
  }
  const onAbort = (): void => {
    clearTimeout(t);
    ctl.abort(user.reason);
  };
  user.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctl.signal,
    cancel: () => {
      clearTimeout(t);
      user.removeEventListener('abort', onAbort);
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- proxy resolution (cached) ----

interface ProxyCacheEntry {
  at: number;
  proxyUrl: string | null;
}
const proxyCache = new Map<string, ProxyCacheEntry>();
const PROXY_TTL_MS = 5 * 60_000;

function parseProxyResult(resolved: string): string | null {
  // Electron/Chromium format: "PROXY host:port; HTTPS host:port; DIRECT"
  for (const part of resolved.split(';')) {
    const t = part.trim().split(/\s+/);
    if (t.length === 2 && (t[0] === 'PROXY' || t[0] === 'HTTPS')) {
      const host = t[1];
      if (/^[\w.-]+:\d+$/.test(host)) return `http://${host}`;
    }
    if (t[0] === 'DIRECT') return null;
  }
  return null;
}

async function readManualProxy(): Promise<string | null> {
  try {
    const { loadSettings } = await import('./launcher/settings.js');
    const s = await loadSettings();
    const p = (s as { proxy?: string | null }).proxy;
    if (typeof p === 'string' && p.trim().length > 0) return p.trim();
  } catch {
    /* settings unreadable — fall through to OS proxy */
  }
  return null;
}

async function resolveProxyFor(url: string): Promise<string | null> {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  const hit = proxyCache.get(host);
  if (hit && Date.now() - hit.at < PROXY_TTL_MS) return hit.proxyUrl;
  let proxyUrl: string | null = null;
  try {
    proxyUrl = await readManualProxy();
    if (!proxyUrl) {
      const { session } = await import('electron');
      const resolved: string = await session.defaultSession.resolveProxy(url);
      proxyUrl = parseProxyResult(resolved);
    }
  } catch {
    proxyUrl = null;
  }
  proxyCache.set(host, { at: Date.now(), proxyUrl });
  return proxyUrl;
}

type DispatcherLike = unknown;

let proxyAgentCtor: (new (proxyUrl: string) => DispatcherLike) | null | undefined;
async function dispatcherFor(url: string): Promise<DispatcherLike | undefined> {
  let proxyUrl: string | null = null;
  try {
    proxyUrl = await resolveProxyFor(url);
  } catch {
    return undefined;
  }
  if (!proxyUrl) return undefined;
  try {
    if (proxyAgentCtor === undefined) {
      const mod = (await import('undici')) as { ProxyAgent?: new (u: string) => DispatcherLike };
      proxyAgentCtor = mod.ProxyAgent ?? null;
    }
    if (!proxyAgentCtor) return undefined;
    return new proxyAgentCtor(proxyUrl);
  } catch {
    return undefined;
  }
}

/**
 * fetch with timeout + retries. Throws AuthError NETWORK_ERROR with a
 * human-actionable message (never a bare TypeError).
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: FetchRetryOpts = {}): Promise<Response> {
  const { timeoutMs = 20000, retries = 0, label, signal: userSignal } = opts;
  const tag = label ?? hostOf(url);
  let last: unknown = null;
  const dispatcher = await dispatcherFor(url);
  for (let attempt = 0; ; attempt++) {
    if (userSignal?.aborted) throw new AuthError('ABORTED', `${tag}: cancelled.`);
    const { signal, cancel } = combineSignals(userSignal, timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: signal ?? undefined,
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit);
    } catch (e) {
      last = e;
      if ((e as Error)?.name === 'AbortError' && userSignal?.aborted) {
        throw new AuthError('ABORTED', `${tag}: cancelled.`);
      }
      if (attempt >= retries) {
        throw new AuthError(
          'NETWORK_ERROR',
          `${tag}: unreachable (${describeNetworkError(e)}). Check connection, firewall, or VPN and retry.`,
          { cause: e },
        );
      }
      await sleep(1000 * (attempt + 1));
    } finally {
      cancel();
    }
  }
}

/** fetchWithRetry + HTTP status check + safe JSON parse. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, opts: FetchRetryOpts = {}): Promise<{ status: number; json: T }> {
  const tag = opts.label ?? hostOf(url);
  const res = await fetchWithRetry(url, init, opts);
  const text = await res.text().catch(() => '');
  let json: T;
  try {
    json = (text ? JSON.parse(text) : {}) as T;
  } catch (e) {
    throw new AuthError('NETWORK_ERROR', `${tag}: bad response (HTTP ${res.status}, not JSON).`, {
      status: res.status,
      cause: e,
    });
  }
  if (!res.ok) {
    const err = new AuthError('NETWORK_ERROR', `${tag}: HTTP ${res.status}.`, { status: res.status, cause: json });
    (err as unknown as { payload: unknown }).payload = json;
    throw err;
  }
  return { status: res.status, json };
}
