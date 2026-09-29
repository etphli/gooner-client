import React, { useEffect, useState } from 'react';
import { Card, SectionTitle } from '../components/ui';
import catalogJson from '../../../data/cosmetics.json' with { type: 'json' };

interface CatalogEntry {
  id: string;
  name: string;
  price: number;
  rarity: string;
  animated?: boolean;
  slot?: string;
}

type CategoryKey = 'capes' | 'wings' | 'hats' | 'boots' | 'backs' | 'shoulders' | 'auras';

const CATEGORY_KEYS: CategoryKey[] = ['capes', 'wings', 'hats', 'boots', 'backs', 'shoulders', 'auras'];

// Single source of truth: data/cosmetics.json (reviewed catalog, 63 items).
const CATALOG: Record<CategoryKey, CatalogEntry[]> = (() => {
  const cats = (catalogJson as { categories?: Record<string, unknown> }).categories ?? {};
  const out = {} as Record<CategoryKey, CatalogEntry[]>;
  for (const k of CATEGORY_KEYS) {
    const arr = Array.isArray(cats[k]) ? (cats[k] as Array<Record<string, unknown>>) : [];
    out[k] = arr
      .filter((e) => typeof e?.id === 'string' && typeof e?.name === 'string')
      .map((e) => ({
        id: String(e.id),
        name: String(e.name),
        price: typeof e.price === 'number' ? e.price : 0,
        rarity: typeof e.rarity === 'string' ? String(e.rarity) : 'common',
        ...(typeof e.animated === 'boolean' ? { animated: e.animated as boolean } : {}),
        ...(typeof e.slot === 'string' ? { slot: String(e.slot) } : {}),
      }));
  }
  return out;
})();

const EMOJI: Record<string, string> = {
  evergreen_2024: '🌲',
  gooner_gold: '🪙',
  midnight_banner: '🌙',
  lava_drip: '🌋',
  frostbite: '❄️',
  galaxy_weave: '🌌',
  pirate_jack: '🏴‍☠️',
  melon_slice: '🍉',
  void_walker: '🕳️',
  ender_dragon: '🐉',
  angel_feather: '🪽',
  demon_bat: '🦇',
  fairy_gossamer: '🧚',
  ice_shard: '🧊',
  phoenix_flame: '🔥',
  steampunk_cog: '⚙️',
  butterfly_monarch: '🦋',
  shadow_raven: '🐦‍⬛',
  top_hat: '🎩',
  gooner_crown: '👑',
  wizard_pointy: '🧙',
  viking_horned: '🪖',
  pirate_tricorn: '🏴‍☠️',
  frog_beanie: '🐸',
  astronaut_helmet: '🧑‍🚀',
  samurai_kabuto: '⛩️',
  taco_hat: '🌮',
  slime_boots: '🟢',
  lava_striders: '🌋',
  frost_walkers: '❄️',
  rocket_sneakers: '🚀',
  cowboy_spurs: '🤠',
  ninja_tabis: '🥷',
  disco_platforms: '🪩',
  cloud_hoppers: '☁️',
  obsidian_stompers: '🪨',
  backpack_evergreen: '🎒',
  ender_rucksack: '🎒',
  jetpack_mk2: '🚀',
  turtle_shell: '🐢',
  treasure_chest: '🧰',
  pizza_box: '🍕',
  guitar_case: '🎸',
  dragon_egg_satchel: '🥚',
  camping_pack: '🏕️',
  parrot_perch: '🦜',
  mini_golem: '🗿',
  baby_axolotl: '🦎',
  crow_familiar: '🐦‍⬛',
  lantern_sprite: '🏮',
  chipmunk_buddy: '🐿️',
  snow_owl: '🦉',
  ember_imp: '👺',
  clockwork_drone: '🤖',
  soul_flame: '🔥',
  heart_sparkles: '💖',
  lightning_crackle: '⚡',
  cherry_blossom: '🌸',
  bubblegum_pop: '🫧',
  starfall: '🌠',
  toxic_plume: '☣️',
  rainbow_trail: '🌈',
  midnight_moths: '🦋',
};

const CATEGORY_FALLBACK_EMOJI: Record<CategoryKey, string> = {
  capes: '🦸',
  wings: '🪽',
  hats: '🎩',
  boots: '🥾',
  backs: '🎒',
  shoulders: '🦜',
  auras: '✨',
};

function gradientFor(rarity: string): string {
  switch (rarity) {
    case 'common':
      return 'linear-gradient(135deg,#3a3a3c,#636366)';
    case 'uncommon':
      return 'linear-gradient(135deg,#30d158,#64d2ff)';
    case 'rare':
      return 'linear-gradient(135deg,#0a84ff,#64d2ff)';
    case 'epic':
      return 'linear-gradient(135deg,#5e5ce6,#bf5af2)';
    case 'legendary':
      return 'linear-gradient(135deg,#ffd60a,#ff375f)';
    default:
      return 'linear-gradient(135deg,#48484a,#8e8e93)';
  }
}

function emojiFor(id: string, cat: CategoryKey): string {
  return EMOJI[id] ?? CATEGORY_FALLBACK_EMOJI[cat];
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'common':
      return 'var(--text2)';
    case 'uncommon':
      return 'var(--green)';
    case 'rare':
      return '#0a84ff';
    case 'epic':
      return '#bf5af2';
    case 'legendary':
      return '#ff9f0a';
    default:
      return 'var(--text2)';
  }
}

const Cosmetics: React.FC = () => {
  const [username, setUsername] = useState('Steve');
  const [accountLoading, setAccountLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | CategoryKey>('all');
  // Equip = local state only (per category, one equipped each).
  const [equipped, setEquipped] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const acc = await window.gooner?.activeAccount?.();
        if (!cancelled && acc?.minecraftUsername) setUsername(acc.minecraftUsername);
      } catch {
        /* keep default Steve */
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = username.trim();
  const effectiveName = trimmed.length > 0 ? trimmed : 'Steve';
  const skinName = imgFailed ? 'Steve' : effectiveName;
  const skinSrc = `https://minotar.net/armor/body/${encodeURIComponent(skinName)}/180.png`;

  const allItems = CATEGORY_KEYS.flatMap((cat) => CATALOG[cat].map((e) => ({ ...e, category: cat })));
  const shown = filter === 'all' ? allItems : allItems.filter((i) => i.category === filter);
  const equippedItems = allItems.filter((i) => equipped[i.category] === i.id);

  const toggleEquip = (category: CategoryKey, id: string): void => {
    setEquipped((prev) => {
      if (prev[category] === id) {
        const next = { ...prev };
        delete next[category];
        return next;
      }
      return { ...prev, [category]: id };
    });
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <SectionTitle>Cosmetics</SectionTitle>
      <p style={{ color: 'var(--text2)', margin: '0 0 12px' }}>
        Capes, wings, hats, boots, backs, shoulders, auras — live skin preview. {allItems.length} items.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left: skin viewer */}
        <Card style={{ padding: 14, position: 'relative', overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Skin preview</h3>
          <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
            Minecraft username
            <input
              className="input"
              value={username}
              maxLength={16}
              onChange={(e) => {
                setUsername(e.target.value);
                setImgFailed(false);
              }}
              placeholder="Steve"
              aria-label="Preview username"
              style={{ marginTop: 4 }}
            />
          </label>
          {accountLoading ? (
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 8px' }}>Loading active account…</p>
          ) : null}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--card-2)',
              display: 'grid',
              placeItems: 'center',
              minHeight: 220,
              padding: 12,
              overflow: 'hidden',
            }}
          >
            <img
              src={skinSrc}
              alt={`Skin preview for ${skinName}`}
              width={180}
              height={180}
              loading="lazy"
              draggable={false}
              onError={() => setImgFailed(true)}
              style={{ width: 180, height: 180, objectFit: 'contain', imageRendering: 'pixelated' }}
            />
            {equippedItems.length > 0 ? (
              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {equippedItems.map((it) => (
                  <div
                    key={`${it.category}:${it.id}`}
                    title="Approximation badge — cosmetic overlay is an approximation, not in-game render"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid var(--border)',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 16 }}>{emojiFor(it.id, it.category as CategoryKey)}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                    <span
                      className="mono"
                      style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 400, opacity: 0.85, flexShrink: 0 }}
                    >
                      preview
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <p className="mono" style={{ fontSize: 11, color: 'var(--text2)', margin: '8px 0 0' }}>
            minotar armor/body • approximation badge — preview only, not in-game render
          </p>
          {equippedItems.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: '8px 0 0' }}>Equip a cosmetic to see its badge overlaid here.</p>
          ) : null}
        </Card>

        {/* Right: catalog */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['all', ...CATEGORY_KEYS] as const).map((c) => (
              <button
                key={c}
                className="btn-ghost"
                aria-pressed={filter === c}
                onClick={() => setFilter(c)}
                style={{
                  textTransform: 'capitalize',
                  background: filter === c ? 'var(--text)' : undefined,
                  color: filter === c ? 'var(--bg)' : undefined,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>No cosmetics in this category yet.</p>
          ) : (
            <div className="grid3">
              {shown.map((c) => {
                const isEquipped = equipped[c.category] === c.id;
                return (
                  <Card key={c.id} style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: 130,
                        background: gradientFor(c.rarity),
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 56,
                      }}
                    >
                      <span aria-hidden>{emojiFor(c.id, c.category as CategoryKey)}</span>
                    </div>
                    <div style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>
                            {c.category} • <span style={{ color: rarityColor(c.rarity), fontWeight: 700 }}>{c.rarity}</span>
                            {' • '}
                            <span className="mono">{c.price} ⛁</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <button
                          className={isEquipped ? 'btn-ghost' : 'btn-primary'}
                          onClick={() => toggleEquip(c.category as CategoryKey, c.id)}
                        >
                          {isEquipped ? 'Equipped ✓' : 'Equip'}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Cosmetics;
