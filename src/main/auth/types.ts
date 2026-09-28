// SPDX-License-Identifier: GPL-3.0-only
// Gooner Client — auth/types.ts
// Shared auth types + Microsoft/Xbox/Minecraft constants. No external deps.

export type ProviderKind =
  | 'microsoft-device'
  | 'microsoft-browser'
  | 'offline'
  | 'elyby'
  | 'yggdrasil-custom';

export const MS_DEVICE_CODE_URL =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
export const MS_TOKEN_URL =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
export const MS_AUTHORIZE_URL =
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';

export const DEFAULT_MS_CLIENT_ID = '00000000402b5328';
export const DEFAULT_MS_SCOPES = ['XboxLive.signin', 'offline_access', 'openid', 'profile'] as const;

export const XBOX_USER_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
export const XSTS_AUTHORIZE_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
export const XSTS_RELYING_PARTY_MINECRAFT = 'rp://api.minecraftservices.com/';

export const MC_LOGIN_WITH_XBOX_URL =
  'https://api.minecraftservices.com/authentication/login_with_xbox';
export const MC_ENTITLEMENTS_URL = 'https://api.minecraftservices.com/entitlements/mcstore';
export const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';

export const ELY_BY_AUTH_BASE = 'https://authserver.ely.by/auth';

export type Logger = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export type AuthErrorCode =
  | 'MICROSOFT_DEVICE_PENDING'
  | 'MICROSOFT_DEVICE_SLOW_DOWN'
  | 'MICROSOFT_DEVICE_EXPIRED'
  | 'MICROSOFT_ACCESS_DENIED'
  | 'MICROSOFT_TOKEN_EXCHANGE_FAILED'
  | 'MICROSOFT_INVALID_CLIENT'
  | 'XBOX_NO_ACCOUNT'
  | 'XBOX_CHILD_ACCOUNT'
  | 'XBOX_BANNED'
  | 'XBOX_AUTH_FAILED'
  | 'XSTS_FAILED'
  | 'MC_INVALID_APP_REGISTRATION'
  | 'MC_NOT_OWNED'
  | 'MC_PROFILE_FAILED'
  | 'OFFLINE_INVALID_USERNAME'
  | 'ELYBY_AUTH_FAILED'
  | 'YGGDRASIL_AUTH_FAILED'
  | 'TOKEN_REFRESH_FAILED'
  | 'TOKEN_VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'STORAGE_ERROR'
  | 'ABORTED'
  | 'UNKNOWN';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status?: number;
  readonly xerr?: number;
  readonly helpUrl?: string;
  constructor(code: AuthErrorCode, message: string, opts?: { status?: number; xerr?: number; helpUrl?: string; cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'AuthError';
    this.code = code;
    this.status = opts?.status;
    this.xerr = opts?.xerr;
    this.helpUrl = opts?.helpUrl;
  }
}

export function xerrToAuthError(xerr: number, message?: string): AuthError {
  switch (xerr) {
    case 2148916233:
      return new AuthError('XBOX_NO_ACCOUNT', message ?? 'No Xbox account linked. Create one at https://www.xbox.com', { xerr, helpUrl: 'https://www.xbox.com' });
    case 2148916238:
      return new AuthError('XBOX_CHILD_ACCOUNT', message ?? 'Child account needs family approval at https://account.microsoft.com/family', { xerr, helpUrl: 'https://account.microsoft.com/family' });
    case 2148916229:
      return new AuthError('XBOX_BANNED', message ?? 'Xbox account banned / enforcement.', { xerr, helpUrl: 'https://enforcement.xbox.com' });
    default:
      return new AuthError('XBOX_AUTH_FAILED', message ?? `Xbox auth failed (XErr ${xerr}).`, { xerr });
  }
}

export interface DeviceCodeInfo {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
  message?: string;
}

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
  tokenType: string;
  scope: string;
}

export interface XboxChain {
  xblToken: string;
  xblUserHash: string;
  xstsToken: string;
  xstsUserHash: string;
}

export interface MinecraftSession {
  accessToken: string;
  expiresAt: number;
  ownsMinecraft: boolean;
}

export interface MinecraftProfile {
  id: string;
  name: string;
  skins: Array<{ id: string; state: string; url: string; variant?: string; alias?: string }>;
  capes: Array<{ id: string; state: string; url: string; alias?: string }>;
}

export interface MinecraftEntitlements {
  items: Array<{ name: string; signature?: string }>;
  signature?: string;
  keyId?: string;
}

export interface AuthAccount {
  id: string;
  provider: ProviderKind;
  minecraftUsername: string;
  minecraftUuid: string;
  microsoft?: MicrosoftTokens;
  xbox?: XboxChain;
  minecraft?: MinecraftSession;
  profile?: MinecraftProfile;
  ownsMinecraft?: boolean;
  yggdrasil?: { serverUrl: string; accessToken: string; clientToken: string; serverName?: string };
  authlibInjector?: { baseUrl: string; prefetchUuid?: boolean };
  createdAt: number;
  updatedAt: number;
}

export function stripUuidDashes(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

export function addUuidDashes(id: string): string {
  const h = stripUuidDashes(id);
  if (!/^[0-9a-f]{32}$/.test(h)) throw new AuthError('UNKNOWN', `Invalid profile id: ${id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
