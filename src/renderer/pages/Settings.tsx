import React, { useEffect, useState } from 'react';
import { Card, Field, PageHeader, ProgressBar, Slider, Toggle } from '../components/ui';
import type { Theme } from '../App';
import type { ClientSettings } from '../gooner';

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

interface ExtGooner {
  checkForUpdates?: () => Promise<unknown>;
  quitAndInstall?: () => Promise<unknown> | unknown;
  onUpdater?: (event: string, cb: (payload?: unknown) => void) => (() => void) | void;
  getMsClientId?: () => Promise<string>;
  setMsClientId?: (id: string) => Promise<string>;
  diagnoseNetwork?: () => Promise<Array<{ name: string; host: string; ok: boolean; ms: number; detail: string; hint: string }>>;
  openExternal?: (u: string) => Promise<unknown>;
}

const Settings: React.FC<{ theme: Theme; setTheme: (t: Theme) => void }> = ({ theme, setTheme }) => {
  const [s, setS] = useState<ClientSettings>({ ramMb: 4096, javaPath: '', proxy: '', secureDns: 'off', theme: 'system', resolution: { w: 1280, h: 720 }, showHud: true, closeOnLaunch: true, fov: 90 });

  const [upStatus, setUpStatus] = useState<UpdaterStatus>('idle');
  const [upInfo, setUpInfo] = useState('Up to date check has not run yet.');
  const [upPct, setUpPct] = useState(0);
  const [upBusy, setUpBusy] = useState(false);
  const [diag, setDiag] = useState<Array<{ name: string; host: string; ok: boolean; ms: number; detail: string; hint: string }>>([]);
  const [diagBusy, setDiagBusy] = useState(false);
  const [msId, setMsId] = useState('');
  const [msSaved, setMsSaved] = useState('');

  useEffect(() => {
    (window.gooner as unknown as ExtGooner | undefined)?.getMsClientId?.()
      ?.then((v) => { if (typeof v === 'string') { setMsId(v); setMsSaved(v); } })
      ?.catch(() => undefined);
  }, []);

  useEffect(() => {
    window.gooner?.getSettings?.()?.then((v) => {
      if (v) {
        setS(v);
        if (v.theme === 'light' || v.theme === 'dark' || v.theme === 'system') setTheme(v.theme as Theme);
      }
    })?.catch(() => undefined);
  }, [setTheme]);

  // Subscribe to updater events when the bridge supports onUpdater(event, cb).
  useEffect(() => {
    const ext = window.gooner as unknown as ExtGooner | undefined;
    const sub = ext?.onUpdater;
    if (!sub) return;
    const offs: Array<(() => void) | void> = [];
    try {
      offs.push(sub.call(ext, 'checking', () => { setUpStatus('checking'); setUpInfo('Checking for updates…'); }));
      offs.push(sub.call(ext, 'available', (p) => {
        setUpStatus('available');
        const v = (p as { version?: string } | undefined)?.version;
        setUpInfo(v ? `Update available: ${v}` : 'Update available.');
      }));
      offs.push(sub.call(ext, 'not-available', () => { setUpStatus('not-available'); setUpInfo('You are on the latest version ✓'); }));
      offs.push(sub.call(ext, 'progress', (p) => {
        setUpStatus('downloading');
        const pct = (p as { percent?: number } | undefined)?.percent;
        if (typeof pct === 'number') setUpPct(pct);
        setUpInfo(typeof pct === 'number' ? `Downloading… ${Math.round(pct)}%` : 'Downloading…');
      }));
      offs.push(sub.call(ext, 'downloaded', () => { setUpStatus('downloaded'); setUpPct(100); setUpInfo('Update downloaded — restart to install.'); }));
      offs.push(sub.call(ext, 'error', (p) => { setUpStatus('error'); setUpInfo(`Updater error: ${typeof p === 'string' ? p : JSON.stringify(p) ?? 'unknown'}`); }));
    } catch { /* bridge without multi-event support — check button covers it */ }
    return () => { offs.forEach((o) => { if (typeof o === 'function') { try { o(); } catch { /* ignore */ } } }); };
  }, []);

  const save = (next: ClientSettings) => { setS(next); window.gooner?.saveSettings?.(next)?.catch(() => undefined); };

  const check = async () => {
    setUpBusy(true);
    setUpStatus('checking');
    setUpInfo('Checking for updates…');
    try {
      const ext = window.gooner as unknown as ExtGooner | undefined;
      const r = await ext?.checkForUpdates?.();
      if (!ext?.checkForUpdates) {
        setUpStatus('idle');
        setUpInfo('Updater bridge unavailable in this build.');
      } else if (r && typeof r === 'object' && 'skipped' in (r as Record<string, unknown>)) {
        setUpStatus('idle');
        setUpInfo('Updater skipped in dev.');
      } else {
        const info = r as { version?: string; updateInfo?: { version?: string } } | null | undefined;
        const v = info?.version ?? info?.updateInfo?.version;
        if (v) { setUpStatus('available'); setUpInfo(`Update available: ${v}`); }
        else { setUpStatus('not-available'); setUpInfo('You are on the latest version ✓'); }
      }
    } catch (e) {
      setUpStatus('error');
      setUpInfo(`Check failed: ${(e as Error)?.message ?? e}`);
    } finally {
      setUpBusy(false);
    }
  };

  const restart = async () => {
    try {
      await (window.gooner as unknown as ExtGooner | undefined)?.quitAndInstall?.();
    } catch (e) {
      setUpInfo(`Restart failed: ${(e as Error)?.message ?? e}`);
    }
  };

  const runDiag = async () => {
    setDiagBusy(true);
    try {
      const r = await (window.gooner as unknown as ExtGooner | undefined)?.diagnoseNetwork?.();
      setDiag(Array.isArray(r) ? r : []);
    } catch {
      setDiag([]);
    } finally {
      setDiagBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Settings" sub="Memory, Java, appearance, HUD, updates." />
      <div className="grid2">
        <Card>
          <strong>Memory — {(s.ramMb / 1024).toFixed(1)} GB</strong>
          <div style={{ marginTop: 8 }}><Slider value={s.ramMb} min={2048} max={16384} step={256} onChange={(v) => save({ ...s, ramMb: v })} /></div>
          <div style={{ height: 12 }} />
          <strong>FOV — {s.fov}</strong>
          <Slider value={s.fov} min={60} max={120} onChange={(v) => save({ ...s, fov: v })} />
        </Card>
        <Card>
          <strong>Appearance</strong>
          <div className="row-wrap" style={{ marginTop: 8 }}>
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} type="button" className="btn-ghost btn-sm" style={{ textTransform: 'capitalize', background: theme === t ? 'var(--text)' : undefined, color: theme === t ? 'var(--bg)' : undefined, borderColor: theme === t ? 'var(--text)' : undefined }} onClick={() => { setTheme(t); save({ ...s, theme: t }); }}>{t}</button>
            ))}
          </div>
          <div style={{ height: 12 }} />
          <Toggle label="Show HUD overlay" checked={s.showHud} onChange={(v) => save({ ...s, showHud: v })} />
          <div style={{ height: 8 }} />
          <Toggle label="Close launcher on Play" checked={s.closeOnLaunch} onChange={(v) => save({ ...s, closeOnLaunch: v })} />
        </Card>
      </div>
      <div style={{ height: 10 }} />
      <Card>
        <Field label="Java runtime" hint="Leave empty to auto-provision Temurin 17 / 21.">
          <div className="row">
            <input className="input mono" value={s.javaPath} onChange={(e) => setS({ ...s, javaPath: e.target.value })} onBlur={() => save(s)} placeholder="Auto-provision Temurin 17/21" aria-label="Java path" />
            <button type="button" className="btn-ghost" onClick={async () => { const p = await window.gooner?.browseJava?.()?.catch(() => null); if (p) save({ ...s, javaPath: p }); }}>Browse…</button>
          </div>
        </Field>
      </Card>
      <div style={{ height: 10 }} />
      <Card>
        <Field label="Network proxy (optional)" hint="If sign-in or downloads fail with DNS/network errors, enter your proxy (http://host:port). Empty = system proxy / direct. Never route logins through free VPNs.">
          <div className="row">
            <input className="input mono" value={s.proxy} onChange={(e) => setS({ ...s, proxy: e.target.value })} onBlur={() => save(s)} placeholder="http://proxy.local:8080" aria-label="Network proxy" />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="tiny muted">Secure DNS:</span>
            {(['off', 'cloudflare', 'google'] as const).map((m) => (
              <button key={m} type="button" className="btn-ghost btn-sm" style={{ textTransform: 'capitalize', background: s.secureDns === m ? 'var(--text)' : undefined, color: s.secureDns === m ? 'var(--bg)' : undefined }} onClick={() => save({ ...s, secureDns: m })}>{m === 'off' ? 'Off' : m === 'cloudflare' ? 'Cloudflare' : 'Google'}</button>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>Bypasses broken local DNS for sign-in/downloads (no VPN needed).</div>
        </Field>
      </Card>
      <div style={{ height: 10 }} />
      <Card>
        <Field label="Microsoft Client ID (advanced)" hint="App ID used for Microsoft sign-in. Empty = built-in default. Only change if you registered your own Azure app.">
          <div className="row">
            <input className="input mono" value={msId} onChange={(e) => setMsId(e.target.value)} placeholder="c36a9fb6-…" aria-label="Microsoft client ID" />
            <button type="button" className="btn-ghost" onClick={async () => {
              try {
                const v = await (window.gooner as unknown as ExtGooner | undefined)?.setMsClientId?.(msId.trim());
                if (typeof v === 'string') { setMsId(v); setMsSaved(v); }
              } catch { /* keep local value */ }
            }}>Save</button>
          </div>
          {msId !== msSaved && <div className="tiny muted" style={{ marginTop: 6 }}>Unsaved changes.</div>}
        </Field>
      </Card>
      <div style={{ height: 10 }} />
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Connection diagnostics</strong>
            <div className="tiny muted">Tests every server the launcher needs. On a strict network, turn on any reputable VPN app (e.g. free ProtonVPN) — the launcher works through it automatically.</div>
          </div>
          <button type="button" className="btn-ghost" disabled={diagBusy} onClick={() => void runDiag()}>
            {diagBusy ? (<><span className="spinner" aria-hidden /> Testing…</>) : 'Run diagnostics'}
          </button>
        </div>
        {diag.length > 0 && (
          <div className="stack" style={{ marginTop: 10 }}>
            {diag.map((d) => (
              <div key={d.name} style={{ padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span><span aria-hidden>{d.ok ? '✓ ' : '✗ '}</span><strong>{d.name}</strong> <span className="tiny muted mono">{d.host} · {d.ms}ms</span></span>
                  <span className={`pill ${d.ok ? 'pill-ok' : 'pill-err'}`}>{d.ok ? 'OK' : 'FAIL'}</span>
                </div>
                {!d.ok && <div className="tiny" style={{ marginTop: 4 }}>{d.detail}</div>}
                {!d.ok && d.hint && <div className="tiny muted" style={{ marginTop: 2 }}>{d.hint}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
      <div style={{ height: 10 }} />
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Updates</strong>
            <div className="tiny muted">Check, download progress, restart to install.</div>
          </div>
          <span className={`pill ${upStatus === 'downloaded' || upStatus === 'not-available' ? 'pill-ok' : upStatus === 'error' ? 'pill-err' : upStatus === 'idle' ? '' : 'pill-warn'}`}>{upStatus}</span>
        </div>
        <div style={{ marginTop: 10 }} className="status-line">{upInfo}</div>
        {(upStatus === 'downloading' || upStatus === 'available') && (
          <div style={{ marginTop: 10 }}><ProgressBar percent={upPct} /></div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn-ghost" disabled={upBusy} onClick={() => void check()}>
            {upBusy ? (<><span className="spinner" aria-hidden /> Checking…</>) : 'Check for updates'}
          </button>
          {upStatus === 'downloaded' && (
            <button type="button" className="btn-primary" onClick={() => void restart()}>Restart to install</button>
          )}
        </div>
      </Card>
    </div>
  );
};
export default Settings;
