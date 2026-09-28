import React from 'react';
import type { Route } from '../App';

const items: { id: Route; label: string; icon: string }[] = [
  { id: 'play', label: 'Play', icon: '▶' },
  { id: 'mods', label: 'Mods', icon: '🧩' },
  { id: 'settings', label: 'HUD / Settings', icon: '⚙' },
  { id: 'cosmetics', label: 'Cosmetics', icon: '🦋' },
  { id: 'accounts', label: 'Accounts', icon: '👤' }
];

const Sidebar: React.FC<{ route: Route; go: (r: Route) => void; theme: 'light' | 'dark' }> = ({ route, go, theme }) => (
  <aside className="sidebar">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 14px' }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#0a84ff,#bf5af2)', color: '#fff', fontWeight: 800 }}>G</div>
      <div>
        <div className="nav-label" style={{ fontWeight: 700, fontSize: 13 }}>Gooner Client</div>
        <div className="nav-label" style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>{theme} mode</div>
      </div>
    </div>
    {items.map((i) => (
      <button key={i.id} className={`nav-item ${route === i.id ? 'active' : ''}`} aria-current={route === i.id ? 'page' : undefined} onClick={() => go(i.id)}>
        <span style={{ width: 20, textAlign: 'center' }}>{i.icon}</span>
        <span className="nav-label">{i.label}</span>
      </button>
    ))}
  </aside>
);
export default Sidebar;
