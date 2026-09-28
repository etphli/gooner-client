/*
 * Gooner Client — launcher/modpack.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Curated Modrinth modpack ("oneclient-modpack" style): ~40 performance /
 * visual / QoL Fabric mods. Downloads from Modrinth API with sha512 verify,
 * supports per-mod enable/disable (rename .jar <-> .jar.disabled).
 *
 * EXPLICITLY EXCLUDED (never added, blocked at sync time):
 *   - world-host (world-host) : unwanted P2P hosting / network exposure
 *   - e4mc (e4mc)             : third-party tunneling, not wanted by default
 * If these slugs ever appear in overrides they are refused.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const UA = { 'User-Agent': 'GoonerClient/1.0 (+macOS; contact: gooner-client)' } as const;

/** Hard blocklist — see header comment. */
export const BLOCKED_MODS = new Set(['world-host', 'e4mc']);

export interface CuratedMod {
  /** Modrinth project slug, e.g. 'sodium'. */
  slug: string;
  name: string;
  required: boolean;
  description: string;
}

/**
 * Curated list (~40). All Fabric-compatible, loader='fabric'.
 * Versions are resolved live from Modrinth for the instance's mcVersion,
 * so this list stays valid across MC updates.
 */
export const CURATED_MODS: CuratedMod[] = [
  { slug: 'sodium', name: 'Sodium', required: true, description: 'Modern rendering engine' },
  { slug: 'iris', name: 'Iris Shaders', required: false, description: 'Shaders + Sodium compat' },
  { slug: 'lithium', name: 'Lithium', required: true, description: 'Game logic optimizations' },
  { slug: 'ferrite-core', name: 'FerriteCore', required: true, description: 'Memory usage optimizations' },
  { slug: 'krypton', name: 'Krypton', required: true, description: 'Networking optimizations' },
  { slug: 'lazydfu', name: 'LazyDFU', required: true, description: 'Faster DFU init' },
  { slug: 'modernfix', name: 'ModernFix', required: true, description: 'Launch + memory fixes' },
  { slug: 'entityculling', name: 'EntityCulling', required: true, description: 'Skip hidden entities' },
  { slug: 'sodium-extra', name: 'Sodium Extra', required: false, description: 'Extra Sodium options' },
  { slug: 'reeses-sodium-options', name: "Reese's Sodium Options", required: false, description: 'Better Sodium GUI' },
  { slug: 'immediatelyfast', name: 'ImmediatelyFast', required: true, description: 'Immediate-mode UI batching' },
  { slug: 'fabric-api', name: 'Fabric API', required: true, description: 'Core Fabric library' },
  { slug: 'modmenu', name: 'Mod Menu', required: false, description: 'In-game mod list' },
  { slug: 'cloth-config', name: 'Cloth Config', required: true, description: 'Config library' },
  { slug: 'appleskin', name: 'AppleSkin', required: false, description: 'Food/hunger HUD' },
  { slug: 'roughly-enough-items', name: 'REI', required: false, description: 'Recipe viewer' },
  { slug: 'jade', name: 'Jade', required: false, description: 'Block/entity tooltip' },
  { slug: 'xaeros-minimap', name: "Xaero's Minimap", required: false, description: 'Minimap' },
  { slug: 'xaeros-world-map', name: "Xaero's World Map", required: false, description: 'Full world map' },
  { slug: 'litematica', name: 'Litematica', required: false, description: 'Schematic builder' },
  { slug: 'malilib', name: 'MaLiLib', required: false, description: 'Litematica dependency' },
  { slug: 'minihud', name: 'MiniHUD', required: false, description: 'Debug overlay shapes' },
  { slug: 'tweakeroo', name: 'Tweakeroo', required: false, description: 'Client tweaks' },
  { slug: 'replaymod', name: 'ReplayMod', required: false, description: 'Replay recording' },
  { slug: 'skinlayers3d', name: '3D Skin Layers', required: false, description: 'Rounded 3D skins' },
  { slug: 'c2me-fabric', name: 'C2ME', required: false, description: 'Concurrent chunk gen' },
  { slug: 'noisium', name: 'Noisium', required: true, description: 'Worldgen optimizations' },
  { slug: 'memoryleakfix', name: 'MemoryLeakFix', required: true, description: 'Vanilla leak fixes' },
  { slug: 'debugify', name: 'Debugify', required: false, description: 'Vanilla bug fixes' },
  { slug: 'farsight', name: 'Farsight', required: false, description: 'Extended render distance' },
  { slug: 'voicechat', name: 'Simple Voice Chat', required: false, description: 'Proximity voice' },
  { slug: 'distant-horizons', name: 'Distant Horizons', required: false, description: 'LOD terrain' },
  { slug: 'nochatreports', name: 'No Chat Reports', required: false, description: 'Strip chat signatures' },
  { slug: 'shulkerboxtooltip', name: 'Shulker Box Tooltip', required: false, description: 'Shulker preview' },
  { slug: 'inventory-profiles-next', name: 'Inventory Profiles Next', required: false, description: 'Inventory sorting' },
  { slug: 'lambdynamiclights', name: 'LambDynamicLights', required: false, description: 'Dynamic lights' },
  { slug: 'continuity', name: 'Continuity', required: false, description: 'Connected textures' },
  { slug: 'cit-resewn', name: 'CIT Resewn', required: false, description: 'Custom item textures' },
  { slug: 'puzzle', name: 'Puzzle', required: false, description: 'Puzzle library' },
  { slug: 'zoomify', name: 'Zoomify', required: false, description: 'Spyglass zoom any key' },
];

export interface ModrinthFile {
  hashes: { sha512: string; sha1: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  loaders: string[];
  game_versions: string[];
  files: ModrinthFile[];
}

export interface SyncModpackOptions {
  instanceDir: string;
  mcVersion: string;
  /** slug -> enabled. Absent = curated default (required=true => on). */
  overrides?: Record<string, boolean>;
  onProgress?: (msg: string) => void;
}

export interface SyncResult {
  installed: string[];
  updated: string[];
  disabled: string[];
  skipped: string[];
}

async function fetchModrinthVersion(slug: string, mcVersion: string): Promise<ModrinthVersion | null> {
  if (BLOCKED_MODS.has(slug)) throw new Error(`Refused blocked mod: ${slug}`);
  const url =
    `${MODRINTH_API}/project/${encodeURIComponent(slug)}/version` +
    `?loaders=${encodeURIComponent(JSON.stringify(['fabric']))}` +
    `&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
  const res = await fetch(url, { headers: UA });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Modrinth ${slug}: ${res.status}`);
  const versions = (await res.json()) as ModrinthVersion[];
  return versions[0] ?? null;
}

async function sha512Of(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  return createHash('sha512').update(buf).digest('hex');
}

async function downloadVerified(url: string, dest: string, expectedSha512: string): Promise<'fresh' | 'cached'> {
  try {
    const st = await fs.stat(dest).catch(() => null);
    if (st && st.size > 0 && (await sha512Of(dest)) === expectedSha512) return 'cached';
  } catch { /* re-download */ }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: UA });
  if (!res.ok || !res.body) throw new Error(`mod download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha512').update(buf).digest('hex');
  if (actual !== expectedSha512) throw new Error(`sha512 mismatch for ${dest}`);
  await fs.writeFile(dest, buf);
  return 'fresh';
}

/** mods/<slug>.jar inside the instance. Disabled = <slug>.jar.disabled */
export function modPaths(instanceDir: string, slug: string): { enabled: string; disabled: string } {
  return {
    enabled: path.join(instanceDir, 'mods', `${slug}.jar`),
    disabled: path.join(instanceDir, 'mods', `${slug}.jar.disabled`),
  };
}

/**
 * Sync the curated pack into an instance: download pinned files, sha512-verify,
 * apply enable/disable overrides, and purge blocked mods if present.
 */
export async function syncModpack(opts: SyncModpackOptions): Promise<SyncResult> {
  const { instanceDir, mcVersion, overrides = {}, onProgress } = opts;
  for (const k of Object.keys(overrides)) {
    if (BLOCKED_MODS.has(k)) throw new Error(`Refused blocked mod: ${k}`);
  }
  const log = onProgress ?? (() => {});
  const modsDir = path.join(instanceDir, 'mods');
  await fs.mkdir(modsDir, { recursive: true });

  // Purge blocklist unconditionally (world-host / e4mc must never ship).
  for (const blocked of BLOCKED_MODS) {
    const { enabled, disabled } = modPaths(instanceDir, blocked);
    await fs.rm(enabled, { force: true });
    await fs.rm(disabled, { force: true });
  }

  const result: SyncResult = { installed: [], updated: [], disabled: [], skipped: [] };

  for (const mod of CURATED_MODS) {
    const wantEnabled = overrides[mod.slug] ?? mod.required ?? true;
    const { enabled, disabled } = modPaths(instanceDir, mod.slug);

    if (!wantEnabled) {
      // Move to .disabled if present.
      try {
        await fs.rename(enabled, disabled);
      } catch { /* already disabled/absent */ }
      result.disabled.push(mod.slug);
      continue;
    }

    const ver = await fetchModrinthVersion(mod.slug, mcVersion).catch((e) => {
      log(`skip ${mod.slug}: ${(e as Error).message}`);
      return null;
    });
    if (!ver) {
      result.skipped.push(mod.slug);
      continue;
    }
    const file = ver.files.find((f) => f.primary) ?? ver.files[0];
    if (!file) {
      result.skipped.push(mod.slug);
      continue;
    }
    // If a disabled copy exists, re-enable by removing it after fresh download.
    await fs.rm(disabled, { force: true });
    log(`mod ${mod.slug} ${ver.version_number}…`);
    const state = await downloadVerified(file.url, enabled, file.hashes.sha512);
    (state === 'fresh' ? result.installed : result.updated).push(mod.slug);
  }
  return result;
}

export async function enableMod(instanceDir: string, slug: string): Promise<void> {
  if (BLOCKED_MODS.has(slug)) throw new Error(`Refused blocked mod: ${slug}`);
  const { enabled, disabled } = modPaths(instanceDir, slug);
  await fs.rename(disabled, enabled);
}

export async function disableMod(instanceDir: string, slug: string): Promise<void> {
  const { enabled, disabled } = modPaths(instanceDir, slug);
  await fs.rename(enabled, disabled);
}

export interface InstalledMod {
  slug: string;
  enabled: boolean;
  file: string;
  size: number;
}

export async function listInstalledMods(instanceDir: string): Promise<InstalledMod[]> {
  const modsDir = path.join(instanceDir, 'mods');
  const entries = await fs.readdir(modsDir).catch(() => [] as string[]);
  const out: InstalledMod[] = [];
  for (const e of entries) {
    const enabled = e.endsWith('.jar');
    const disabled = e.endsWith('.jar.disabled');
    if (!enabled && !disabled) continue;
    const slug = e.replace(/\.jar(\.disabled)?$/, '');
    if (BLOCKED_MODS.has(slug)) continue;
    const file = path.join(modsDir, e);
    const st = await fs.stat(file).catch(() => null);
    out.push({ slug, enabled, file, size: st?.size ?? 0 });
  }
  return out;
}
