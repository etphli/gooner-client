import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface AccountLike {
  id: string;
  minecraftUsername?: string;
  username?: string;
  name?: string;
  provider?: string;
}

type ExtGooner = {
  listAccounts?: () => Promise<unknown>;
  activeAccount?: () => Promise<unknown>;
  setActiveAccount?: (id: string) => Promise<unknown>;
  removeAccount?: (id: string) => Promise<unknown>;
};

const ACTIVE_KEY = 'gooner:activeAccount';

function asAccounts(v: unknown): AccountLike[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[]).filter((a) => a && typeof (a as { id?: unknown }).id === 'string').map((a) => ({
    id: String((a as { id: unknown }).id),
    minecraftUsername: typeof (a as { minecraftUsername?: unknown }).minecraftUsername === 'string' ? String((a as { minecraftUsername?: unknown }).minecraftUsername) : undefined,
    username: typeof (a as { username?: unknown }).username === 'string' ? String((a as { username?: unknown }).username) : undefined,
    name: typeof (a as { name?: unknown }).name === 'string' ? String((a as { name?: unknown }).name) : undefined,
    provider: typeof (a as { provider?: unknown }).provider === 'string' ? String((a as { provider?: unknown }).provider) : undefined,
  }));
}

export function displayName(a: AccountLike): string {
  return a.minecraftUsername ?? a.username ?? a.name ?? 'Player';
}

function initial(name: string): string {
  const t = name.trim();
  return t ? t[0]?.toUpperCase() ?? '?' : '?';
}

const ProfileMenu: React.FC<{ onAddAccount?: () => void; onAccountChange?: () => void }> = ({ onAddAccount, onAccountChange }) => {
  const [accounts, setAccounts] = useState<AccountLike[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ext = window.gooner as unknown as ExtGooner | undefined;
      const raw = await ext?.listAccounts?.();
      const list = asAccounts(raw);
      setAccounts(list);
      // Resolve active: prefer backend activeAccount(), else stored id, else first.
      let resolved: string | null = null;
      try {
        const act = await ext?.activeAccount?.();
        if (typeof act === 'string' && act) resolved = act;
        else if (act && typeof act === 'object' && typeof (act as { id?: unknown }).id === 'string') resolved = String((act as { id: unknown }).id);
      } catch { /* ignore — fall back to storage */ }
      if (!resolved) {
        try { resolved = localStorage.getItem(ACTIVE_KEY); } catch { resolved = null; }
      }
      if (!resolved || !list.some((a) => a.id === resolved)) resolved = list[0]?.id ?? null;
      setActiveId(resolved);
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open ]);

  const choose = async (id: string) => {
    try {
      const ext = window.gooner as unknown as ExtGooner | undefined;
      await ext?.setActiveAccount?.(id);
    } catch { /* fallback to local only */ }
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
    setActiveId(id);
    setOpen(false);
    onAccountChange?.();
  };

  const signOut = async (id: string) => {
    try {
      const ext = window.gooner as unknown as ExtGooner | undefined;
      await ext?.removeAccount?.(id);
    } catch { /* ignore */ }
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    const fallback = next[0]?.id ?? null;
    if (activeId === id) {
      setActiveId(fallback);
      try {
        if (fallback) localStorage.setItem(ACTIVE_KEY, fallback);
        else localStorage.removeItem(ACTIVE_KEY);
      } catch { /* ignore */ }
    }
    setOpen(false);
    onAccountChange?.();
  };

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const label = active ? displayName(active) : 'No account';

  return (
    <div className="profile-wrap" ref={wrapRef}>
      <button
        type="button"
        className="profile-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { void refresh(); setOpen((o) => !o); }}
        title={label}
      >
        <span className="avatar" aria-hidden>{initial(label)}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }} aria-hidden>▾</span>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Profile">
          <div className="menu-head">Switch account</div>
          {accounts.length === 0 && <div className="tiny muted" style={{ padding: '4px 9px 8px' }}>No accounts yet.</div>}
          {accounts.map((a) => (
            <button key={a.id} type="button" role="menuitemradio" aria-checked={a.id === activeId} className={`menu-item ${a.id === activeId ? 'active' : ''}`} onClick={() => void choose(a.id)}>
              <span className="avatar" style={{ width: 22, height: 22, fontSize: 11 }}>{initial(displayName(a))}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(a)}</span>
              {a.id === activeId && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓</span>}
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); onAddAccount?.(); }}>
            <span aria-hidden>＋</span><span>Add account</span>
          </button>
          {active && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut(active.id)}>
              <span aria-hidden>⎋</span><span>Sign out {displayName(active)}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
