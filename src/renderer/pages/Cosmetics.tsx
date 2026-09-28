import React, { useState } from 'react';
import { Card, SectionTitle } from '../components/ui';
import type { Cosmetic } from '../gooner';

const seed: Cosmetic[] = [
  { id: 'c1', name: 'Ender Cape', category: 'cape', previewGradient: 'linear-gradient(135deg,#1c1c1e,#5e5ce6)', emoji: '🦇', equipped: true },
  { id: 'c2', name: 'Sunset Cape', category: 'cape', previewGradient: 'linear-gradient(135deg,#ff9f0a,#ff375f)', emoji: '🌅', equipped: false },
  { id: 'w1', name: 'Phantom Wings', category: 'wings', previewGradient: 'linear-gradient(135deg,#64d2ff,#0a84ff)', emoji: '🪽', equipped: false },
  { id: 'h1', name: 'Gooner Crown', category: 'hat', previewGradient: 'linear-gradient(135deg,#ffd60a,#ff9f0a)', emoji: '👑', equipped: false }
];

const Cosmetics: React.FC = () => {
  const [items, setItems] = useState<Cosmetic[]>(seed);
  const [filter, setFilter] = useState('all');
  const shown = items.filter((i) => filter === 'all' || i.category === filter);
  return (
    <div style={{ maxWidth: 860 }}>
      <SectionTitle>Cosmetics</SectionTitle>
      <p style={{ color: 'var(--text2)', margin: '0 0 12px' }}>Capes, wings, hats — live preview.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['all', 'cape', 'wings', 'hat'].map((c) => (
          <button key={c} className="btn-ghost" aria-pressed={filter === c} onClick={() => setFilter(c)} style={{ textTransform: 'capitalize', background: filter === c ? 'var(--text)' : undefined, color: filter === c ? 'var(--bg)' : undefined }}>{c}</button>
        ))}
      </div>
      <div className="grid3">
        {shown.map((c) => (
          <Card key={c.id} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ height: 130, background: c.previewGradient, display: 'grid', placeItems: 'center', fontSize: 56 }}>{c.emoji}</div>
            <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>{c.category}</div></div>
              <button className={c.equipped ? 'btn-ghost' : 'btn-primary'} onClick={() => { setItems((p) => p.map((x) => ({ ...x, equipped: x.category === c.category ? x.id === c.id : x.equipped }))); window.gooner?.equipCosmetic?.(c.id).catch(() => undefined); }}>{c.equipped ? 'Equipped ✓' : 'Equip'}</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
export default Cosmetics;
