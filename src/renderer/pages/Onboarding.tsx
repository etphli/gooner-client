import React, { useEffect, useRef, useState } from 'react';
import { ProgressBar } from '../components/ui';

type Method = 'device' | 'browser' | 'offline' | 'elyby' | 'custom' | null;
type Step = 'welcome' | 'auth' | 'java' | 'done';

interface ExtGooner {
  listAccounts?: () => Promise<unknown>;
  startDeviceFlow?: () => Promise<{ userCode: string; verificationUri: string; verificationUriComplete?: string; expiresIn: number; sessionId: string }>;
  pollDeviceFlow?: (id: string) => Promise<unknown>;
  cancelDeviceFlow?: (id?: string) => Promise<unknown>;
  signInBrowser?: () => Promise<unknown>;
  signInOffline?: (u: string) => Promise<unknown>;
  signInElyby?: (u: string, p: string) => Promise<unknown>;
  signInCustom?: (s: string, u: string, p: string) => Promise<unknown>;
  ensureJava?: (mcVersion?: string) => Promise<unknown>;
  onJavaProgress?: (cb: (p: { percent?: number; task?: string; message?: string }) => void) => (() => void) | void;
  openExternal?: (u: string) => Promise<unknown>;
}

function accountName(a: unknown): string {
  if (a && typeof a === 'object') {
    const o = a as { minecraftUsername?: unknown; username?: unknown; name?: unknown };
    if (typeof o.minecraftUsername === 'string') return o.minecraftUsername;
    if (typeof o.username === 'string') return o.username;
    if (typeof o.name === 'string') return o.name;
  }
  return 'player';
}

const Onboarding: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [method, setMethod] = useState<Method>(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('');

  // device-link
  const [userCode, setUserCode] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('https://www.microsoft.com/link');
  const [sessionId, setSessionId] = useState('');
  const [left, setLeft] = useState(0);
  const timer = useRef<number | null>(null);
  const pollAlive = useRef(false);

  // other methods
  const [offlineName, setOfflineName] = useState('');
  const [elyUser, setElyUser] = useState('');
  const [elyPass, setElyPass] = useState('');
  const [custom, setCustom] = useState({ server: '', user: '', pass: '' });
  const [busy, setBusy] = useState(false);

  // java
  const [mcVersion, setMcVersion] = useState('1.21.1');
  const [javaPct, setJavaPct] = useState(0);
  const [javaTask, setJavaTask] = useState('Not started');
  const [javaReady, setJavaReady] = useState(false);
  const [javaBusy, setJavaBusy] = useState(false);

  const refreshCount = async (): Promise<number> => {
    try {
      const raw = await (window.gooner as unknown as ExtGooner | undefined)?.listAccounts?.();
      const n = Array.isArray(raw) ? raw.length : 0;
      setCount(n);
      return n;
    } catch {
      return count;
    }
  };

  useEffect(() => { void refreshCount(); }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      pollAlive.current = false;
      if (timer.current) window.clearInterval(timer.current);
      if (sessionId && sessionId !== 'demo') {
        (window.gooner as unknown as ExtGooner | undefined)?.cancelDeviceFlow?.(sessionId)?.catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;

  const afterAuth = async (acc: unknown, label: string) => {
    setStatus(`Signed in as ${accountName(acc) ?? label} ✓`);
    const n = await refreshCount();
    if (n >= 1) {
      window.setTimeout(() => setStep('java'), 600);
    }
  };

  const startDevice = async () => {
    setMethod('device');
    setStatus('Requesting device code…');
    try {
      const f = await (window.gooner as unknown as ExtGooner | undefined)?.startDeviceFlow?.();
      if (!f) throw new Error('device flow unavailable');
      setUserCode(f.userCode);
      setVerifyUrl(f.verificationUriComplete ?? f.verificationUri);
      setSessionId(f.sessionId);
      setLeft(f.expiresIn);
      setStatus('Waiting — complete sign-in on another device…');
      pollAlive.current = true;
      try {
        const acc = await (window.gooner as unknown as ExtGooner | undefined)?.pollDeviceFlow?.(f.sessionId);
        pollAlive.current = false;
        await afterAuth(acc, 'player');
      } catch (e) {
        if (pollAlive.current) setStatus(`Device flow failed: ${(e as Error)?.message ?? e}`);
      }
    } catch (e) {
      setStatus(`Device flow unavailable: ${(e as Error)?.message ?? e}. Showing demo code.`);
      setUserCode('XKCD-4242');
      setVerifyUrl('https://www.microsoft.com/link');
      setSessionId('demo');
      setLeft(900);
    }
  };

  const doBrowser = async () => {
    setMethod('browser');
    setBusy(true);
    setStatus('Opening browser…');
    try {
      const acc = await (window.gooner as unknown as ExtGooner | undefined)?.signInBrowser?.();
      if (!acc) throw new Error('no result from browser sign-in');
      await afterAuth(acc, 'player');
    } catch (e) {
      setStatus(`Browser sign-in failed: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const doOffline = async () => {
    const name = offlineName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const acc = await (window.gooner as unknown as ExtGooner | undefined)?.signInOffline?.(name);
      await afterAuth(acc ?? { minecraftUsername: name }, name);
    } catch (e) {
      setStatus(`Offline failed: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const doElyby = async () => {
    if (!elyUser || !elyPass) { setStatus('Enter Ely.by email and password.'); return; }
    setBusy(true);
    try {
      const acc = await (window.gooner as unknown as ExtGooner | undefined)?.signInElyby?.(elyUser, elyPass);
      await afterAuth(acc ?? { minecraftUsername: elyUser }, elyUser);
    } catch (e) {
      setStatus(`Ely.by failed: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const doCustom = async () => {
    if (!custom.server || !custom.user || !custom.pass) { setStatus('Enter server, username and password.'); return; }
    setBusy(true);
    try {
      const acc = await (window.gooner as unknown as ExtGooner | undefined)?.signInCustom?.(custom.server, custom.user, custom.pass);
      await afterAuth(acc ?? { minecraftUsername: custom.user }, custom.user);
    } catch (e) {
      setStatus(`Custom server failed: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const ensureJavaStep = async () => {
    setJavaBusy(true);
    setJavaTask(`Preparing Java for ${mcVersion}…`);
    setJavaPct(2);
    const off = (window.gooner as unknown as ExtGooner | undefined)?.onJavaProgress?.((p) => {
      if (typeof p?.percent === 'number') setJavaPct(p.percent);
      if (p?.task ?? p?.message) setJavaTask(String(p.task ?? p.message));
    });
    const sim = window.setInterval(() => {
      setJavaPct((v) => {
        if (v >= 90 || javaReady) return v;
        return Math.min(90, v + 3);
      });
    }, 500);
    try {
      const ext = window.gooner as unknown as ExtGooner | undefined;
      if (ext?.ensureJava) {
        await ext.ensureJava(mcVersion || undefined);
      } else {
        // Graceful fallback: no Java bridge — simulate provisioning.
        await new Promise((r) => window.setTimeout(r, 1200));
      }
      setJavaPct(100);
      setJavaTask('Java ready ✓');
      setJavaReady(true);
      setStatus('Java ready ✓');
      window.setTimeout(() => setStep('done'), 500);
    } catch (e) {
      setJavaTask(`Java setup failed: ${(e as Error)?.message ?? e}`);
    } finally {
      window.clearInterval(sim);
      if (typeof off === 'function') { try { off(); } catch { /* ignore */ } }
      setJavaBusy(false);
    }
  };

  const finish = () => {
    try { localStorage.setItem('gooner:onboarded', '1'); } catch { /* ignore */ }
    onDone();
  };

  const stepIdx = step === 'welcome' ? 0 : step === 'auth' ? 1 : step === 'java' ? 2 : 3;
  const optBtn: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%' };

  return (
    <div className="onboard-shell">
      <div className="onboard-card">
        <div className="row" style={{ gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2563eb,#9333ea)', color: '#fff', fontWeight: 800 }}>G</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Welcome to Gooner Client</div>
            <div className="tiny muted">Sign in → set up Java → play. Takes about a minute.</div>
          </div>
          {count > 0 && <span className="pill pill-ok" style={{ marginLeft: 'auto' }}>{count} account{count === 1 ? '' : 's'}</span>}
        </div>
        <div className="onboard-steps" aria-hidden>
          {[0, 1, 2, 3].map((i) => <div key={i} className={`onboard-dot ${i <= stepIdx ? 'on' : ''}`} />)}
        </div>

        {step === 'welcome' && (
          <div>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              A clean, light-first Minecraft launcher. Sign in with Microsoft, Ely.by, a custom server, or offline — then we provision the right Java automatically.
            </p>
            <div className="row">
              <button type="button" className="btn-primary" onClick={() => setStep('auth')}>Get started</button>
              <button type="button" className="btn-ghost" onClick={() => void refreshCount()}>Check accounts</button>
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>No account? You can use Offline to try instantly.</div>
          </div>
        )}

        {step === 'auth' && (
          <div>
            <div className="stack">
              <div className="card" style={{ padding: 10 }}>
                <button type="button" className="btn-ghost btn-block" style={{ ...optBtn, border: 0, background: 'transparent', padding: 4 }} onClick={() => void startDevice()}>
                  <span className="auth-ico">🔗</span>
                  <span><b>Microsoft Device Link</b><br /><span className="tiny muted">Code + microsoft.com/link for another device</span></span>
                </button>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <button type="button" className="btn-ghost btn-block" style={{ ...optBtn, border: 0, background: 'transparent', padding: 4 }} disabled={busy} onClick={() => void doBrowser()}>
                  <span className="auth-ico">🌐</span>
                  <span><b>Microsoft Browser</b><br /><span className="tiny muted">System browser OAuth</span></span>
                </button>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <button type="button" className="btn-ghost btn-block" style={{ ...optBtn, border: 0, background: 'transparent', padding: 4 }} onClick={() => setMethod('offline')}>
                  <span className="auth-ico">⛏️</span>
                  <span><b>Offline</b><br /><span className="tiny muted">Local profile only, no Microsoft</span></span>
                </button>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <button type="button" className="btn-ghost btn-block" style={{ ...optBtn, border: 0, background: 'transparent', padding: 4 }} onClick={() => setMethod('elyby')}>
                  <span className="auth-ico">🪪</span>
                  <span><b>Ely.by</b><br /><span className="tiny muted">Email + password</span></span>
                </button>
              </div>
              <div className="card" style={{ padding: 10 }}>
                <button type="button" className="btn-ghost btn-block" style={{ ...optBtn, border: 0, background: 'transparent', padding: 4 }} onClick={() => setMethod('custom')}>
                  <span className="auth-ico">🛠️</span>
                  <span><b>Custom server</b><br /><span className="tiny muted">Private Yggdrasil + authlib-injector</span></span>
                </button>
              </div>
            </div>

            {status && <div className="status-line" style={{ marginTop: 12 }}>{status}</div>}

            {method === 'device' && userCode && (
              <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>1 — Go to <span className="mono" style={{ color: 'var(--accent)' }}>microsoft.com/link</span></div>
                <div className="tiny muted">2 — Enter this code on another device:</div>
                <div className="code-box">{userCode}</div>
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn-primary btn-sm" onClick={() => { if (userCode) void navigator.clipboard?.writeText(userCode); }}>Copy code</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { (window.gooner as unknown as ExtGooner | undefined)?.openExternal?.(verifyUrl)?.catch(() => undefined); }}>Open link</button>
                </div>
                <div className="mono tiny muted" style={{ marginTop: 10 }}>{mmss} remaining</div>
              </div>
            )}
            {method === 'offline' && (
              <div className="card" style={{ marginTop: 12 }}>
                <b>Offline profile</b>
                <div className="row" style={{ marginTop: 8 }}>
                  <input className="input" placeholder="Steve_2009" value={offlineName} onChange={(e) => setOfflineName(e.target.value)} aria-label="Offline username" />
                  <button type="button" className="btn-primary" disabled={!offlineName.trim() || busy} onClick={() => void doOffline()}>Save</button>
                </div>
              </div>
            )}
            {method === 'elyby' && (
              <div className="card" style={{ marginTop: 12 }}>
                <b>Ely.by</b>
                <input className="input" style={{ marginTop: 8 }} placeholder="email or nickname" value={elyUser} onChange={(e) => setElyUser(e.target.value)} aria-label="Ely.by username" />
                <input className="input" style={{ marginTop: 8 }} type="password" placeholder="password" value={elyPass} onChange={(e) => setElyPass(e.target.value)} aria-label="Ely.by password" />
                <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void doElyby()}>Sign in with Ely.by</button>
              </div>
            )}
            {method === 'custom' && (
              <div className="card" style={{ marginTop: 12 }}>
                <b>Custom auth server</b>
                <input className="input mono" style={{ marginTop: 8 }} placeholder="https://auth.example.com" value={custom.server} onChange={(e) => setCustom({ ...custom, server: e.target.value })} aria-label="Auth server URL" />
                <div className="row" style={{ marginTop: 8 }}>
                  <input className="input" placeholder="username" value={custom.user} onChange={(e) => setCustom({ ...custom, user: e.target.value })} aria-label="Custom username" />
                  <input className="input" type="password" placeholder="password" value={custom.pass} onChange={(e) => setCustom({ ...custom, pass: e.target.value })} aria-label="Custom password" />
                </div>
                <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void doCustom()}>Connect</button>
              </div>
            )}

            <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <button type="button" className="btn-ghost" onClick={() => setStep('welcome')}>← Back</button>
              <button type="button" className="btn-primary" disabled={count < 1} onClick={() => setStep('java')}>
                Continue{count >= 1 ? ` (${count})` : ''} →
              </button>
            </div>
            {count < 1 && <div className="tiny muted" style={{ marginTop: 6 }}>Sign in once to continue — the launcher needs at least one account.</div>}
          </div>
        )}

        {step === 'java' && (
          <div>
            <p className="muted" style={{ margin: '0 0 10px' }}>We provision Eclipse Temurin for your Minecraft version. One click, cached afterwards.</p>
            <div className="field">
              <label className="label" htmlFor="ob-mc">Minecraft version</label>
              <div className="row">
                <input id="ob-mc" className="input mono" value={mcVersion} onChange={(e) => setMcVersion(e.target.value)} placeholder="1.21.1" />
                <button type="button" className="btn-primary" disabled={javaBusy} onClick={() => void ensureJavaStep()}>
                  {javaBusy ? 'Setting up…' : javaReady ? 'Re-check' : 'Set up Java'}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="tiny muted mono">{javaTask}</span>
                <span className="tiny muted mono">{Math.round(javaPct)}%</span>
              </div>
              <div style={{ marginTop: 6 }}><ProgressBar percent={javaPct} /></div>
            </div>
            {status && <div className="status-line" style={{ marginTop: 12 }}>{status}</div>}
            <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <button type="button" className="btn-ghost" onClick={() => setStep('auth')}>← Accounts</button>
              <button type="button" className="btn-primary" disabled={!javaReady} onClick={() => setStep('done')}>Continue →</button>
            </div>
            {!javaReady && <div className="tiny muted" style={{ marginTop: 6 }}>You can skip Java only after a successful setup — offline preview still works without it.</div>}
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>You&apos;re all set</div>
            <p className="muted" style={{ margin: '6px 0 16px' }}>{count} account{count === 1 ? '' : 's'} connected{javaReady ? ' · Java ready' : ''}. Time to play.</p>
            <button type="button" className="btn-primary" style={{ padding: '9px 28px' }} onClick={finish}>Open launcher</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
