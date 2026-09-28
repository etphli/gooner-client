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
        width: 36, height: 21, borderRadius: 999,
        background: checked ? 'var(--green)' : 'var(--border-strong)',
        position: 'relative', transition: 'background .15s', display: 'inline-block', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: 2, width: 17, height: 17,
        borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        transform: checked ? 'translateX(15px)' : 'none', transition: 'transform .15s'
      }} />
    </span>
    {label && <span style={{ color: 'var(--text)', fontSize: 13 }}>{label}</span>}
  </button>
);

export const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => {
  const v = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} className="progress-track">
      <div className="progress-fill" style={{ width: `${v}%` }} />
    </div>
  );
};

export const Badge: React.FC<{ source: 'modrinth' | 'curseforge' | 'local' }> = ({ source }) => {
  const map = {
    modrinth: { cls: 'badge-modrinth', bg: '#1bd96a22', fg: '#0a9b4a', label: 'Modrinth' },
    curseforge: { cls: 'badge-curseforge', bg: '#f1643622', fg: '#c44a1f', label: 'CurseForge' },
    local: { cls: '', bg: 'var(--card-2)', fg: 'var(--text2)', label: 'Local' }
  }[source];
  return <span className={map.cls} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: map.bg, color: map.fg }}>{map.label}</span>;
};

export const Slider: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void }> = ({ value, min, max, step = 1, onChange }) => (
  <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} aria-label="slider" />
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>{children}</h2>
);

export const PageHeader: React.FC<{ title: string; sub?: string; actions?: React.ReactNode }> = ({ title, sub, actions }) => (
  <div className="page-head">
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="row" style={{ flexShrink: 0 }}>{actions}</div>}
    </div>
  </div>
);

export const Field: React.FC<{ label: string; hint?: string; htmlFor?: string; children: React.ReactNode }> = ({ label, hint, htmlFor, children }) => (
  <div className="field">
    <label className="label" htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <span className="hint">{hint}</span>}
  </div>
);

export const SegmentedControl: React.FC<{ options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; ariaLabel?: string }> = ({ options, value, onChange, ariaLabel }) => (
  <div className="seg" role="group" aria-label={ariaLabel ?? 'options'}>
    {options.map((o) => (
      <button key={o.value} type="button" className="seg-btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

export const EmptyState: React.FC<{ title: string; sub?: string; action?: React.ReactNode }> = ({ title, sub, action }) => (
  <div className="card" style={{ textAlign: 'center', padding: 24 }}>
    <div style={{ fontWeight: 700 }}>{title}</div>
    {sub && <div className="muted tiny" style={{ marginTop: 4 }}>{sub}</div>}
    {action && <div style={{ marginTop: 12 }}>{action}</div>}
  </div>
);

export const StatusLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="status-line">{text}</div>
);
