import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, PageHeader } from '../components/ui';

type Method = 'device' | 'browser' | 'offline' | 'elyby' | 'custom' | null;

interface AccountLike {
  id: string;
  minecraftUsername?: string;
  username?: string;
  name?: string;
  provider?: string;
}

interface ExtGooner {
  listAccounts?: () => Promise<unknown>;
  removeAccount?: (id: string) => Promise<unknown>;
  setActiveAccount?: (id: string) => Promise<unknown>;
  startDeviceFlow?: () => Promise<{ userCode: string; verificationUri: string; verificationUriComplete?: string; expiresIn: number; sessionId: string }>;
  pollDeviceFlow?: (id: string) => Promise<unknown>;
  cancelDeviceFlow?: (id?: string) => Promise<unknown>;
  signInBrowser?: () => Promise<unknown>;
  signInOffline?: (u: string) => Promise<unknown>;
  signInElyby?: (u: string, p: string) => Promise<unknown>;
  signInCustom?: (s: string, u: string, p: string) => Promise<unknown>;
  openExternal?: (u: string) => Promise<unknown>;
}

function toAccounts(v: unknown): AccountLike[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[]).filter((a) => a && typeof a.id === 'string').map((a) => ({
    id: String(a.id),
    minecraftUsername: typeof a.minecraftUsername === 'string' ? String(a.minecraftUsername) : undefined,
    username: typeof a.username === 'string' ? String(a.username) : undefined,
    name: typeof a.name === 'string' ? String(a.name) : undefined,
    provider: typeof a.provider === 'string' ? String(a.provider) : undefined,
  }));
}

function displayName(a: AccountLike): string {
  return a.minecraftUsername ?? a.username ?? a.name ?? 'Player';
}

const Accounts: React.FC<{ onAccountsChange?: () => void }> = ({ onAccountsChange }) => {
  const [accounts, setAccounts] = useState<AccountLike[]>([]);
  const [method, setMethod] = useState<Method>(null);
  const [userCode, setUserCode] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('https://www.microsoft.com/link');
  const [sessionId, setSessionId] = useState('');
  const [left, setLeft] = useState(0);
  const [status, setStatus] = useState('');
  const [offlineName, setOfflineName] = useState('');
  const [elyUser, setElyUser] = useState('');
  const [elyPass, setElyPass] = useState('');
  const [custom, setCustom] = useState({ server: '', user: '', pass: '' });
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const pollRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const raw = await (window.gooner as unknown as ExtGooner | undefined)?.listAccounts?.();
      setAccounts(toAccounts(raw));
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!sessionId) return;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      pollRef.current = false;
      if (timer.current) window.clearInterval(timer.current);
      if (sessionId && sessionId !== 'demo') {
        (window.gooner as unknown as ExtGooner | undefined)?.cancelDeviceFlow?.(sessionId)?.catch(() => undefined);
      }
    };
  }, [sessionId]);

  const notify = () => onAccountsChange?.();

  const startDevice = async () => {
    setMethod('device'); setStatus('Requesting device code…');
    try {
      const f = await (window.gooner as unknown as ExtGooner | undefined)?.startDeviceFlow?.();
      if (!f) throw new Error('no ipc');
      setUserCode(f.userCode); setVerifyUrl(f.verificationUriComplete ?? f.verificationUri); setSessionId(f.sessionId); setLeft(f.expiresIn); setStatus('Waiting — complete sign-in on another device…');
      pollRef.current = true;
      try {
        const acc = await (window.gooner as unknown as ExtGooner | undefined)?.pollDeviceFlow?.(f.sessionId);
        const name = (acc as { minecraftUsername?: string } | undefined)?.minecraftUsername ?? 'player';
        setStatus(`Signed in as ${name} ✓`);
        pollRef.current = false;
        await refresh(); notify();
      } catch (e) {
        if (pollRef.current) setStatus(`Device flow failed: ${(e as Error)?.message ?? e}`);
      }
    } catch (e) {
      setStatus(`Device flow unavailable (dev fallback): ${(e as Error)?.message ?? e}. Showing demo code.`);
      setUserCode('XKCD-4242'); setVerifyUrl('https://www.microsoft.com/link'); setSessionId('demo'); setLeft(900);
    }
  };

  const remove = async (id: string) => {
    try {
      await (window.gooner as unknown as ExtGooner | undefined)?.removeAccount?.(id);
      await refresh(); notify();
    } catch (e) {
      setStatus(`Remove failed: ${(e as Error)?.message ?? e}`);
    }
  };

  const setActive = async (id: string) => {
    try {
      await (window.gooner as unknown as ExtGooner | undefined)?.setActiveAccount?.(id);
    } catch { /* optional backend — still remember locally */ }
    try { localStorage.setItem('gooner:activeAccount', id); } catch { /* ignore */ }
    setStatus(`Active account: ${accounts.find((a) => a.id === id) ? displayName(accounts.find((a) => a.id === id) as AccountLike) : id}`);
    notify();
  };

  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const copy = () => { if (userCode) void navigator.clipboard?.writeText(userCode); };
  const btn: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%' };

  return (
    <div className="page">
      <PageHeader title="Accounts" sub="Five ways to sign in. Switch or remove anytime." actions={<span className="pill">{accounts.length} connected</span>} />

      <Card>
        <strong>Connected accounts</strong>
        {accounts.length === 0 ? (
          <div className="tiny muted" style={{ marginTop: 6 }}>No accounts yet — sign in below to unlock the launcher.</div>
        ) : (
          <div className="stack" style={{ marginTop: 10 }}>
            {accounts.map((a) => (
              <div key={a.id} className="row" style={{ justifyContent: 'space-between', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-2)' }}>
                <div className="row" style={{ minWidth: 0 }}>
                  <span className="avatar" style={{ width: 26, height: 26 }}>{(displayName(a)[0] ?? '?').toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(a)}</div>
                    <div className="tiny muted mono">{a.provider ?? a.id.slice(0, 8)}</div>
                  </div>
                </div>
                <div className="row">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => void setActive(a.id)}>Use</button>
                  <button type="button" className="btn-danger-ghost" onClick={() => void remove(a.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 10 }} />
      <div className="stack">
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => void startDevice()}><span className="auth-ico">🔗</span><span><b>Microsoft Device Link</b><br /><span className="tiny muted">Code + microsoft.com/link for another device</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} disabled={busy} onClick={async () => { setMethod('browser'); setStatus('Opening browser…'); setBusy(true); try { const acc = await (window.gooner as unknown as ExtGooner | undefined)?.signInBrowser?.(); setStatus(`Signed in as ${((acc as { minecraftUsername?: string } | undefined)?.minecraftUsername) ?? 'player'} ✓`); await refresh(); notify(); } catch (e) { setStatus(`Browser failed: ${(e as Error)?.message ?? e}`); } finally { setBusy(false); } }}><span className="auth-ico">🌐</span><span><b>Microsoft Browser</b><br /><span className="tiny muted">System browser OAuth</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => setMethod('offline')}><span className="auth-ico">⛏️</span><span><b>Offline</b><br /><span className="tiny muted">Local profile only</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => setMethod('elyby')}><span className="auth-ico">🪪</span><span><b>Ely.by</b><br /><span className="tiny muted">Email + password</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => setMethod('custom')}><span className="auth-ico">🛠️</span><span><b>Custom server</b><br /><span className="tiny muted">Private auth server</span></span></button></Card>
      </div>

      {status && <div className="status-line" style={{ marginTop: 12 }}>{status}</div>}

      {method === 'device' && userCode && (
        <Card style={{ marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>1 — Go to <span className="mono" style={{ color: 'var(--accent)' }}>microsoft.com/link</span> on another device</div>
          <div className="tiny muted">2 — Enter this code:</div>
          <div className="code-box">{userCode}</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn-primary btn-sm" onClick={copy}>Copy code</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { (window.gooner as unknown as ExtGooner | undefined)?.openExternal?.(verifyUrl)?.catch(() => undefined); }}>Open microsoft.com/link</button>
          </div>
          <div style={{ marginTop: 10 }} className="mono tiny muted">{mmss} remaining</div>
        </Card>
      )}
      {method === 'offline' && (
        <Card style={{ marginTop: 12 }}>
          <strong>Offline profile</strong>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" placeholder="Steve_2009" value={offlineName} onChange={(e) => setOfflineName(e.target.value)} aria-label="Offline username" />
            <button type="button" className="btn-primary" disabled={!offlineName.trim() || busy} onClick={async () => { setBusy(true); try { await (window.gooner as unknown as ExtGooner | undefined)?.signInOffline?.(offlineName.trim()); setStatus(`Offline profile "${offlineName.trim()}" saved ✓`); await refresh(); notify(); } catch (e) { setStatus(`Offline failed: ${(e as Error)?.message ?? e}`); } finally { setBusy(false); } }}>Save</button>
          </div>
        </Card>
      )}
      {method === 'elyby' && (
        <Card style={{ marginTop: 12 }}>
          <strong>Ely.by</strong>
          <input className="input" style={{ marginTop: 8 }} placeholder="email or nickname" value={elyUser} onChange={(e) => setElyUser(e.target.value)} aria-label="Ely.by username" />
          <input className="input" style={{ marginTop: 8 }} type="password" placeholder="password" value={elyPass} onChange={(e) => setElyPass(e.target.value)} aria-label="Ely.by password" />
          <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={async () => { setBusy(true); try { await (window.gooner as unknown as ExtGooner | undefined)?.signInElyby?.(elyUser, elyPass); setStatus('Ely.by signed in ✓'); await refresh(); notify(); } catch (e) { setStatus(`Ely.by failed: ${(e as Error)?.message ?? e}`); } finally { setBusy(false); } }}>Sign in with Ely.by</button>
        </Card>
      )}
      {method === 'custom' && (
        <Card style={{ marginTop: 12 }}>
          <strong>Custom auth server</strong>
          <input className="input mono" style={{ marginTop: 8 }} placeholder="https://auth.example.com" value={custom.server} onChange={(e) => setCustom({ ...custom, server: e.target.value })} aria-label="Auth server URL" />
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" placeholder="username" value={custom.user} onChange={(e) => setCustom({ ...custom, user: e.target.value })} aria-label="Custom username" />
            <input className="input" type="password" placeholder="password" value={custom.pass} onChange={(e) => setCustom({ ...custom, pass: e.target.value })} aria-label="Custom password" />
          </div>
          <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={async () => { setBusy(true); try { await (window.gooner as unknown as ExtGooner | undefined)?.signInCustom?.(custom.server, custom.user, custom.pass); setStatus('Custom server signed in ✓'); await refresh(); notify(); } catch (e) { setStatus(`Custom failed: ${(e as Error)?.message ?? e}`); } finally { setBusy(false); } }}>Connect</button>
        </Card>
      )}
    </div>
  );
};
export default Accounts;
