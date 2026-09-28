// SPDX-License-Identifier: GPL-3.0-only
// Inspired by Polyfrost OneClient/OneConfig concepts. Original code.
import modpack from '../../../data/modpack.json' with { type: 'json' };

export type ModCategory = 'performance' | 'qol' | 'hud' | 'skyblock' | 'cosmetic';
export interface ModEntry {
  slug: string;
  project_id: string;
  name: string;
  category: ModCategory;
  version: string;
  required: boolean;
  defaultEnabled: boolean;
  side: 'client';
}

const BLOCKED = new Set<string>([
  ...(((modpack as unknown as { excludedWorldHosting: Array<{ slug: string }> }).excludedWorldHosting ?? []).map((e) => e.slug)),
  'world-host',
  'e4mc'
]);

export function loadEnabledMods(overrides: Record<string, boolean> = {}): ModEntry[] {
  for (const k of Object.keys(overrides)) {
    if (BLOCKED.has(k)) throw new Error(`Refused blocked mod: ${k}`);
  }
  return ((modpack as unknown as { mods: ModEntry[] }).mods ?? []).filter((m) => {
    if (BLOCKED.has(m.slug)) return false;
    if (m.side !== 'client') return false;
    return overrides[m.slug] ?? m.defaultEnabled;
  });
}

export function modrinthVersionUrl(slug: string, mcVersion = '1.21.1'): string {
  return `https://api.modrinth.com/v2/project/${slug}/version?loaders=${encodeURIComponent(JSON.stringify(['fabric']))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
}
