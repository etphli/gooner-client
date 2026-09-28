/*
 * Gooner Client — launcher/minecraft.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Mojang version manifests (piston-meta.mojang.com) + Fabric loader
 * (meta.fabricmc.net) resolution, asset/library download, and `spawn`
 * based game launch with --username --uuid --accessToken.
 *
 * macOS-first: classpath separator ':', natives for macos-arm64/macos.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureJavaForMinecraft } from './java.js';
import { loadSettings, ramJvmArgs } from './settings.js';

// ---------------------------------------------------------------- types

export interface VersionManifestEntry {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionManifestEntry[];
}

export interface MojangRule {
  action: 'allow' | 'disallow';
  os?: { name?: string; arch?: string };
  features?: Record<string, boolean>;
}

export interface VersionJson {
  id: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: { game: (string | { value: string | string[]; rules: MojangRule[] })[]; jvm: (string | { value: string | string[]; rules: MojangRule[] })[] };
  assetIndex: { id: string; sha1: string; url: string; totalSize: number };
  assets: string;
  downloads: { client: { sha1: string; size: number; url: string } };
  libraries: MojangLibrary[];
  logging?: { client: { argument: string; file: { id: string; sha1: string; url: string } } };
  javaVersion?: { majorVersion: number };
}

export interface MojangLibrary {
  name: string; // group:artifact:version[:classifier]
  downloads?: {
    artifact?: { path: string; sha1: string; size: number; url: string };
    classifiers?: Record<string, { path: string; sha1: string; size: number; url: string }>;
  };
  rules?: MojangRule[];
  natives?: Record<string, string>;
}

export interface FabricLoaderEntry {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

export interface OfflineAccount {
  username: string;
  uuid: string; // dashed or undashed
  accessToken: string; // '0' for offline
}

export interface LaunchRequest {
  /** e.g. '1.20.1' */
  mcVersion: string;
  modLoader: 'vanilla' | 'fabric';
  loaderVersion?: string; // required when fabric
  account: OfflineAccount;
  instanceDir: string; // --gameDir
  dataDir?: string;
  extraJvmArgs?: string[];
  extraGameArgs?: string[];
  onLog?: (line: string) => void;
}

const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_META = 'https://meta.fabricmc.net/v2';
const UA = { 'User-Agent': 'GoonerClient/1.0 (+macOS)' } as const;

// ------------------------------------------------------- manifest fetch

let manifestCache: { at: number; value: VersionManifest } | null = null;

export async function fetchVersionManifest(force = false): Promise<VersionManifest> {
  if (manifestCache && !force && Date.now() - manifestCache.at < 10 * 60_000) {
    return manifestCache.value;
  }
  const res = await fetch(MOJANG_MANIFEST, { headers: UA });
  if (!res.ok) throw new Error(`version_manifest failed: ${res.status}`);
  const value = (await res.json()) as VersionManifest;
  manifestCache = { at: Date.now(), value };
  return value;
}

export async function listMcVersions(type: 'release' | 'all' = 'release'): Promise<string[]> {
  const m = await fetchVersionManifest();
  return m.versions.filter((v) => (type === 'all' ? true : v.type === 'release')).map((v) => v.id);
}

export async function fetchVersionJson(mcVersion: string): Promise<VersionJson> {
  const manifest = await fetchVersionManifest();
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Unknown Minecraft version: ${mcVersion}`);
  const res = await fetch(entry.url, { headers: UA });
  if (!res.ok) throw new Error(`version json failed: ${res.status}`);
  return (await res.json()) as VersionJson;
}

// ------------------------------------------------------- fabric loader

export async function getFabricLoaders(mcVersion: string): Promise<FabricLoaderEntry[]> {
  const res = await fetch(`${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`, { headers: UA });
  if (!res.ok) throw new Error(`fabric loader list failed: ${res.status}`);
  return (await res.json()) as FabricLoaderEntry[];
}

export async function getLatestFabricLoader(mcVersion: string): Promise<string> {
  const loaders = await getFabricLoaders(mcVersion);
  const stable = loaders.find((l) => l.stable) ?? loaders[0];
  if (!stable) throw new Error(`No Fabric loader for ${mcVersion}`);
  return stable.version;
}

/** Fabric installer profile: contains libraries + mainClass patch for this mc+loader. */
export async function getFabricProfileJson(mcVersion: string, loaderVersion: string): Promise<VersionJson> {
  const url = `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`fabric profile failed: ${res.status}`);
  return (await res.json()) as VersionJson;
}

// ------------------------------------------------------- downloads

function sha1File(file: string): Promise<string> {
  return fs.readFile(file).then((b) => createHash('sha1').update(b).digest('hex'));
}

async function downloadFile(url: string, dest: string, expectedSha1?: string): Promise<void> {
  try {
    if (expectedSha1) {
      const existing = await sha1File(dest).catch(() => null);
      if (existing === expectedSha1) return;
    } else {
      const st = await fs.stat(dest).catch(() => null);
      if (st && st.size > 0) return;
    }
  } catch { /* download */ }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: UA });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  if (expectedSha1) {
    const actual = createHash('sha1').update(buf).digest('hex');
    if (actual !== expectedSha1) throw new Error(`sha1 mismatch for ${dest}`);
  }
}

function mavenToPath(root: string, name: string): string {
  const [group, artifact, version, classifier] = name.split(':');
  const file = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;
  return path.join(root, ...group.split('.'), artifact, version, file);
}

function ruleAllows(rules: MojangRule[] | undefined): boolean {
  if (!rules || rules.length === 0) return true;
  const osName = process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'windows' : 'linux';
  // Mojang uses osx; newer files may say macos — accept both.
  let allowed = false;
  for (const r of rules) {
    let applies = true;
    if (r.os?.name) {
      const n = r.os.name.toLowerCase();
      applies = n === osName || (osName === 'osx' && (n === 'macos' || n === 'osx'));
    }
    if (applies) allowed = r.action === 'allow';
  }
  return allowed;
}

function nativesClassifier(lib: MojangLibrary): string | null {
  if (!lib.natives) return null;
  const key = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  let c = lib.natives[key] ?? (process.platform === 'darwin' ? lib.natives['osx'] : undefined);
  if (!c) return null;
  // arm64 macs: prefer explicit arm64/aarch64 classifier when offered.
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    if (lib.downloads?.classifiers) {
      const keys = Object.keys(lib.downloads.classifiers);
      const arm = keys.find((k) => /arm64|aarch64/i.test(k));
      if (arm) return arm;
    }
  }
  // Mojang uses 32/64 for ${arch} — never arm64.
  return c.replace('${arch}', '64');
}

/** Download client jar + libraries (+natives) for a version json. Returns classpath entries. */
export async function ensureLibraries(
  version: VersionJson,
  dataDir: string,
): Promise<{ classpath: string[]; nativesDir: string }> {
  const libsRoot = path.join(dataDir, 'libraries');
  const versionsRoot = path.join(dataDir, 'versions', version.id);
  const nativesDir = path.join(versionsRoot, 'natives');
  await fs.mkdir(nativesDir, { recursive: true });

  // client jar
  const clientJar = path.join(versionsRoot, `${version.id}.jar`);
  await downloadFile(version.downloads.client.url, clientJar, version.downloads.client.sha1);

  const classpath: string[] = [clientJar];
  const tasks: Array<() => Promise<void>> = [];

  for (const lib of version.libraries) {
    if (!ruleAllows(lib.rules)) continue;
    const nativeKey = nativesClassifier(lib);
    if (nativeKey && lib.downloads?.classifiers?.[nativeKey]) {
      const c = lib.downloads.classifiers[nativeKey];
      const dest = path.join(libsRoot, c.path);
      tasks.push(async () => {
        await downloadFile(c.url, dest, c.sha1);
        // unzip natives (jars are zips — use `unzip -o -q`).
        await new Promise<void>((resolve) => {
          const args = ['-o', '-q', dest, '-d', nativesDir, '-x', 'META-INF/*', 'META-INF/MANIFEST.MF'];
          const p = spawn('unzip', args, { stdio: 'ignore' });
          p.on('error', () => resolve()); // unzip missing -> best effort
          p.on('close', (code) => resolve());
        });
      });
      continue;
    }
    const art = lib.downloads?.artifact;
    if (!art) {
      // Fabric profile libs are maven-only (no downloads block) — resolve via Fabric maven.
      if (lib.name) {
        const dest = mavenToPath(libsRoot, lib.name);
        const url = `https://maven.fabricmc.net/${lib.name.split(':')[0].replace(/\./g, '/')}/${lib.name.split(':')[1]}/${lib.name.split(':')[2]}/${path.basename(dest)}`;
        tasks.push(() => downloadFile(url, dest));
        classpath.push(dest);
      }
      continue;
    }
    const dest = path.join(libsRoot, art.path);
    tasks.push(() => downloadFile(art.url, dest, art.sha1));
    classpath.push(dest);
  }
  // Real bounded concurrency: tasks are factories, 8 workers max.
  const workers = Array.from({ length: Math.min(8, Math.max(1, tasks.length)) }, async () => {
    while (tasks.length) {
      const task = tasks.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
  return { classpath, nativesDir };
}

export async function ensureAssets(version: VersionJson, dataDir: string): Promise<string> {
  const assetsRoot = path.join(dataDir, 'assets');
  const indexFile = path.join(assetsRoot, 'indexes', `${version.assetIndex.id}.json`);
  await downloadFile(version.assetIndex.url, indexFile, version.assetIndex.sha1);
  // NOTE: full object download is lazy here — the vanilla client re-downloads
  // missing objects itself. Pre-fetch index only (fast first-launch).
  return assetsRoot;
}

// ------------------------------------------------------- arg building

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`);
}

function collectArgs(
  entries: Array<string | { value: string | string[]; rules: MojangRule[] }> | undefined,
  vars: Record<string, string>
): string[] {
  if (!entries) return [];
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e === 'string') {
      out.push(interpolate(e, vars));
    } else {
      if (!ruleAllows(e.rules)) continue;
      const vals = Array.isArray(e.value) ? e.value : [e.value];
      for (const v of vals) out.push(interpolate(v, vars));
    }
  }
  return out;
}

export interface ResolvedLaunch {
  javaBin: string;
  args: string[];
  cwd: string;
}

/** Build the full java command line for --username --uuid --accessToken launch. */
export async function buildLaunchArgs(req: LaunchRequest): Promise<ResolvedLaunch> {
  const settings = await loadSettings(req.dataDir);
  const dataDir = req.dataDir ?? settings.dataDir;
  const account = req.account;

  const mojangVersion = await fetchVersionJson(req.mcVersion);
  let version = mojangVersion;
  let loaderVersion = req.loaderVersion;
  if (req.modLoader === 'fabric') {
    loaderVersion ??= await getLatestFabricLoader(req.mcVersion);
    const profile = await getFabricProfileJson(req.mcVersion, loaderVersion);
    // Merge: fabric profile libraries + mojang everything else.
    version = {
      ...mojangVersion,
      id: profile.id ?? `${req.mcVersion}-fabric-${loaderVersion}`,
      mainClass: profile.mainClass ?? mojangVersion.mainClass,
      libraries: [...mojangVersion.libraries, ...(profile.libraries ?? [])],
      arguments: profile.arguments ?? mojangVersion.arguments,
    };
  }

  const { classpath, nativesDir } = await ensureLibraries(version, dataDir);
  const assetsDir = await ensureAssets(mojangVersion, dataDir);

  const settings_java = settings.javaPath ?? undefined;
  const { path: javaBin } = settings_java
    ? { path: settings_java }
    : await ensureJavaForMinecraft(req.mcVersion, { dataDir });

  const uuidUndashed = account.uuid.replace(/-/g, '');
  const vars: Record<string, string> = {
    auth_player_name: account.username,
    version_name: version.id,
    game_directory: req.instanceDir,
    assets_root: assetsDir,
    assets_index_name: mojangVersion.assets,
    auth_uuid: uuidUndashed,
    auth_access_token: account.accessToken, // --accessToken
    clientid: 'gooner-client',
    auth_xuid: '0',
    user_type: 'mojang',
    version_type: 'release',
    natives_directory: nativesDir,
    launcher_name: 'GoonerClient',
    launcher_version: '1.0.0',
    classpath: classpath.join(process.platform === 'win32' ? ';' : ':'),
  };

  await fs.mkdir(req.instanceDir, { recursive: true });

  const jvmArgs: string[] = [
    ...ramJvmArgs(settings),
    '-Dminecraft.launcher.brand=GoonerClient',
    '-Dminecraft.launcher.version=1.0.0',
    `-Djava.library.path=${nativesDir}`,
    '-cp',
    vars.classpath,
    ...(req.extraJvmArgs ?? []),
    ...collectArgs(version.arguments?.jvm, vars),
  ];

  const gameArgs: string[] = [
    ...collectArgs(version.arguments?.game, vars),
    ...(req.extraGameArgs ?? []),
  ];
  // Guarantee identity args even if a version json drops them.
  const need = (flag: string) => !gameArgs.includes(flag);
  if (need('--username')) gameArgs.push('--username', account.username);
  if (need('--uuid')) gameArgs.push('--uuid', uuidUndashed);
  if (need('--accessToken')) gameArgs.push('--accessToken', account.accessToken);
  if (need('--gameDir')) gameArgs.push('--gameDir', req.instanceDir);
  if (need('--assetsDir')) gameArgs.push('--assetsDir', assetsDir);
  if (need('--assetIndex')) gameArgs.push('--assetIndex', mojangVersion.assets);
  if (need('--version')) gameArgs.push('--version', version.id);

  return { javaBin, args: [...jvmArgs, version.mainClass, ...gameArgs], cwd: req.instanceDir };
}

/** Spawn the game. Resolves with the ChildProcess; caller owns lifecycle. */
export async function launchMinecraft(req: LaunchRequest): Promise<ChildProcess> {
  const { javaBin, args, cwd } = await buildLaunchArgs(req);
  const child = spawn(javaBin, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, JAVA_HOME: path.dirname(path.dirname(javaBin)) },
  });
  const onLog = req.onLog;
  if (onLog) {
    child.stdout?.on('data', (d: Buffer) => onLog(d.toString()));
    child.stderr?.on('data', (d: Buffer) => onLog(d.toString()));
  }
  return child;
}
