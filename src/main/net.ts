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
  // Proxy wins when configured (DNS happens at the proxy); otherwise secure
  // DNS if enabled; otherwise direct.
  const dispatcher = (await dispatcherFor(url)) ?? (await secureDnsDispatcher(url).catch(() => undefined));
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

// ---- secure DNS (DNS-over-HTTPS) ----

export type SecureDnsMode = 'off' | 'cloudflare' | 'google';

const DOH_URLS: Record<Exclude<SecureDnsMode, 'off'>, string> = {
  // IP literals: no system DNS needed to bootstrap.
  cloudflare: 'https://1.1.1.1/dns-query',
  google: 'https://8.8.8.8/resolve',
};

const dohCache = new Map<string, { at: number; ip: string }>();
const DOH_TTL_MS = 5 * 60_000;
let secureDnsCache: { at: number; mode: SecureDnsMode } | null = null;

async function readSecureDnsMode(): Promise<SecureDnsMode> {
  if (secureDnsCache && Date.now() - secureDnsCache.at < 60_000) return secureDnsCache.mode;
  // Env override for debugging (GOONER_SECURE_DNS=cloudflare|google|off).
  const env = (typeof process !== 'undefined' ? process.env.GOONER_SECURE_DNS : '') ?? '';
  if (env === 'cloudflare' || env === 'google' || env === 'off') {
    secureDnsCache = { at: Date.now(), mode: env };
    return env;
  }
  let mode: SecureDnsMode = 'off';
  try {
    const { loadSettings } = await import('./launcher/settings.js');
    const s = await loadSettings();
    const m = (s as { secureDns?: string }).secureDns;
    if (m === 'cloudflare' || m === 'google' || m === 'off') mode = m;
  } catch {
    /* default off */
  }
  secureDnsCache = { at: Date.now(), mode };
  return mode;
}

function isIpLiteral(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.invalid') ||
    h.endsWith('.localhost')
  );
}

interface DohJson {
  Answer?: Array<{ type?: number; data?: string }>;
}

/** Resolve an A record over HTTPS (no system DNS involved). */
async function dohResolve(host: string, dohUrl: string): Promise<string> {
  const cached = dohCache.get(`${dohUrl}|${host}`);
  if (cached && Date.now() - cached.at < DOH_TTL_MS) return cached.ip;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error('doh timeout')), 8000);
  try {
    const res = await fetch(`${dohUrl}?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
    const json = (await res.json()) as DohJson;
    const a = (json.Answer ?? []).find((r) => r?.type === 1 && typeof r?.data === 'string');
    if (!a?.data) throw new Error('no A record');
    dohCache.set(`${dohUrl}|${host}`, { at: Date.now(), ip: a.data });
    return a.data;
  } finally {
    clearTimeout(t);
  }
}

type ConnectFn = (
  opts: { hostname?: string; host?: string; port?: number; protocol?: string },
  cb: (err: Error | null, socket: unknown) => void,
) => void;

let dohAgentCtor: (new (opts: { connect: ConnectFn }) => DispatcherLike) | null | undefined;

/**
 * undici dispatcher that resolves hostnames over HTTPS-DNS and dials the
 * raw IP itself. TLS/SNI still uses the original hostname, so certificates
 * verify normally — only the DNS step bypasses broken local resolvers.
 */
async function secureDnsDispatcher(url: string): Promise<DispatcherLike | undefined> {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  if (isIpLiteral(host) || isLocalHost(host)) return undefined;
  const mode = await readSecureDnsMode();
  if (mode === 'off') return undefined;
  if (dohAgentCtor === undefined) {
    try {
      const mod = (await import('undici')) as { Agent?: new (opts: { connect: ConnectFn }) => DispatcherLike };
      dohAgentCtor = mod.Agent ?? null;
    } catch {
      dohAgentCtor = null;
    }
  }
  const AgentCtor = dohAgentCtor;
  if (!AgentCtor) return undefined;
  const primaries: string[] =
    mode === 'cloudflare' ? [DOH_URLS.cloudflare, DOH_URLS.google] : [DOH_URLS.google, DOH_URLS.cloudflare];
  const connect: ConnectFn = (opts, cb) => {
    void (async () => {
      try {
        const hostname = opts.hostname || opts.host || host;
        const port = opts.port || (opts.protocol === 'http:' ? 80 : 443);
        let ip: string | null = null;
        let lastErr: unknown = null;
        for (const doh of primaries) {
          try {
            ip = await dohResolve(hostname, doh);
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!ip) throw lastErr instanceof Error ? lastErr : new Error('secure DNS failed');
        const net = await import('node:net');
        const socket = net.connect({ host: ip, port });
        const onError = (err: Error): void => {
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
          cb(err, null);
        };
        socket.once('error', onError);
        socket.once('connect', () => {
          socket.removeListener('error', onError);
          cb(null, socket);
        });
      } catch (e) {
        cb(e instanceof Error ? e : new Error(String(e)), null);
      }
    })();
  };
  return new AgentCtor({ connect });
}

export interface EndpointCheck {
  name: string;
  host: string;
  ok: boolean;
  ms: number;
  detail: string;
  hint: string;
}

const DIAG_ENDPOINTS: Array<{ name: string; url: string }> = [
  { name: 'Microsoft sign-in', url: 'https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration' },
  { name: 'Xbox Live', url: 'https://user.auth.xboxlive.com/' },
  { name: 'Minecraft services', url: 'https://api.minecraftservices.com/' },
  { name: 'Mojang versions', url: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json' },
  { name: 'Ely.by', url: 'https://authserver.ely.by/' },
  { name: 'Modrinth', url: 'https://api.modrinth.com/v2/search?query=a&limit=1' },
  { name: 'Java (Adoptium)', url: 'https://api.adoptium.net/v3/info/available_releases' },
];

function hintFor(detail: string): string {
  if (/DNS lookup failed/i.test(detail)) {
    return 'Mac DNS is failing — System Settings → Wi-Fi → Details → DNS → add 1.1.1.1, or turn on a VPN (e.g. free ProtonVPN).';
  }
  if (/refused|dropped/i.test(detail)) {
    return 'Blocked by firewall/VPN — allow Gooner Client or set a proxy in Settings → Network.';
  }
  if (/timed out/i.test(detail)) {
    return 'Too slow/blocked — try a VPN or proxy in Settings → Network.';
  }
  if (/TLS|certificate|clock/i.test(detail)) {
    return 'Check Mac date/time, or disable HTTPS-scanning proxy/VPN.';
  }
  return 'Check connection, firewall, or VPN and retry.';
}

/**
 * Reachability check per backend host. Any HTTP response counts as
 * reachable; only transport failures fail. Used by Settings → Diagnostics.
 */
export async function diagnoseEndpoints(): Promise<EndpointCheck[]> {
  const run = async (name: string, url: string): Promise<EndpointCheck> => {
    const host = hostOf(url);
    const started = Date.now();
    try {
      const res = await fetchWithRetry(url, { method: 'HEAD' }, { label: name, timeoutMs: 12000, retries: 0 });
      return { name, host, ok: true, ms: Date.now() - started, detail: `HTTP ${res.status}`, hint: '' };
    } catch (e) {
      const detail = e instanceof AuthError ? e.message.replace(`${name}: `, '').replace(/\. Check connection.*$/, '') : describeNetworkError(e);
      return { name, host, ok: false, ms: Date.now() - started, detail, hint: hintFor(detail) };
    }
  };
  return Promise.all(DIAG_ENDPOINTS.map((d) => run(d.name, d.url)));
}
