import React, { useEffect, useState } from 'react';
import './styles.css';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Play from './pages/Play';
import Mods from './pages/Mods';
import Settings from './pages/Settings';
import Cosmetics from './pages/Cosmetics';
import Accounts from './pages/Accounts';

export type Route = 'play' | 'mods' | 'settings' | 'cosmetics' | 'accounts';
export type Theme = 'light' | 'dark' | 'system';

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>('play');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const s = localStorage.getItem('gooner:theme') as Theme | null;
      return s === 'light' || s === 'dark' || s === 'system' ? s : 'system';
    } catch { return 'system'; }
  });
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveTheme('system'));

  useEffect(() => {
    window.gooner?.getSettings().then((s) => {
      const th = (s as unknown as { theme?: string })?.theme;
      if (th === 'light' || th === 'dark' || th === 'system') setTheme(th as Theme);
    }).catch(() => undefined);
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

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar route={route} go={setRoute} theme={effective} />
        <main className="content">
          {route === 'play' && <Play />}
          {route === 'mods' && <Mods />}
          {route === 'settings' && <Settings theme={theme} setTheme={setTheme} />}
          {route === 'cosmetics' && <Cosmetics />}
          {route === 'accounts' && <Accounts />}
        </main>
      </div>
    </div>
  );
};
export default App;
