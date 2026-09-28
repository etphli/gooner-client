import React, { useCallback, useEffect, useState } from 'react';
import './styles.css';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ProfileMenu from './components/ProfileMenu';
import Play from './pages/Play';
import Mods from './pages/Mods';
import Settings from './pages/Settings';
import Cosmetics from './pages/Cosmetics';
import Accounts from './pages/Accounts';
import Onboarding from './pages/Onboarding';

export type Route = 'play' | 'mods' | 'settings' | 'cosmetics' | 'accounts';
export type Theme = 'light' | 'dark' | 'system';

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ONBOARDED_KEY = 'gooner:onboarded';

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>('play');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const s = localStorage.getItem('gooner:theme') as Theme | null;
      return s === 'light' || s === 'dark' || s === 'system' ? s : 'system';
    } catch { return 'system'; }
  });
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveTheme('system'));
  const [accountsCount, setAccountsCount] = useState(0);
  const [checking, setChecking] = useState(true);

  const refreshAccounts = useCallback(async (): Promise<number> => {
    try {
      const raw = await (window.gooner as unknown as { listAccounts?: () => Promise<unknown> } | undefined)?.listAccounts?.();
      const n = Array.isArray(raw) ? raw.length : 0;
      setAccountsCount(n);
      return n;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setChecking(true);
      const n = await refreshAccounts();
      if (!alive) return;
      // If accounts exist but flag missing, heal the flag (still show main UI).
      if (n >= 1) {
        try {
          if (!localStorage.getItem(ONBOARDED_KEY)) localStorage.setItem(ONBOARDED_KEY, '1');
        } catch { /* ignore */ }
      }
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [refreshAccounts]);

  useEffect(() => {
    window.gooner?.getSettings?.()?.then((s) => {
      const th = (s as unknown as { theme?: string })?.theme;
      if (th === 'light' || th === 'dark' || th === 'system') setTheme(th as Theme);
    })?.catch(() => undefined);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('gooner:theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const apply = () => setEffective(resolveTheme(theme));
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effective);
  }, [effective]);

  const handleOnboarded = useCallback(async () => {
    try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* ignore */ }
    await refreshAccounts();
  }, [refreshAccounts]);

  // Gate main UI until >=1 account (flag alone is not enough).
  const showOnboarding = !checking && accountsCount < 1;

  if (checking) {
    return (
      <div className="app-shell">
        <TitleBar title="Gooner Client" />
        <div className="onboard-shell">
          <div className="tiny muted">Checking accounts…</div>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="app-shell">
        <TitleBar title="Gooner Client — Setup" />
        <Onboarding onDone={() => void handleOnboarded()} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TitleBar
        title="Gooner Client"
        right={<ProfileMenu onAddAccount={() => setRoute('accounts')} onAccountChange={() => void refreshAccounts()} />}
      />
      <div className="app-body">
        <Sidebar route={route} go={setRoute} theme={effective} />
        <main className="content">
          {route === 'play' && <Play />}
          {route === 'mods' && <Mods />}
          {route === 'settings' && <Settings theme={theme} setTheme={setTheme} />}
          {route === 'cosmetics' && <Cosmetics />}
          {route === 'accounts' && <Accounts onAccountsChange={() => void refreshAccounts()} />}
        </main>
      </div>
    </div>
  );
};
export default App;
