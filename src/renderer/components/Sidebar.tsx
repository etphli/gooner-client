import React, { useEffect, useState } from 'react';
import type { Route } from '../App';

function Icon({ d, fill }: { d: string; fill?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const sections: { title: string; items: { id: Route; label: string; icon: React.ReactNode; hint: string }[] }[] = [
  {
    title: 'Play',
    items: [{ id: 'play', label: 'Play', hint: 'Launch the game', icon: <Icon fill d="M7 4.5v15l13-7.5z" /> }],
  },
  {
    title: 'Library',
    items: [
      { id: 'mods', label: 'Mods', hint: 'Browse and manage mods', icon: <Icon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
      { id: 'cosmetics', label: 'Cosmetics', hint: 'Capes, wings and more', icon: <Icon d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" /> },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'settings', label: 'Settings', hint: 'Memory, Java, updates', icon: <Icon d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" /> },
      { id: 'accounts', label: 'Accounts', hint: 'Sign-ins', icon: <Icon d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /> },
    ],
  },
];

const Sidebar: React.FC<{ route: Route; go: (r: Route) => void }> = ({ route, go }) => {
  const [version, setVersion] = useState('');
  useEffect(() => {
    (window.gooner as unknown as { getVersion?: () => Promise<string> } | undefined)?.getVersion?.()
      ?.then((v) => { if (typeof v === 'string') setVersion(v); })
      ?.catch(() => undefined);
  }, []);

  return (
    <aside className="sidebar" aria-label="Primary">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 12px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2563eb,#9333ea)', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>G</div>
        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
          <div className="nav-label" style={{ fontWeight: 700, fontSize: 13 }}>Gooner Client</div>
          <div className="nav-label tiny muted">Minecraft launcher</div>
        </div>
      </div>
      {sections.map((s) => (
        <nav key={s.title} aria-label={s.title}>
          <div className="nav-section">{s.title}</div>
          {s.items.map((i) => (
            <button
              key={i.id}
              className={`nav-item ${route === i.id ? 'active' : ''}`}
              aria-current={route === i.id ? 'page' : undefined}
              title={i.hint}
              onClick={() => go(i.id)}
            >
              {i.icon}
              <span className="nav-label">{i.label}</span>
            </button>
          ))}
        </nav>
      ))}
      <div style={{ marginTop: 'auto', padding: '10px 8px 2px' }} className="side-meta">
        <div className="tiny muted mono">{version ? `v${version}` : ' '}</div>
      </div>
    </aside>
  );
};
export default Sidebar;
