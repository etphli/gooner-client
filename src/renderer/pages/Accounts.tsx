import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, PageHeader } from '../components/ui';
import { Guide, friendlyAuthError, isValidOfflineName } from '../components/authHelp';

type Method = 'device' | 'offline' | 'elyby' | 'custom' | null;

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

const ext = (): ExtGooner | undefined => window.gooner as unknown as ExtGooner | undefined;

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
      setAccounts(toAccounts(await ext()?.listAccounts?.()));
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetDevice = useCallback(() => {
    pollRef.current = false;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setSessionId('');
    setUserCode('');
    setLeft(0);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      pollRef.current = false;
      if (timer.current) window.clearInterval(timer.current);
      if (sessionId && sessionId !== 'demo') {
        ext()?.cancelDeviceFlow?.(sessionId)?.catch(() => undefined);
      }
    };
  }, [sessionId]);

  const notify = () => onAccountsChange?.();

  const startDevice = async () => {
    if (busy) return;
    resetDevice();
    setMethod('device');
    setBusy(true);
    setStatus('Requesting a sign-in code from Microsoft…');
    try {
      const f = await ext()?.startDeviceFlow?.();
      if (!f?.userCode || !f?.sessionId) throw new Error('no code returned — check your connection and try again');
      setUserCode(f.userCode);
      setVerifyUrl(f.verificationUriComplete ?? f.verificationUri);
      setSessionId(f.sessionId);
      setLeft(f.expiresIn);
      setStatus('Code ready — follow the steps below.');
      pollRef.current = true;
      try {
        const acc = await ext()?.pollDeviceFlow?.(f.sessionId);
        const name = (acc as { minecraftUsername?: string } | undefined)?.minecraftUsername ?? 'player';
        pollRef.current = false;
        resetDevice();
        setStatus(`Signed in as ${name} ✓`);
        await refresh(); notify();
      } catch (e) {
        if (pollRef.current) setStatus(friendlyAuthError(e, 'Device sign-in failed'));
      }
    } catch (e) {
      setStatus(friendlyAuthError(e, 'Could not get a sign-in code'));
    } finally {
      setBusy(false);
    }
  };

  const cancelDevice = async () => {
    if (sessionId && sessionId !== 'demo') {
      await ext()?.cancelDeviceFlow?.(sessionId)?.catch(() => undefined);
    }
    resetDevice();
    setStatus('Cancelled — press Get code to start over.');
  };

  const remove = async (id: string) => {
    try {
      await ext()?.removeAccount?.(id);
      await refresh(); notify();
    } catch (e) {
      setStatus(friendlyAuthError(e, 'Remove failed'));
    }
  };

  const setActive = async (id: string) => {
    try {
      await ext()?.setActiveAccount?.(id);
    } catch { /* optional backend — still remember locally */ }
    try { localStorage.setItem('gooner:activeAccount', id); } catch { /* ignore */ }
    const found = accounts.find((a) => a.id === id);
    setStatus(`Active account: ${found ? displayName(found) : id}`);
    notify();
  };

  const doOffline = async () => {
    const name = offlineName.trim();
    if (!isValidOfflineName(name) || busy) return;
    setBusy(true);
    try {
      await ext()?.signInOffline?.(name);
      setStatus(`Offline profile "${name}" saved ✓ — pick a profile and press Play.`);
      setOfflineName('');
      await refresh(); notify();
    } catch (e) {
      setStatus(friendlyAuthError(e, 'Offline sign-in failed'));
    } finally {
      setBusy(false);
    }
  };

  const doElyby = async () => {
    if (!elyUser.trim() || !elyPass || busy) return;
    setBusy(true);
    try {
      await ext()?.signInElyby?.(elyUser.trim(), elyPass);
      setStatus(`Ely.by signed in as ${elyUser.trim()} ✓`);
      setElyPass('');
      await refresh(); notify();
    } catch (e) {
      setStatus(friendlyAuthError(e, 'Ely.by sign-in failed'));
    } finally {
      setBusy(false);
    }
  };

  const doCustom = async () => {
    if (!custom.server.trim() || !custom.user.trim() || !custom.pass || busy) return;
    setBusy(true);
    try {
      await ext()?.signInCustom?.(custom.server.trim(), custom.user.trim(), custom.pass);
      setStatus(`Custom server "${custom.server.trim()}" connected ✓`);
      setCustom({ server: custom.server, user: '', pass: '' });
      await refresh(); notify();
    } catch (e) {
      setStatus(friendlyAuthError(e, 'Custom server sign-in failed'));
    } finally {
      setBusy(false);
    }
  };

  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const copy = () => { if (userCode) void navigator.clipboard?.writeText(userCode); };
  const btn: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%' };
  const offlineOk = isValidOfflineName(offlineName.trim());

  return (
    <div className="page">
      <PageHeader title="Accounts" sub="Four ways to sign in. Switch or remove anytime." actions={<span className="pill">{accounts.length} connected</span>} />

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
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} disabled={busy} onClick={() => void startDevice()}><span className="auth-ico">🔗</span><span><b>Microsoft Device Link</b><br /><span className="tiny muted">Code + microsoft.com/link for another device</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => setMethod(method === 'offline' ? null : 'offline')}><span className="auth-ico">⛏️</span><span><b>Offline</b><br /><span className="tiny muted">Local profile, instant, no Microsoft</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => setMethod(method === 'elyby' ? null : 'elyby')}><span className="auth-ico">🪪</span><span><b>Ely.by</b><br /><span className="tiny muted">Free account with skins</span></span></button></Card>
        <Card style={{ padding: 10 }}><button type="button" className="btn-ghost" style={{ ...btn, border: 0, background: 'transparent' }} onClick={() => setMethod(method === 'custom' ? null : 'custom')}><span className="auth-ico">🛠️</span><span><b>Custom server</b><br /><span className="tiny muted">Private auth server</span></span></button></Card>
      </div>

      {status && <div className="status-line" style={{ marginTop: 12 }}>{status}</div>}

      {method === 'device' && userCode && (
        <Card style={{ marginTop: 12, textAlign: 'center' }}>
          <Guide method="device" />
          <div style={{ height: 10 }} />
          <div className="code-box">{userCode}</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn-primary btn-sm" onClick={copy}>Copy code</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { ext()?.openExternal?.(verifyUrl)?.catch(() => undefined); }}>Open microsoft.com/link</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => void cancelDevice()}>Cancel</button>
          </div>
          <div style={{ marginTop: 10 }} className="mono tiny muted">{mmss} remaining — waiting for you to approve on the other device…</div>
        </Card>
      )}
      {method === 'offline' && (
        <Card style={{ marginTop: 12 }}>
          <strong>Offline profile</strong>
          <div style={{ marginTop: 8 }}><Guide method="offline" /></div>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" placeholder="Steve_2009" value={offlineName} onChange={(e) => setOfflineName(e.target.value)} aria-label="Offline username" />
            <button type="button" className="btn-primary" disabled={!offlineOk || busy} onClick={() => void doOffline()}>Save</button>
          </div>
          {offlineName.trim().length > 0 && !offlineOk && (
            <div className="tiny" style={{ marginTop: 6, color: 'var(--danger, #d33)' }}>Use 3–16 characters: letters, numbers, underscore only.</div>
          )}
        </Card>
      )}
      {method === 'elyby' && (
        <Card style={{ marginTop: 12 }}>
          <strong>Ely.by</strong>
          <div style={{ marginTop: 8 }}><Guide method="elyby" /></div>
          <input className="input" style={{ marginTop: 8 }} placeholder="email or nickname" value={elyUser} onChange={(e) => setElyUser(e.target.value)} aria-label="Ely.by username" />
          <input className="input" style={{ marginTop: 8 }} type="password" placeholder="password" value={elyPass} onChange={(e) => setElyPass(e.target.value)} aria-label="Ely.by password" />
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn-primary" disabled={!elyUser.trim() || !elyPass || busy} onClick={() => void doElyby()}>Sign in with Ely.by</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { ext()?.openExternal?.('https://account.ely.by/register')?.catch(() => undefined); }}>Create free account</button>
          </div>
        </Card>
      )}
      {method === 'custom' && (
        <Card style={{ marginTop: 12 }}>
          <strong>Custom auth server</strong>
          <div style={{ marginTop: 8 }}><Guide method="custom" /></div>
          <input className="input mono" style={{ marginTop: 8 }} placeholder="https://auth.example.com" value={custom.server} onChange={(e) => setCustom({ ...custom, server: e.target.value })} aria-label="Auth server URL" />
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" placeholder="username" value={custom.user} onChange={(e) => setCustom({ ...custom, user: e.target.value })} aria-label="Custom username" />
            <input className="input" type="password" placeholder="password" value={custom.pass} onChange={(e) => setCustom({ ...custom, pass: e.target.value })} aria-label="Custom password" />
          </div>
          <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={!custom.server.trim() || !custom.user.trim() || !custom.pass || busy} onClick={() => void doCustom()}>Connect</button>
        </Card>
      )}
    </div>
  );
};
export default Accounts;
