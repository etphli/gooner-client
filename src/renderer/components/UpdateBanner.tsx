import { useEffect, useRef, useState } from 'react';
import type { UpdaterChannel } from '../gooner';

type BannerStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error';

/**
 * Display-only updater banner.
 *
 * Settings (`pages/Settings.tsx`) stays the source of truth for update
 * actions (check / restart). This component never calls `checkForUpdates`,
 * never writes settings — it only subscribes to `window.gooner.onUpdater`
 * events and renders. To let Settings (or anything else) observe what the
 * banner shows without coupling, every status change is re-broadcast as a
 * `CustomEvent` on `window` named `UPDATER_BANNER_EVENT` ("gooner:update-banner").
 */
export const UPDATER_BANNER_EVENT = 'gooner:update-banner';

export interface UpdaterBannerDetail {
  status: BannerStatus;
  version: string;
  percent: number;
  message: string;
}

function extractVersion(payload: unknown): string {
  try {
    if (!payload || typeof payload !== 'object') return '';
    const p = payload as Record<string, unknown>;
    const direct = p['version'];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const nested = p['updateInfo'];
    if (nested && typeof nested === 'object') {
      const v = (nested as Record<string, unknown>)['version'];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const info = p['info'];
    if (info && typeof info === 'object') {
      const v = (info as Record<string, unknown>)['version'];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  } catch {
    /* ignore */
  }
  return '';
}

function extractPercent(payload: unknown): number | null {
  try {
    if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      const pct = p['percent'] ?? p['progressPercent'] ?? p['progress'];
      if (typeof pct === 'number' && Number.isFinite(pct)) return pct;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractMessage(payload: unknown): string {
  try {
    if (payload == null) return 'Unknown error';
    if (typeof payload === 'string') return payload.slice(0, 300) || 'Unknown error';
    if (payload instanceof Error) return (payload.message || 'Unknown error').slice(0, 300);
    if (typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      const m = p['message'];
      if (typeof m === 'string' && m.trim()) return m.slice(0, 300);
      return JSON.stringify(payload)?.slice(0, 300) || 'Unknown error';
    }
    return String(payload).slice(0, 300);
  } catch {
    return 'Unknown error';
  }
}

const CHANNELS: UpdaterChannel[] = [
  'updater:checking',
  'updater:available',
  'updater:not-available',
  'updater:progress',
  'updater:downloaded',
  'updater:error',
];

export default function UpdateBanner() {
  const [status, setStatus] = useState<BannerStatus>('idle');
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe on mount. Guard everything: bridge methods are all optional.
  useEffect(() => {
    const offs: Array<unknown> = [];
    try {
      const sub = window.gooner?.onUpdater;
      if (typeof sub !== 'function') return;
      const on = (channel: UpdaterChannel, cb: (payload?: unknown) => void): void => {
        try {
          const off = sub.call(window.gooner, channel, cb);
          if (typeof off === 'function') offs.push(off);
        } catch {
          /* ignore per-channel failures */
        }
      };
      on('updater:checking', () => {
        setDismissed(false);
        setMessage('');
        setStatus('checking');
      });
      on('updater:available', (payload) => {
        setDismissed(false);
        const v = extractVersion(payload);
        if (v) setVersion(v);
        setStatus('available');
      });
      on('updater:progress', (payload) => {
        setDismissed(false);
        const pct = extractPercent(payload);
        if (pct != null) setPercent(Math.min(100, Math.max(0, Math.round(pct))));
        const v = extractVersion(payload);
        if (v) setVersion(v);
        setStatus((prev) => (prev === 'downloaded' ? prev : 'downloading'));
      });
      on('updater:not-available', () => {
        setDismissed(false);
        setMessage('');
        setStatus('not-available');
      });
      on('updater:downloaded', (payload) => {
        setDismissed(false);
        const v = extractVersion(payload);
        if (v) setVersion(v);
        setPercent(100);
        setStatus('downloaded');
      });
      on('updater:error', (payload) => {
        setDismissed(false);
        setMessage(extractMessage(payload));
        setStatus('error');
      });
    } catch {
      /* bridge unavailable — stay hidden */
    }
    return () => {
      offs.forEach((off) => {
        try {
          if (typeof off === 'function') (off as () => void)();
        } catch {
          /* ignore */
        }
      });
    };
  }, []);

  // Re-broadcast (display-only) so Settings can remain source of truth if needed.
  useEffect(() => {
    try {
      const detail: UpdaterBannerDetail = { status, version, percent, message };
      window.dispatchEvent(new CustomEvent<UpdaterBannerDetail>(UPDATER_BANNER_EVENT, { detail }));
    } catch {
      /* ignore */
    }
  }, [status, version, percent, message]);

  // "You're up to date" auto-hides after 4s.
  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (status === 'not-available' && !dismissed) {
      hideTimer.current = setTimeout(() => setStatus('idle'), 4000);
    }
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [status, dismissed]);

  if (status === 'idle' || dismissed) return null;
  // Defensive: keep `CHANNELS` referenced so the subscribed channel list
  // stays in sync with what we render (avoids unused warnings if edited).
  void CHANNELS;

  const dismiss = (): void => {
    try {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const restart = async (): Promise<void> => {
    if (restarting) return;
    setRestarting(true);
    try {
      await window.gooner?.quitAndInstall?.();
    } catch {
      /* Settings surfaces restart errors; banner stays visible */
      setRestarting(false);
    }
  };

  const versionLabel = version ? `v${version}` : '';
  const isError = status === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
      aria-atomic="true"
      tabIndex={0}
      onKeyDown={(e) => {
        try {
          if (e.key === 'Escape') {
            e.stopPropagation();
            dismiss();
          }
        } catch {
          /* ignore */
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px',
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${
          isError
            ? 'var(--red)'
            : status === 'downloaded' || status === 'not-available'
              ? 'var(--green)'
              : 'var(--accent)'
        }`,
        fontSize: 12.5,
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {status === 'checking' ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span className="muted">Checking for updates…</span>
        </>
      ) : status === 'not-available' ? (
        <>
          <span aria-hidden="true" style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>
          <span>You&rsquo;re up to date ✓</span>
        </>
      ) : status === 'downloaded' ? (
        <>
          <span aria-hidden="true" style={{ color: 'var(--green)', fontWeight: 700 }}>●</span>
          <span style={{ fontWeight: 600 }}>
            Restart to install {versionLabel || 'update'}
          </span>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={restarting}
            onClick={() => void restart()}
          >
            {restarting ? 'Restarting…' : 'Restart'}
          </button>
        </>
      ) : isError ? (
        <>
          <span aria-hidden="true" style={{ color: 'var(--red)', fontWeight: 700 }}>!</span>
          <span
            className="mono tiny"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}
            title={message}
          >
            Update error: {message || 'Unknown error'}
          </span>
          {/code signature/i.test(message || '') && (
            <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
              Pre-v0.3.7 install? Grab the DMG once manually — updates go automatic after that.
            </span>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              try {
                void navigator.clipboard?.writeText(`Gooner Client update error:\n${message || 'Unknown error'}`);
              } catch {
                /* ignore */
              }
            }}
          >
            Copy error
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              (window.gooner as unknown as { openExternal?: (u: string) => Promise<void> } | undefined)?.openExternal?.(
                'https://github.com/etphli/gooner-client/releases/latest',
              )?.catch(() => undefined);
            }}
          >
            Download DMG
          </button>
        </>
      ) : (
        <>
          <span aria-hidden="true" style={{ color: 'var(--accent)', fontWeight: 700 }}>↓</span>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            Update {versionLabel} ready — Downloading… {Math.round(percent)}%
          </span>
          <div
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Update download progress"
            className="progress-track"
            style={{ flex: 1, minWidth: 80, maxWidth: 320 }}
          >
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </>
      )}

      <span style={{ flex: 1 }} />

      {status !== 'checking' && status !== 'not-available' && (
        <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
          {status === 'downloaded' ? 'Ready' : status === 'error' ? 'Dismissible' : 'Downloading'}
        </span>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss update notification"
        title="Dismiss (Esc)"
        style={{
          border: 0,
          background: 'transparent',
          color: 'var(--text3)',
          cursor: 'pointer',
          fontSize: 15,
          lineHeight: 1,
          padding: '2px 6px',
          borderRadius: 6,
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        ×
      </button>
    </div>
  );
}
