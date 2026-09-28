import React, { useEffect, useRef, useState } from 'react';
import { Card, SectionTitle } from '../components/ui';

type Method = 'device' | 'browser' | 'offline' | 'elyby' | 'custom' | null;

const Accounts: React.FC = () => {
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
  const timer = useRef<number | null>(null);
  const pollRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      pollRef.current = false;
      if (timer.current) window.clearInterval(timer.current);
      if (sessionId && sessionId !== 'demo') window.gooner?.cancelDeviceFlow?.(sessionId).catch(() => undefined);
    };
  }, [sessionId]);

  const startDevice = async () => {
    setMethod('device'); setStatus('Requesting device code…');
    try {
      const f = await window.gooner?.startDeviceFlow?.();
      if (!f) throw new Error('no ipc');
      setUserCode(f.userCode); setVerifyUrl(f.verificationUriComplete ?? f.verificationUri); setSessionId(f.sessionId); setLeft(f.expiresIn); setStatus('Waiting — complete sign-in on another device…');
      pollRef.current = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acc = await (window.gooner as unknown as { pollDeviceFlow: (id: string) => Promise<any> }).pollDeviceFlow(f.sessionId);
        setStatus(`Signed in as ${(acc as { minecraftUsername?: string })?.minecraftUsername ?? 'player'} ✓`);
        pollRef.current = false;
      } catch (e) {
        if (pollRef.current) setStatus(`Device flow failed: ${(e as Error)?.message}`);
      }
    } catch (e) {
      setStatus(`Device flow unavailable (dev fallback): ${(e as Error)?.message}. Showing demo code.`);
      setUserCode('XKCD-4242'); setVerifyUrl('https://www.microsoft.com/link'); setSessionId('demo'); setLeft(900);
    }
  };

  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const copy = () => userCode && navigator.clipboard?.writeText(userCode);
  const btn: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%' };

  return (
    <div style={{ maxWidth: 720 }}>
      <SectionTitle>Accounts — 5 ways to sign in</SectionTitle>
      <p style={{ color: 'var(--text2)', margin: '0 0 14px' }}>Device Link gives a code + link for another device. Keep whichever methods you like — tell me which to keep.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card><button className="btn-ghost" style={btn} onClick={startDevice}><span>🔗</span><span><b>1 — Microsoft Device Link (another device)</b><br /><span style={{ color: 'var(--text2)', fontSize: 12 }}>Show code + microsoft.com/link QR</span></span></button></Card>
        <Card><button className="btn-ghost" style={btn} onClick={async () => { setMethod('browser'); setStatus('Opening browser…'); try { await window.gooner?.signInBrowser?.(); setStatus('Signed in via browser ✓'); } catch (e) { setStatus(`Browser failed: ${(e as Error)?.message}`); } }}><span>🌐</span><span><b>2 — Microsoft Browser</b><br /><span style={{ color: 'var(--text2)', fontSize: 12 }}>System browser OAuth + PKCE</span></span></button></Card>
        <Card><button className="btn-ghost" style={btn} onClick={() => setMethod('offline')}><span>⛏️</span><span><b>3 — Offline</b><br /><span style={{ color: 'var(--text2)', fontSize: 12 }}>No Microsoft — local profile only</span></span></button></Card>
        <Card><button className="btn-ghost" style={btn} onClick={() => setMethod('elyby')}><span>🪪</span><span><b>4 — Ely.by</b><br /><span style={{ color: 'var(--text2)', fontSize: 12 }}>Email + password via authserver.ely.by</span></span></button></Card>
        <Card><button className="btn-ghost" style={btn} onClick={() => setMethod('custom')}><span>🛠️</span><span><b>5 — Custom Yggdrasil</b><br /><span style={{ color: 'var(--text2)', fontSize: 12 }}>Private auth server + authlib-injector</span></span></button></Card>
      </div>

      {status && <Card style={{ marginTop: 12 }}><span className="mono" style={{ fontSize: 12 }}>{status}</span></Card>}

      {method === 'device' && userCode && (
        <Card style={{ marginTop: 14, textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>1 — Go to <span className="mono" style={{ color: 'var(--accent)' }}>microsoft.com/link</span> on another device</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>2 — Enter this code:</div>
          <div className="mono" style={{ fontSize: 34, fontWeight: 800, letterSpacing: 3, margin: '10px 0' }}>{userCode}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={copy}>Copy code</button>
            <button className="btn-ghost" onClick={() => (window.gooner as unknown as { openExternal?: (u: string) => Promise<void> })?.openExternal?.(verifyUrl)}>Open microsoft.com/link</button>
          </div>
          <div style={{ marginTop: 12 }} className="mono">{mmss} remaining</div>
        </Card>
      )}
      {method === 'offline' && (
        <Card style={{ marginTop: 14 }}>
          <strong>Offline profile</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="input" placeholder="Steve_2009" value={offlineName} onChange={(e) => setOfflineName(e.target.value)} />
            <button className="btn-primary" disabled={!offlineName.trim()} onClick={async () => { try { await window.gooner?.signInOffline?.(offlineName.trim()); setStatus(`Offline profile "${offlineName.trim()}" saved ✓`); } catch (e) { setStatus(`Offline failed: ${(e as Error)?.message}`); } }}>Save</button>
          </div>
        </Card>
      )}
      {method === 'elyby' && (
        <Card style={{ marginTop: 14 }}>
          <strong>Ely.by</strong>
          <input className="input" style={{ marginTop: 8 }} placeholder="email or nickname" value={elyUser} onChange={(e) => setElyUser(e.target.value)} />
          <input className="input" style={{ marginTop: 8 }} type="password" placeholder="password" value={elyPass} onChange={(e) => setElyPass(e.target.value)} />
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={async () => { try { await (window.gooner as unknown as { signInElyby: (u: string, p: string) => Promise<void> }).signInElyby?.(elyUser, elyPass); setStatus('Ely.by signed in ✓'); } catch (e) { setStatus(`Ely.by failed: ${(e as Error)?.message}`); } }}>Sign in with Ely.by</button>
        </Card>
      )}
      {method === 'custom' && (
        <Card style={{ marginTop: 14 }}>
          <strong>Custom auth server</strong>
          <input className="input mono" style={{ marginTop: 8 }} placeholder="https://auth.example.com" value={custom.server} onChange={(e) => setCustom({ ...custom, server: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="input" placeholder="username" value={custom.user} onChange={(e) => setCustom({ ...custom, user: e.target.value })} />
            <input className="input" type="password" placeholder="password" value={custom.pass} onChange={(e) => setCustom({ ...custom, pass: e.target.value })} />
          </div>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={async () => { try { await window.gooner?.signInCustom?.(custom.server, custom.user, custom.pass); setStatus('Custom server signed in ✓'); } catch (e) { setStatus(`Custom failed: ${(e as Error)?.message}`); } }}>Connect</button>
        </Card>
      )}
    </div>
  );
};
export default Accounts;
