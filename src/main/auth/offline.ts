// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/offline.ts (Way 3)
import { randomUUID, createHash } from 'node:crypto';
import { AuthError, type AuthAccount } from './types.js';

export const OFFLINE_USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
export function assertValidOfflineUsername(name: string): void {
  if (!OFFLINE_USERNAME_RE.test(name)) throw new AuthError('OFFLINE_INVALID_USERNAME', `Invalid offline username "${name}" (3-16 chars, letters/digits/underscore).`);
}
export function uuidV3FromName(name: string): string {
  const hash = createHash('md5').update(name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
export function offlineUuidFromUsername(username: string): string {
  assertValidOfflineUsername(username);
  return uuidV3FromName(`OfflinePlayer:${username}`);
}
export function createOfflineAccount(username: string): AuthAccount {
  assertValidOfflineUsername(username);
  const now = Date.now();
  return { id: randomUUID(), provider: 'offline', minecraftUsername: username, minecraftUuid: offlineUuidFromUsername(username), ownsMinecraft: false, createdAt: now, updatedAt: now };
}
