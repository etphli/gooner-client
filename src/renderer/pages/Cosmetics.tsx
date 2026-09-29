import React, { useEffect, useState } from 'react';
import { Card, SectionTitle } from '../components/ui';

interface CatalogEntry {
  id: string;
  name: string;
  price: number;
  rarity: string;
  animated?: boolean;
  slot?: string;
}

type CategoryKey = 'capes' | 'wings' | 'hats' | 'boots' | 'backs' | 'shoulders' | 'auras';

const CATALOG: Record<CategoryKey, CatalogEntry[]> = {
  capes: [
    { id: 'evergreen_2024', name: 'Evergreen Cape', price: 0, rarity: 'common' },
    { id: 'gooner_gold', name: 'Gooner Gold', price: 500, rarity: 'rare' },
    { id: 'midnight_banner', name: 'Midnight Banner', price: 750, rarity: 'rare' },
    { id: 'lava_drip', name: 'Lava Drip Cape', price: 1200, rarity: 'epic' },
    { id: 'frostbite', name: 'Frostbite Cloak', price: 900, rarity: 'rare' },
    { id: 'galaxy_weave', name: 'Galaxy Weave', price: 2000, rarity: 'legendary' },
    { id: 'pirate_jack', name: 'Pirate Jack Flag', price: 650, rarity: 'uncommon' },
    { id: 'melon_slice', name: 'Melon Slice Cape', price: 350, rarity: 'common' },
    { id: 'void_walker', name: 'Void Walker Shroud', price: 2500, rarity: 'legendary' },
  ],
  wings: [
    { id: 'ender_dragon', name: 'Ender Wings', price: 1200, rarity: 'epic', animated: true },
    { id: 'angel_feather', name: 'Angel Feather Wings', price: 800, rarity: 'rare' },
    { id: 'demon_bat', name: 'Demon Bat Wings', price: 1100, rarity: 'epic' },
    { id: 'fairy_gossamer', name: 'Fairy Gossamer', price: 600, rarity: 'uncommon', animated: true },
    { id: 'ice_shard', name: 'Ice Shard Wings', price: 950, rarity: 'rare' },
    { id: 'phoenix_flame', name: 'Phoenix Flame Wings', price: 2200, rarity: 'legendary', animated: true },
    { id: 'steampunk_cog', name: 'Steampunk Cog Glider', price: 1300, rarity: 'epic' },
    { id: 'butterfly_monarch', name: 'Monarch Butterfly', price: 450, rarity: 'common', animated: true },
    { id: 'shadow_raven', name: 'Shadow Raven Wings', price: 1800, rarity: 'legendary' },
  ],
  hats: [
    { id: 'top_hat', name: 'Top Hat', price: 300, rarity: 'common', slot: 'head' },
    { id: 'gooner_crown', name: 'Gooner Crown', price: 1500, rarity: 'legendary', slot: 'head' },
    { id: 'wizard_pointy', name: 'Wizard Pointy Hat', price: 700, rarity: 'rare', slot: 'head' },
    { id: 'viking_horned', name: 'Horned Viking Helm', price: 850, rarity: 'rare', slot: 'head' },
    { id: 'pirate_tricorn', name: 'Pirate Tricorn', price: 550, rarity: 'uncommon', slot: 'head' },
    { id: 'frog_beanie', name: 'Frog Beanie', price: 250, rarity: 'common', slot: 'head' },
    { id: 'astronaut_helmet', name: 'Astronaut Helmet', price: 1400, rarity: 'epic', slot: 'head' },
    { id: 'samurai_kabuto', name: 'Samurai Kabuto', price: 1600, rarity: 'epic', slot: 'head' },
    { id: 'taco_hat', name: 'Taco Party Hat', price: 400, rarity: 'uncommon', slot: 'head' },
  ],
  boots: [
    { id: 'slime_boots', name: 'Slime Boots', price: 400, rarity: 'rare', slot: 'feet' },
    { id: 'lava_striders', name: 'Lava Striders', price: 1100, rarity: 'epic', slot: 'feet' },
    { id: 'frost_walkers', name: 'Frost Walker Boots', price: 800, rarity: 'rare', slot: 'feet' },
    { id: 'rocket_sneakers', name: 'Rocket Sneakers', price: 1500, rarity: 'epic', slot: 'feet' },
    { id: 'cowboy_spurs', name: 'Cowboy Spurs', price: 350, rarity: 'common', slot: 'feet' },
    { id: 'ninja_tabis', name: 'Ninja Tabis', price: 650, rarity: 'uncommon', slot: 'feet' },
    { id: 'disco_platforms', name: 'Disco Platforms', price: 900, rarity: 'rare', slot: 'feet', animated: true },
    { id: 'cloud_hoppers', name: 'Cloud Hoppers', price: 2000, rarity: 'legendary', slot: 'feet' },
    { id: 'obsidian_stompers', name: 'Obsidian Stompers', price: 1750, rarity: 'legendary', slot: 'feet' },
  ],
  backs: [
    { id: 'backpack_evergreen', name: 'Evergreen Pack', price: 600, rarity: 'rare', slot: 'back' },
    { id: 'ender_rucksack', name: 'Ender Rucksack', price: 1000, rarity: 'epic', slot: 'back' },
    { id: 'jetpack_mk2', name: 'Jetpack MK-2', price: 2400, rarity: 'legendary', slot: 'back' },
    { id: 'turtle_shell', name: 'Turtle Shell', price: 300, rarity: 'common', slot: 'back' },
    { id: 'treasure_chest', name: 'Treasure Chest', price: 1300, rarity: 'epic', slot: 'back' },
    { id: 'pizza_box', name: 'Pizza Delivery Box', price: 450, rarity: 'uncommon', slot: 'back' },
    { id: 'guitar_case', name: 'Guitar Case', price: 750, rarity: 'rare', slot: 'back' },
    { id: 'dragon_egg_satchel', name: 'Dragon Egg Satchel', price: 2100, rarity: 'legendary', slot: 'back' },
    { id: 'camping_pack', name: 'Camping Pack', price: 500, rarity: 'common', slot: 'back' },
  ],
  shoulders: [
    { id: 'parrot_perch', name: 'Parrot Perch', price: 800, rarity: 'epic', slot: 'shoulder' },
    { id: 'mini_golem', name: 'Mini Golem Buddy', price: 950, rarity: 'rare', slot: 'shoulder' },
    { id: 'baby_axolotl', name: 'Baby Axolotl', price: 700, rarity: 'rare', slot: 'shoulder', animated: true },
    { id: 'crow_familiar', name: 'Crow Familiar', price: 1100, rarity: 'epic', slot: 'shoulder' },
    { id: 'lantern_sprite', name: 'Lantern Sprite', price: 500, rarity: 'uncommon', slot: 'shoulder', animated: true },
    { id: 'chipmunk_buddy', name: 'Chipmunk Buddy', price: 250, rarity: 'common', slot: 'shoulder' },
    { id: 'snow_owl', name: 'Snow Owl', price: 850, rarity: 'rare', slot: 'shoulder' },
    { id: 'ember_imp', name: 'Ember Imp', price: 1600, rarity: 'legendary', slot: 'shoulder', animated: true },
    { id: 'clockwork_drone', name: 'Clockwork Drone', price: 1900, rarity: 'legendary', slot: 'shoulder' },
  ],
  auras: [
    { id: 'soul_flame', name: 'Soul Flame Aura', price: 1500, rarity: 'legendary', animated: true },
    { id: 'heart_sparkles', name: 'Heart Sparkles', price: 400, rarity: 'common', animated: true },
    { id: 'lightning_crackle', name: 'Lightning Crackle', price: 1200, rarity: 'epic', animated: true },
    { id: 'cherry_blossom', name: 'Cherry Blossom Drift', price: 900, rarity: 'rare', animated: true },
    { id: 'bubblegum_pop', name: 'Bubblegum Pop', price: 550, rarity: 'uncommon', animated: true },
    { id: 'starfall', name: 'Starfall Shimmer', price: 1800, rarity: 'legendary', animated: true },
    { id: 'toxic_plume', name: 'Toxic Plume', price: 1000, rarity: 'epic', animated: true },
    { id: 'rainbow_trail', name: 'Rainbow Trail', price: 2000, rarity: 'legendary', animated: true },
    { id: 'midnight_moths', name: 'Midnight Moths', price: 750, rarity: 'rare', animated: true },
  ],
};

const CATEGORY_KEYS: CategoryKey[] = ['capes', 'wings', 'hats', 'boots', 'backs', 'shoulders', 'auras'];

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
