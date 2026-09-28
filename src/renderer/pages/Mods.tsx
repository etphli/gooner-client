import React, { useState } from 'react';
import { Badge, Card, SectionTitle, Toggle } from '../components/ui';
import type { ModInfo } from '../gooner';

const seed: ModInfo[] = [
  { id: 'sodium', name: 'Sodium', description: 'Modern rendering engine.', enabled: true, source: 'modrinth', installedVersion: '0.6.13', availableVersions: ['0.6.13', '0.5.8'], iconUrl: '' },
  { id: 'iris', name: 'Iris Shaders', description: 'Shader support for Sodium.', enabled: false, source: 'modrinth', installedVersion: '1.8.0', availableVersions: ['1.8.0'], iconUrl: '' },
  { id: 'lithium', name: 'Lithium', description: 'Game logic optimizations.', enabled: true, source: 'modrinth', installedVersion: '0.16.1', availableVersions: ['0.16.1'], iconUrl: '' }
];

const Mods: React.FC = () => {
  const [q, setQ] = useState('');
  const [mods, setMods] = useState<ModInfo[]>(seed);
  const filtered = mods.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ maxWidth: 820 }}>
      <SectionTitle>Mods</SectionTitle>
      <p style={{ color: 'var(--text2)', margin: '0 0 12px' }}>Toggle, pin versions, Modrinth / CurseForge aware. World Host / e4mc excluded.</p>
      <input className="input" placeholder="🔍  Search mods — sodium, iris…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {filtered.map((m) => (
          <Card key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{m.name}</strong><Badge source={m.source} /></div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{m.description}</div>
            </div>
            <Toggle checked={m.enabled} onChange={(v) => { setMods((p) => p.map((x) => x.id === m.id ? { ...x, enabled: v } : x)); window.gooner?.toggleMod?.(m.id, v).catch(() => undefined); }} />
          </Card>
        ))}
      </div>
    </div>
  );
};
export default Mods;
