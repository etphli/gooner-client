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
  onInstall?: (slug: string) => void;
}

export function formatDownloads(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

const ModCard: React.FC<ModCardProps> = ({ mod, installing, onInstall }) => {
  const initial = (mod.title || mod.slug || '?').slice(0, 1).toUpperCase();
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '12px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
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
            background: 'var(--bg)',
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
          }}
        >
          {mod.description || 'No description.'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>
            ⬇ {formatDownloads(mod.downloads)}
          </span>
          {typeof mod.clientSide === 'string' && mod.clientSide ? (
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>• {mod.clientSide}</span>
          ) : null}
          <span style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn-primary"
              disabled={!!installing}
              onClick={() => onInstall?.(mod.slug)}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              {installing ? 'Installing…' : 'Install'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};

export default ModCard;
