import React, { useEffect, useState } from 'react';
import { Card, SectionTitle, Slider, Toggle } from '../components/ui';
import type { Theme } from '../App';
import type { ClientSettings } from '../gooner';

const Settings: React.FC<{ theme: Theme; setTheme: (t: Theme) => void }> = ({ theme, setTheme }) => {
  const [s, setS] = useState<ClientSettings>({ ramMb: 4096, javaPath: '', theme: 'system', resolution: { w: 1280, h: 720 }, showHud: true, closeOnLaunch: true, fov: 90 });
  useEffect(() => {
    window.gooner?.getSettings().then((v) => {
      if (v) {
        setS(v);
        if (v.theme === 'light' || v.theme === 'dark' || v.theme === 'system') setTheme(v.theme as Theme);
      }
    }).catch(() => undefined);
  }, [setTheme]);
  const save = (next: ClientSettings) => { setS(next); window.gooner?.saveSettings?.(next); };
  return (
    <div style={{ maxWidth: 720 }}>
      <SectionTitle>HUD / Settings</SectionTitle>
      <p style={{ color: 'var(--text2)', margin: '0 0 14px' }}>Memory, Java, theme, HUD.</p>
      <div className="grid2">
        <Card>
          <strong>Memory — {(s.ramMb / 1024).toFixed(1)} GB</strong>
          <div style={{ marginTop: 8 }}><Slider value={s.ramMb} min={2048} max={16384} step={256} onChange={(v) => save({ ...s, ramMb: v })} /></div>
          <div style={{ height: 14 }} />
          <strong>FOV — {s.fov}</strong>
          <Slider value={s.fov} min={60} max={120} onChange={(v) => save({ ...s, fov: v })} />
        </Card>
        <Card>
          <strong>Appearance</strong>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} className="btn-ghost" style={{ textTransform: 'capitalize', background: theme === t ? 'var(--text)' : undefined, color: theme === t ? 'var(--bg)' : undefined }} onClick={() => { setTheme(t); save({ ...s, theme: t }); }}>{t}</button>
            ))}
          </div>
          <div style={{ height: 14 }} />
          <Toggle label="Show HUD overlay" checked={s.showHud} onChange={(v) => save({ ...s, showHud: v })} />
          <div style={{ height: 8 }} />
          <Toggle label="Close launcher on Play" checked={s.closeOnLaunch} onChange={(v) => save({ ...s, closeOnLaunch: v })} />
        </Card>
      </div>
      <div style={{ height: 14 }} />
      <Card>
        <strong>Java runtime</strong>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input className="input mono" value={s.javaPath} onChange={(e) => setS({ ...s, javaPath: e.target.value })} onBlur={() => save(s)} placeholder="Auto-provision Temurin 17/21" />
          <button className="btn-ghost" onClick={async () => { const p = await window.gooner?.browseJava?.(); if (p) save({ ...s, javaPath: p }); }}>Browse…</button>
        </div>
      </Card>
    </div>
  );
};
export default Settings;
