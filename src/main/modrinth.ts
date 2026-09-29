// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — main/modrinth.ts (Modrinth search + verified install helpers)
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry } from './net.js';
import { AuthError } from './auth/types.js';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const UA = { 'User-Agent': 'GoonerClient/1.0 (+macOS; contact: gooner-client)' } as const;

/** Hard blocklist — world-host / e4mc must never be installed. */
export const BLOCKED_MODS = new Set<string>(['world-host', 'e4mc']);

function unreachableErr(e: unknown): never {
  throw new AuthError(
    'NETWORK_ERROR',
    `Modrinth search unreachable (${e instanceof AuthError ? e.message.replace('Modrinth search: ', '') : String(e)}). ` +
      `On strict networks turn on Secure DNS or set a proxy in Settings → Network.`,
    { cause: e },
  );
}

export interface ModSearchItem {
  slug: string;
  title: string;
  description: string;
  iconUrl: string;
  downloads: number;
  clientSide: string;
}

export interface ModrinthVersionFile {
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
  files: ModrinthVersionFile[];
}

/**
 * Search Modrinth for Fabric mods (limit 25).
 * Facets: project_type:mod + loaders:fabric (+ versions:<mcVersion> when given).
 */
export async function searchMods(query: string, mcVersion?: string): Promise<ModSearchItem[]> {
  const q = typeof query === 'string' ? query : '';
  const facets: string[][] = [['project_type:mod'], ['loaders:fabric']];
  if (typeof mcVersion === 'string' && mcVersion.length > 0) {
    facets.push([`versions:${mcVersion}`]);
  }
  const url =
    `${MODRINTH_API}/search?query=${encodeURIComponent(q)}` +
    `&limit=25&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetchWithRetry(url, { headers: UA }, { label: 'Modrinth search', timeoutMs: 15000, retries: 2 }).catch(unreachableErr);
  if (!res.ok) throw new Error(`Modrinth search failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    hits?: Array<{
      slug: string;
      title: string;
      description?: string;
      icon_url?: string;
      downloads?: number;
      client_side?: string;
    }>;
  };
  return (data.hits ?? []).map((h) => ({
    slug: h.slug,
    title: h.title,
    description: h.description ?? '',
    iconUrl: h.icon_url ?? '',
    downloads: h.downloads ?? 0,
    clientSide: h.client_side ?? 'unknown',
  }));
}

/**
 * Search Modrinth for projects of a given type (limit 25).
 * Same shape as searchMods but facets project_type:<type> (default mod).
 * For 'mod' we keep the loaders:fabric facet; other types (shader,
 * resourcepack, datapack, modpack) omit it since they are not Fabric mods.
 */
export type ModrinthProjectType = 'mod' | 'shader' | 'resourcepack' | 'datapack' | 'modpack';

export type ModrinthSubdir = 'mods' | 'shaderpacks' | 'resourcepacks';

export async function searchProjects(
  query: string,
  mcVersion?: string,
  projectType: ModrinthProjectType = 'mod',
): Promise<ModSearchItem[]> {
  const q = typeof query === 'string' ? query : '';
  const type = (
    projectType === 'shader' ||
    projectType === 'resourcepack' ||
    projectType === 'datapack' ||
    projectType === 'modpack' ||
    projectType === 'mod'
      ? projectType
      : 'mod'
  ) as ModrinthProjectType;
  const facets: string[][] = [[`project_type:${type}`]];
  if (type === 'mod') facets.push(['loaders:fabric']);
  if (typeof mcVersion === 'string' && mcVersion.length > 0) {
    facets.push([`versions:${mcVersion}`]);
  }
  const url =
    `${MODRINTH_API}/search?query=${encodeURIComponent(q)}` +
    `&limit=25&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetchWithRetry(url, { headers: UA }, { label: 'Modrinth search', timeoutMs: 15000, retries: 2 }).catch(unreachableErr);
  if (!res.ok) throw new Error(`Modrinth search failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    hits?: Array<{
      slug: string;
      title: string;
      description?: string;
      icon_url?: string;
      downloads?: number;
      client_side?: string;
    }>;
  };
  return (data.hits ?? []).map((h) => ({
    slug: h.slug,
    title: h.title,
    description: h.description ?? '',
    iconUrl: h.icon_url ?? '',
    downloads: h.downloads ?? 0,
    clientSide: h.client_side ?? 'unknown',
  }));
}

/**
 * Install a Modrinth project into <instanceDir>/<subdir>/<slug>.jar (mods)
 * or <subdir>/<filename> for shaderpacks/resourcepacks.
 * Same verify+write flow as installModFile but destination subdir is
 * configurable. Keeps the BLOCKED_MODS check.
 */
export async function installProjectTo(
  instanceDir: string,
  slug: string,
  mcVersion: string,
  projectType: ModrinthProjectType = 'mod',
  subdir: ModrinthSubdir = 'mods',
): Promise<{ file: string; version: string }> {
  if (BLOCKED_MODS.has(slug)) throw new Error(`Refused blocked mod: ${slug}`);
  const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : '1.21.1';
  const type = (
    projectType === 'shader' ||
    projectType === 'resourcepack' ||
    projectType === 'datapack' ||
    projectType === 'modpack' ||
    projectType === 'mod'
      ? projectType
      : 'mod'
  ) as ModrinthProjectType;
  const destSubdir: ModrinthSubdir =
    subdir === 'shaderpacks' || subdir === 'resourcepacks' || subdir === 'mods' ? subdir : 'mods';
  // Mods resolve a Fabric build; shaders/packs omit the loaders filter.
  const loadersParam =
    type === 'mod'
      ? `?loaders=${encodeURIComponent(JSON.stringify(['fabric']))}` +
        `&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`
      : `?game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
  const url = `${MODRINTH_API}/project/${encodeURIComponent(slug)}/version${loadersParam}`;
  const res = await fetchWithRetry(url, { headers: UA }, { label: 'Modrinth', timeoutMs: 15000, retries: 2 });
  if (!res.ok) throw new Error(`Modrinth ${slug}: ${res.status}`);
  const versions = (await res.json()) as ModrinthVersion[];
  const ver = versions[0];
  if (!ver) throw new Error(`No version for ${slug} on ${mc}`);
  const files = ver.files ?? [];
  const fileMeta = files.find((f) => f.primary) ?? files[0];
  if (!fileMeta) throw new Error(`No files for ${slug}`);
  const expected = fileMeta.hashes?.sha512;
  if (!expected) throw new Error(`Missing sha512 for ${slug}`);
  const dl = await fetchWithRetry(fileMeta.url, { headers: UA }, { label: 'Mod download', timeoutMs: 60000, retries: 2 });
  if (!dl.ok || !dl.body) throw new Error(`mod download failed ${dl.status}: ${fileMeta.url}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  const actual = createHash('sha512').update(buf).digest('hex');
  if (actual !== expected) throw new Error(`sha512 mismatch for ${slug}`);
  const safeName = path.basename(fileMeta.filename || `${slug}.jar`);
  const fileName = destSubdir === 'mods' ? `${slug}.jar` : safeName || `${slug}.jar`;
  const dest = path.join(instanceDir, destSubdir, fileName);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  if (destSubdir === 'mods') {
    await fs.rm(`${dest}.disabled`, { force: true });
  }
  return { file: dest, version: ver.version_number ?? '' };
}

/**
 * Install a Modrinth project into <instanceDir>/mods/<slug>.jar.
 * Resolves latest Fabric version for mcVersion, sha512-verifies, writes file.
 */
export async function installModFile(
  instanceDir: string,
  slug: string,
  mcVersion: string,
): Promise<{ file: string; version: string }> {
  if (BLOCKED_MODS.has(slug)) throw new Error(`Refused blocked mod: ${slug}`);
  const mc = typeof mcVersion === 'string' && mcVersion.length > 0 ? mcVersion : '1.21.1';
  const url =
    `${MODRINTH_API}/project/${encodeURIComponent(slug)}/version` +
    `?loaders=${encodeURIComponent(JSON.stringify(['fabric']))}` +
    `&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
  const res = await fetchWithRetry(url, { headers: UA }, { label: 'Modrinth', timeoutMs: 15000, retries: 2 });
  if (!res.ok) throw new Error(`Modrinth ${slug}: ${res.status}`);
  const versions = (await res.json()) as ModrinthVersion[];
  const ver = versions[0];
  if (!ver) throw new Error(`No version for ${slug} on ${mc}`);
  const files = ver.files ?? [];
  const fileMeta = files.find((f) => f.primary) ?? files[0];
  if (!fileMeta) throw new Error(`No files for ${slug}`);
  const expected = fileMeta.hashes?.sha512;
  if (!expected) throw new Error(`Missing sha512 for ${slug}`);
  const dl = await fetchWithRetry(fileMeta.url, { headers: UA }, { label: 'Mod download', timeoutMs: 60000, retries: 2 });
  if (!dl.ok || !dl.body) throw new Error(`mod download failed ${dl.status}: ${fileMeta.url}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  const actual = createHash('sha512').update(buf).digest('hex');
  if (actual !== expected) throw new Error(`sha512 mismatch for ${slug}`);
  const dest = path.join(instanceDir, 'mods', `${slug}.jar`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  await fs.rm(`${dest}.disabled`, { force: true });
  return { file: dest, version: ver.version_number ?? '' };
}
