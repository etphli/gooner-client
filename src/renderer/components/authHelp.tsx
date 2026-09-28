import React from 'react';

export interface MethodGuide {
  title: string;
  steps: string[];
  note: string;
}

export const METHOD_GUIDES: Record<'device' | 'offline' | 'elyby' | 'custom', MethodGuide> = {
  device: {
    title: 'What happens next',
    steps: [
      'Press Get code — a code appears right here.',
      'On your phone or another computer, open microsoft.com/link.',
      'Type in the code and finish the Microsoft login there.',
      'This screen completes by itself — keep it open. Codes last 15 minutes.',
    ],
    note: 'Needs a Microsoft account that owns Minecraft Java.',
  },
  offline: {
    title: 'What happens next',
    steps: [
      'Type any name (3–16 characters: letters, numbers, underscore) and press Save.',
      'Done — pick a profile and press Play.',
    ],
    note: 'No Microsoft needed. Works on singleplayer and servers with online-mode=false only — no Hypixel, Realms, or Mojang skins.',
  },
  elyby: {
    title: 'What happens next',
    steps: [
      'No Ely.by account yet? Create one free at account.ely.by first.',
      'Enter your Ely.by email (or nickname) and password below.',
      'Press Sign in — your Ely skin then works on Ely-enabled servers.',
    ],
    note: 'We never store your password, only the session token. Wrong password? Reset it on the Ely.by site.',
  },
  custom: {
    title: 'What happens next',
    steps: [
      'Enter your private server auth URL (must be https:// — http works for localhost only).',
      'Enter the username and password for THAT server.',
      'The game launches with authlib-injector pointed at your server.',
    ],
    note: 'Only use servers you trust — the server sees your password.',
  },
};

export const Guide: React.FC<{ method: 'device' | 'offline' | 'elyby' | 'custom' }> = ({ method }) => {
  const g = METHOD_GUIDES[method];
  return (
    <div style={{ textAlign: 'left', marginTop: 4 }}>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{g.title}</div>
      <ol style={{ margin: '6px 0 4px', paddingLeft: 20, fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 3 }}>
        {g.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="tiny muted">{g.note}</div>
    </div>
  );
};

export const OFFLINE_RE = /^[a-zA-Z0-9_]{3,16}$/;
export const isValidOfflineName = (n: string): boolean => OFFLINE_RE.test(n);

/** Turn raw auth errors into actionable, human messages. */
export function friendlyAuthError(e: unknown, fallback: string): string {
  const raw = (e as Error)?.message ?? String(e ?? '');
  if (/invalid credentials|invalid username or password/i.test(raw)) {
    return 'Wrong email or password — or no Ely.by account yet. Create one free at account.ely.by, or reset your password there.';
  }
  if (/OFFLINE_INVALID_USERNAME|Invalid offline username/i.test(raw)) {
    return 'That name won’t work offline — use 3–16 characters: letters, numbers, underscore only.';
  }
  if (/expired|expired_token/i.test(raw)) {
    return 'That code expired (15 min limit). Press Get code again for a fresh one.';
  }
  if (/access_denied|denied/i.test(raw)) {
    return 'Sign-in was denied on the Microsoft page. Try again and approve the login.';
  }
  if (/abort/i.test(raw)) return 'Cancelled.';
  return `${fallback}: ${raw}`.slice(0, 300);
}
