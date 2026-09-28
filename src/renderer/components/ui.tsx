import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="card" style={style}>{children}</div>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none', border: 0, padding: 0, font: 'inherit' }}
  >
    <span
      style={{
        width: 40, height: 23, borderRadius: 999,
        background: checked ? 'var(--green)' : 'rgba(120,120,128,0.32)',
        position: 'relative', transition: 'background .15s', display: 'inline-block'
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: 2, width: 19, height: 19,
        borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        transform: checked ? 'translateX(17px)' : 'none', transition: 'transform .15s'
      }} />
    </span>
    {label && <span style={{ color: 'var(--text)' }}>{label}</span>}
  </button>
);

export const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => {
  const v = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 999, background: 'rgba(120,120,128,.25)', overflow: 'hidden' }}>
      <div style={{ width: `${v}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
    </div>
  );
};

export const Badge: React.FC<{ source: 'modrinth' | 'curseforge' | 'local' }> = ({ source }) => {
  const map = {
    modrinth: { cls: 'badge-modrinth', bg: '#1bd96a22', fg: '#0a9b4a', label: 'Modrinth' },
    curseforge: { cls: 'badge-curseforge', bg: '#f1643622', fg: '#c44a1f', label: 'CurseForge' },
    local: { cls: '', bg: 'rgba(120,120,128,.2)', fg: 'var(--text2)', label: 'Local' }
  }[source];
  return <span className={map.cls} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: map.bg, color: map.fg }}>{map.label}</span>;
};

export const Slider: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void }> = ({ value, min, max, step = 1, onChange }) => (
  <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{children}</h2>
);
