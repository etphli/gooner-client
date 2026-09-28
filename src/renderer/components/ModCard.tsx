import React from 'react';

export interface ModCardData {
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads?: number;
  clientSide?: string | boolean;
}

interface ModCardProps {
  mod: ModCardData;
  installing?: boolean;
  installed?: boolean;
  installError?: string | null;
  onInstall?: (slug: string) => void;
  onSelect?: (mod: ModCardData) => void;
}

export function formatDownloads(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

export function clientSideLabel(v: string | boolean | undefined): string | null {
  if (v === true) return 'Client-side';
  if (v === false || v === undefined) return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s === 'required' || s === 'client' || s === 'client-only' || s === 'client_side') return 'Client-side';
  if (s === 'optional') return 'Client optional';
  if (s === 'unsupported' || s === 'server' || s === 'server-only') return 'Server-side';
  return v.length <= 24 ? v : null;
}

const ModCard: React.FC<ModCardProps> = ({ mod, installing, installed, installError, onInstall, onSelect }) => {
  const initial = (mod.title || mod.slug || '?').slice(0, 1).toUpperCase();
  const badge = clientSideLabel(mod.clientSide);

  const open = (): void => {
    onSelect?.(mod);
  };

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      aria-label={`${mod.title} — view details`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '12px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      {mod.iconUrl ? (
        <img
          src={mod.iconUrl}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            fontSize: 18,
            color: 'var(--text)',
            background: 'var(--card-2)',
            border: '1px solid var(--border)',
          }}
        >
          {initial}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <strong
            title={mod.title}
            style={{ color: 'var(--text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {mod.title}
          </strong>
          {badge ? (
            <span
              title={typeof mod.clientSide === 'string' ? mod.clientSide : 'Client side'}
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--green-soft)',
                color: 'var(--green)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <div
          title={mod.description}
          style={{
            fontSize: 12,
            color: 'var(--text2)',
            marginTop: 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 32,
          }}
        >
          {mod.description || 'No description.'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>
            ⬇ {formatDownloads(mod.downloads)}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {installed ? (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green)' }}>✓ Installed</span>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              disabled={!!installing}
              onClick={(e) => {
                e.stopPropagation();
                onInstall?.(mod.slug);
              }}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              {installing ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span className="spinner" aria-hidden="true" />
                  Installing…
                </span>
              ) : (
                'Install'
              )}
            </button>
          </span>
        </div>
        {installError ? (
          <p style={{ fontSize: 11.5, margin: '6px 0 0', color: 'var(--red)' }} title={installError}>
            ⚠ {installError}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default ModCard;
