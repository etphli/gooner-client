/*
 * Gooner Client — launcher/java.ts
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Auto-provisions Eclipse Temurin JREs (17 / 21) on macOS-first layout:
 *   ~/Library/Application Support/GoonerClient/java/<major>/...
 * Inspired by Polyfrost OneLauncher java provisioning ideas (fork direction),
 * reimplemented from scratch for Gooner Client.
 *
 * Deps: node builtins only (fetch, fs/promises, child_process, os, path).
 * Requires Electron with Node 18+ (global fetch).
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { getDefaultDataDir } from './settings.js';

export type JavaMajor = 17 | 21;
export type GoonerArch = 'aarch64' | 'x64';

const TEMURIN_API = 'https://api.adoptium.net/v3/binary/latest';

/** Map Node arch to Temurin arch string. */
export function getTemurinArch(): GoonerArch {
  const a = process.arch;
  if (a === 'arm64') return 'aarch64';
  return 'x64'; // x64, ia32 fallback -> x64 (Minecraft needs 64-bit)
}

/** Map Node platform to Temurin OS string. macOS-first. */
export function getTemurinOs(): 'mac' | 'linux' | 'windows' {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

export function getJavaRoot(dataDir?: string): string {
  return path.join(dataDir ?? getDefaultDataDir(), 'java');
}

export function getJavaInstallDir(major: JavaMajor, dataDir?: string): string {
  return path.join(getJavaRoot(dataDir), String(major));
}

/** Candidate relative paths for the `java` binary inside an extracted Temurin archive. */
function candidateBinaries(installDir: string): string[] {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return [
    // macOS Temurin JDK: jdk-17.x/Contents/Home/bin/java
    path.join(installDir, 'Contents', 'Home', 'bin', `java${ext}`),
    path.join(installDir, 'bin', `java${ext}`),
    path.join(installDir, `java${ext}`),
  ];
}

/** Recursively search max 3 levels deep for bin/java (handles versioned top-level dir). */
async function searchJavaBinary(dir: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  for (const c of candidateBinaries(dir)) {
    try {
      await fs.access(c);
      return c;
    } catch { /* continue */ }
  }
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e);
    try {
      const st = await fs.stat(full);
      if (!st.isDirectory()) continue;
      if (e === 'Contents' || e === 'Home' || e === 'bin' || e.startsWith('jdk-') || e.startsWith('temurin')) {
        const found = await searchJavaBinary(full, depth + 1);
        if (found) return found;
      }
    } catch { /* ignore */ }
  }
  // generic fallback: scan any single-child dir
  if (depth === 0 && entries.length === 1) {
    return searchJavaBinary(path.join(dir, entries[0]), depth + 1);
  }
  return null;
}

function runJavaVersion(javaBin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(javaBin, ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

export async function findProvisionedJava(major: JavaMajor, dataDir?: string): Promise<string | null> {
  const dir = getJavaInstallDir(major, dataDir);
  const bin = await searchJavaBinary(dir);
  if (!bin) return null;
  const ok = await runJavaVersion(bin);
  return ok ? bin : null;
}

export async function listProvisioned(): Promise<{ major: JavaMajor; path: string }[]> {
  const out: { major: JavaMajor; path: string }[] = [];
  for (const major of [17, 21] as JavaMajor[]) {
    const found = await findProvisionedJava(major);
    if (found) out.push({ major, path: found });
  }
  return out;
}

/**
 * Which Temurin major does a given Minecraft version need?
 * 1.20.5+ -> 21, 1.17+ -> 17, older -> 17 (we only provision 17/21 per spec).
 */
export function resolveJavaMajorForMinecraft(mcVersion: string): JavaMajor {
  const m = mcVersion.trim().replace(/^[a-z]+/i, '');
  const parts = m.split('.').map((n) => parseInt(n, 10));
  const minor = Number.isNaN(parts[1]) ? 0 : parts[1];
  const patch = Number.isNaN(parts[2]) ? 0 : parts[2];
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  return 17;
}

export function buildTemurinUrl(major: JavaMajor): string {
  const osName = getTemurinOs();
  const arch = getTemurinArch();
  // jdk/hotspot/normal/eclipse — full JDK (javaw/javac present, biggest compat)
  return `${TEMURIN_API}/${major}/ga/${osName}/${arch}/jdk/hotspot/normal/eclipse`;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // Long timeout: only the connection setup is bounded per attempt — the
  // ~200MB stream itself takes minutes. Two attempts before surfacing.
  const { fetchWithRetry } = await import('../net.js');
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithRetry(
        url,
        { headers: { 'User-Agent': 'GoonerClient/1.0 (+macOS)' }, redirect: 'follow' },
        { label: 'Java download', timeoutMs: 10 * 60_000, retries: 0 },
      );
      if (!res.ok || !res.body) {
        throw new Error(`Temurin download failed: ${res.status} ${res.statusText} (${url})`);
      }
      // Stream to disk (handles ~200MB JDKs without buffering).
      const nodeStream = res.body as unknown as NodeJS.ReadableStream;
      await pipeline(nodeStream as never, createWriteStream(dest) as never);
      return;
    } catch (e) {
      lastErr = e;
      await fs.rm(dest, { force: true }).catch(() => undefined);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Java download failed: ${String(lastErr)}`);
}

function extractArchive(archive: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // macOS/Linux: system tar handles .tar.gz. Win10+: tar.exe ships in-box.
    const args = ['-xzf', archive, '-C', destDir, '--strip-components=1'];
    const tarBin = process.platform === 'win32' ? 'tar.exe' : 'tar';
    const p = spawn(tarBin, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`)),
    );
  });
}

export interface EnsureJavaOptions {
  dataDir?: string;
  force?: boolean;
  onProgress?: (msg: string) => void;
}

/**
 * Ensure Temurin `major` is provisioned, returning the absolute java binary path.
 * Safe to call on every launch — fast path if already installed.
 */
export async function ensureJava(major: JavaMajor, opts: EnsureJavaOptions = {}): Promise<string> {
  const { dataDir, force = false, onProgress } = opts;
  const log = onProgress ?? (() => {});
  if (!force) {
    const existing = await findProvisionedJava(major, dataDir);
    if (existing) return existing;
  }
  const installDir = getJavaInstallDir(major, dataDir);
  const tmpDir = path.join(os.tmpdir(), `gooner-java-${major}-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(installDir, { recursive: true });

  const url = buildTemurinUrl(major);
  const archive = path.join(tmpDir, `temurin-${major}.tar.gz`);
  log(`Downloading Temurin ${major} (${getTemurinOs()}/${getTemurinArch()})…`);
  await downloadToFile(url, archive);
  log(`Extracting Temurin ${major}…`);
  await extractArchive(archive, installDir);

  // macOS quarantine / exec bit fix for downloaded JDK
  if (process.platform !== 'win32') {
    await new Promise<void>((resolve) => {
      const p = spawn('chmod', ['-R', '+x', installDir], { stdio: 'ignore' });
      p.on('error', () => resolve());
      p.on('close', () => resolve());
    });
  }
  await fs.rm(tmpDir, { recursive: true, force: true });

  const bin = await searchJavaBinary(installDir);
  if (!bin) throw new Error(`Temurin ${major} extracted but no java binary found in ${installDir}`);
  try {
    await fs.chmod(bin, 0o755);
  } catch { /* non-fatal on win */ }
  const ok = await runJavaVersion(bin);
  if (!ok) throw new Error(`Provisioned java failed to run: ${bin}`);
  log(`Java ${major} ready: ${bin}`);
  return bin;
}

/** Convenience: provision the right JDK for a Minecraft version. */
export async function ensureJavaForMinecraft(
  mcVersion: string,
  opts: EnsureJavaOptions = {},
): Promise<{ major: JavaMajor; path: string }> {
  const major = resolveJavaMajorForMinecraft(mcVersion);
  const javaPath = await ensureJava(major, opts);
  return { major, path: javaPath };
}

export async function removeJava(major: JavaMajor, dataDir?: string): Promise<void> {
  await fs.rm(getJavaInstallDir(major, dataDir), { recursive: true, force: true });
}
