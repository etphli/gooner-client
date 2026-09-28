import React from 'react';
import type { Route } from '../App';

const sections: { title: string; items: { id: Route; label: string; icon: string }[] }[] = [
  { title: 'Play', items: [{ id: 'play', label: 'Play', icon: '▶' }] },
  {
    title: 'Library',
    items: [
      { id: 'mods', label: 'Mods', icon: '🧩' },
      { id: 'cosmetics', label: 'Cosmetics', icon: '✦' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'settings', label: 'Settings', icon: '⚙' },
      { id: 'accounts', label: 'Accounts', icon: '👤' },
    ],
  },
];

const Sidebar: React.FC<{ route: Route; go: (r: Route) => void; theme: 'light' | 'dark' }> = ({ route, go, theme }) => (
  <aside className="sidebar" aria-label="Primary">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 10px' }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2563eb,#9333ea)', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>G</div>
      <div className="side-meta" style={{ minWidth: 0 }}>
        <div className="nav-label" style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Gooner Client</div>
        <div className="nav-label" style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize', lineHeight: 1.2 }}>{theme} theme</div>
      </div>
    </div>
    {sections.map((s) => (
      <div key={s.title}>
        <div className="nav-section">{s.title}</div>
        {s.items.map((i) => (
          <button key={i.id} className={`nav-item ${route === i.id ? 'active' : ''}`} aria-current={route === i.id ? 'page' : undefined} onClick={() => go(i.id)}>
            <span style={{ width: 18, textAlign: 'center', fontSize: 13 }} aria-hidden>{i.icon}</span>
            <span className="nav-label">{i.label}</span>
          </button>
        ))}
      </div>
    ))}
    <div style={{ marginTop: 'auto', padding: '10px 8px 2px' }} className="side-meta">
      <div className="tiny" style={{ color: 'var(--text3)' }}>Light-first · hairline UI</div>
    </div>
  </aside>
);
export default Sidebar;
