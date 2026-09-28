import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, SectionTitle, Toggle } from '../components/ui';
import ModCard, { formatDownloads } from '../components/ModCard';

// Electron-only CSS property used by TitleBar (pre-existing file, do not touch).
// Augment here so `tsc --noEmit` passes repo-wide while only editing allowed files.
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag' | string;
  }
}

/* Local bridge casts — `any`-free optional calls over window.gooner.
   gooner.d.ts is legacy; these optional signatures match the spec. */
interface BridgeInstanceInput {
  name: string;
  mcVersion: string;
  modLoader?: 'fabric' | 'vanilla';
  loaderVersion?: string | null;
}

interface GoonerBridge {
  getInstances?: () => Promise<unknown>;
  getVersions?: (filter?: string) => Promise<unknown>;
  createInstance?: (input: BridgeInstanceInput) => Promise<unknown>;
  deleteInstance?: (id: string) => Promise<unknown>;
  launch?: (opts: { instanceId: string }) => Promise<unknown>;
  searchMods?: (query: string, mcVersion?: string) => Promise<unknown>;
  installMod?: (instanceId: string, slug: string, mcVersion?: string) => Promise<unknown>;
  getMods?: (instanceId: string) => Promise<unknown>;
  toggleMod?: (instanceId: string, slug: string, enabled: boolean) => Promise<unknown>;
  removeMod?: (instanceId: string, slug: string) => Promise<unknown>;
}

function getBridge(): GoonerBridge | undefined {
  return window.gooner as unknown as GoonerBridge | undefined;
}

interface Profile {
  id: string;
  name: string;
  mcVersion: string;
  modLoader: string;
  loaderVersion?: string | null;
  lastPlayedAt?: string | null;
}

interface BrowserMod {
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads?: number;
  clientSide?: string | boolean;
}

interface InstalledMod {
  slug: string;
  name: string;
  enabled: boolean;
  version?: string;
  file?: string;
}

type LoaderChoice = 'fabric' | 'vanilla';
type SortKey = 'relevance' | 'popular' | 'newest';

const FALLBACK_VERSIONS: string[] = ['1.21.1', '1.21.10', '1.21.11', '1.20.4', '1.20.1'];

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function normalizeProfile(raw: unknown): Profile | null {
  const r = asRecord(raw);
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return null;
  const name = typeof r.name === 'string' && r.name ? r.name : 'Untitled';
  const mcVersion =
    typeof r.mcVersion === 'string' && r.mcVersion
      ? r.mcVersion
      : typeof r.version === 'string' && r.version
        ? r.version
        : '';
  const modLoader =
    typeof r.modLoader === 'string' && r.modLoader
      ? r.modLoader
      : typeof r.loader === 'string' && r.loader
        ? r.loader
        : 'vanilla';
  const loaderVersion =
    typeof r.loaderVersion === 'string' ? r.loaderVersion : typeof r.loaderVersion === 'number' ? String(r.loaderVersion) : null;
  const lastPlayedAt =
    typeof r.lastPlayedAt === 'string'
      ? r.lastPlayedAt
      : typeof r.lastPlayed === 'number'
        ? new Date(r.lastPlayed).toISOString()
        : null;
  return { id, name, mcVersion, modLoader, loaderVersion, lastPlayedAt };
}

function normalizeBrowserMod(raw: unknown): BrowserMod | null {
  const r = asRecord(raw);
  const slug = typeof r.slug === 'string' && r.slug ? r.slug : typeof r.id === 'string' ? r.id : '';
  if (!slug) return null;
  const title = typeof r.title === 'string' && r.title ? r.title : typeof r.name === 'string' && r.name ? r.name : slug;
  const description = typeof r.description === 'string' ? r.description : '';
  const iconUrl = typeof r.iconUrl === 'string' ? r.iconUrl : typeof r.icon === 'string' ? r.icon : undefined;
  const downloads = typeof r.downloads === 'number' ? r.downloads : typeof r.downloads === 'string' ? Number(r.downloads) || 0 : undefined;
  const clientSide = typeof r.clientSide === 'string' || typeof r.clientSide === 'boolean' ? r.clientSide : undefined;
  return { slug, title, description, iconUrl, downloads, clientSide };
}

function normalizeInstalledMod(raw: unknown): InstalledMod | null {
  const r = asRecord(raw);
  const slug = typeof r.slug === 'string' && r.slug ? r.slug : typeof r.id === 'string' ? r.id : '';
  if (!slug) return null;
  const name = typeof r.name === 'string' && r.name ? r.name : slug;
  const enabled = typeof r.enabled === 'boolean' ? r.enabled : true;
  const version =
    typeof r.version === 'string' ? r.version : typeof r.installedVersion === 'string' ? r.installedVersion : undefined;
  const file = typeof r.file === 'string' ? r.file : undefined;
  return { slug, name, enabled, version, file };
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}

/** Offline-friendly wrapper: nudges toward proxy Settings on fetch failures. */
function withProxyHint(msg: string): string {
  const m = msg.toLowerCase();
  const looksOffline =
    m.includes('fetch') ||
    m.includes('network') ||
    m.includes('failed') ||
    m.includes('offline') ||
    m.includes('enotfound') ||
    m.includes('econn') ||
    m.includes('timeout') ||
    m.includes('load') ||
    m.includes('modrinth');
  return looksOffline
    ? `${msg} Check your connection and proxy under Settings.`
    : `${msg} If you're offline, check proxy under Settings.`;
}

const muted: React.CSSProperties = { color: 'var(--text2)' };
const rowBetween: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const errBox: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 };

function SkeletonCard(): React.JSX.Element {
  return (
    <div
      aria-hidden
      style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--card-2)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ height: 12, width: '55%', borderRadius: 6, background: 'var(--card-2)' }} />
        <div style={{ height: 10, width: '95%', borderRadius: 6, background: 'var(--card-2)' }} />
        <div style={{ height: 10, width: '70%', borderRadius: 6, background: 'var(--card-2)' }} />
      </div>
    </div>
  );
}

const Mods: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [versions, setVersions] = useState<string[]>(FALLBACK_VERSIONS);
  const [versionsLoading, setVersionsLoading] = useState(true);

  const [createName, setCreateName] = useState('');
  const [createMcVersion, setCreateMcVersion] = useState(FALLBACK_VERSIONS[0] ?? '');
  const [createLoader, setCreateLoader] = useState<LoaderChoice>('fabric');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [results, setResults] = useState<BrowserMod[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [installOk, setInstallOk] = useState<Record<string, boolean>>({});
  const [installErr, setInstallErr] = useState<Record<string, string>>({});

  const [selected, setSelected] = useState<BrowserMod | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedError, setInstalledError] = useState<string | null>(null);
  const [modActionError, setModActionError] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [removingSlug, setRemovingSlug] = useState<string | null>(null);

  const active = useMemo(() => profiles.find((p) => p.id === activeId) ?? null, [profiles, activeId]);

  const sortedResults = useMemo(() => {
    if (sort === 'popular') return [...results].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
    // "Newest" has no date field from searchMods — deterministic title proxy.
    if (sort === 'newest') return [...results].sort((a, b) => a.title.localeCompare(b.title));
    return results;
  }, [results, sort]);

  const refreshProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const raw = await getBridge()?.getInstances?.();
      const list = Array.isArray(raw) ? raw.map(normalizeProfile).filter((p): p is Profile => p !== null) : [];
      setProfiles(list);
      setActiveId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setProfilesError(withProxyHint(errMsg(e, 'Failed to load profiles.')));
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  const refreshVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const raw = await getBridge()?.getVersions?.('release');
      const list = Array.isArray(raw)
        ? (raw as unknown[])
            .map((v: unknown) => (typeof v === 'string' ? v : String(asRecord(v).id ?? asRecord(v).version ?? '')))
            .filter((s): s is string => Boolean(s))
        : [];
      const finalList = list.length > 0 ? list : FALLBACK_VERSIONS;
      setVersions(finalList);
      setCreateMcVersion((prev) => prev || finalList[0] || '');
    } catch {
      setVersions(FALLBACK_VERSIONS);
      setCreateMcVersion((prev) => prev || FALLBACK_VERSIONS[0] || '');
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
    void refreshVersions();
  }, [refreshProfiles, refreshVersions]);

  const refreshInstalled = useCallback(async (instanceId: string) => {
    if (!instanceId) return;
    setInstalledLoading(true);
    setInstalledError(null);
    try {
      const raw = await getBridge()?.getMods?.(instanceId);
      const list = Array.isArray(raw)
        ? (raw as unknown[]).map(normalizeInstalledMod).filter((m): m is InstalledMod => m !== null)
        : [];
      setInstalled(list);
    } catch (e) {
      setInstalled([]);
      setInstalledError(withProxyHint(errMsg(e, 'Failed to load installed mods.')));
    } finally {
      setInstalledLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) void refreshInstalled(activeId);
    else setInstalled([]);
  }, [activeId, refreshInstalled]);

  const runSearch = useCallback(
    async (q: string, mcVersion: string) => {
      if (!activeId) {
        setResults([]);
        return;
      }
      setSearching(true);
      setSearchError(null);
      try {
        const raw = await getBridge()?.searchMods?.(q, mcVersion);
        const list = Array.isArray(raw)
          ? (raw as unknown[]).map(normalizeBrowserMod).filter((m): m is BrowserMod => m !== null)
          : [];
        setResults(list);
      } catch (e) {
        setResults([]);
        setSearchError(withProxyHint(errMsg(e, 'Mod search failed.')));
      } finally {
        setSearching(false);
      }
    },
    [activeId],
  );

  // Debounced search (CurseForge-style: type to filter).
  useEffect(() => {
    if (!activeId) return;
    const mc = active?.mcVersion ?? '';
    const t = window.setTimeout(() => {
      void runSearch(query.trim(), mc);
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, active?.mcVersion, activeId, runSearch]);

  // Detail modal: focus Close on open, Esc to close.
  useEffect(() => {
    if (!selected) return undefined;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCreateError(null);
    const name = createName.trim() || 'New Instance';
    if (!createMcVersion) {
      setCreateError('Pick a Minecraft version first.');
      return;
    }
    setCreating(true);
    try {
      const created = await getBridge()?.createInstance?.({ name, mcVersion: createMcVersion, modLoader: createLoader });
      const norm = normalizeProfile(created);
      await refreshProfiles();
      if (norm) setActiveId(norm.id);
      setCreateName('');
    } catch (err) {
      setCreateError(withProxyHint(errMsg(err, 'Failed to create profile.')));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this profile? Files on disk may be removed.')) return;
    setDeletingId(id);
    try {
      await getBridge()?.deleteInstance?.(id);
      await refreshProfiles();
    } catch (e) {
      setProfilesError(withProxyHint(errMsg(e, 'Failed to delete profile.')));
    } finally {
      setDeletingId(null);
    }
  };

  const handlePlay = async (instanceId: string): Promise<void> => {
    setLaunchingId(instanceId);
    setLaunchError(null);
    try {
      await getBridge()?.launch?.({ instanceId });
      await refreshProfiles();
    } catch (e) {
      setLaunchError(withProxyHint(errMsg(e, 'Launch failed.')));
    } finally {
      setLaunchingId(null);
    }
  };

  const handleInstall = async (slug: string): Promise<void> => {
    if (!activeId) return;
    const mc = active?.mcVersion ?? '';
    setInstallingSlug(slug);
    setInstallErr((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    try {
      await getBridge()?.installMod?.(activeId, slug, mc);
      setInstallOk((prev) => ({ ...prev, [slug]: true }));
      await refreshInstalled(activeId);
    } catch (e) {
      setInstallErr((prev) => ({ ...prev, [slug]: withProxyHint(errMsg(e, `Failed to install ${slug}.`)) }));
    } finally {
      setInstallingSlug(null);
    }
  };

  const handleToggle = async (slug: string, next: boolean): Promise<void> => {
    if (!activeId) return;
    setModActionError(null);
    const prev = installed;
    setTogglingSlug(slug);
    setInstalled((list) => list.map((m) => (m.slug === slug ? { ...m, enabled: next } : m)));
    try {
      await getBridge()?.toggleMod?.(activeId, slug, next);
    } catch (e) {
      setInstalled(prev);
      setModActionError(withProxyHint(errMsg(e, `Failed to toggle ${slug} — rolled back.`)));
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleRemove = async (slug: string): Promise<void> => {
    if (!activeId) return;
    setModActionError(null);
    const prev = installed;
    setRemovingSlug(slug);
    setInstalled((list) => list.filter((m) => m.slug !== slug));
    try {
      await getBridge()?.removeMod?.(activeId, slug);
    } catch (e) {
      setInstalled(prev);
      setModActionError(withProxyHint(errMsg(e, `Failed to remove ${slug} — rolled back.`)));
    } finally {
      setRemovingSlug(null);
    }
  };

  return (
    <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionTitle>Mods</SectionTitle>
        <p style={{ ...muted, margin: '0 0 4px' }}>Profiles, mod browser, and installed mods — per instance.</p>
        <p style={{ ...muted, margin: 0, fontSize: 12 }}>CurseForge-style browsing over Modrinth search + one-click install.</p>
      </div>

      {/* 1 — Profiles */}
      <Card>
        <div style={{ ...rowBetween, marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Profiles</h3>
          <span style={{ fontSize: 12, ...muted }}>{profilesLoading ? 'Loading…' : `${profiles.length} instance${profiles.length === 1 ? '' : 's'}`}</span>
          <span style={{ marginLeft: 'auto' }}>
            <button type="button" className="btn-ghost" onClick={() => void refreshProfiles()} disabled={profilesLoading}>
              ↻ Refresh
            </button>
          </span>
        </div>

        {profilesLoading ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Loading profiles">
            <span className="spinner" aria-hidden="true" />
            <span style={{ fontSize: 13, ...muted }}>Loading profiles…</span>
          </div>
        ) : profilesError ? (
          <div style={errBox}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text)' }}>⚠ {profilesError}</p>
            <button type="button" className="btn-ghost" onClick={() => void refreshProfiles()}>
              Retry
            </button>
          </div>
        ) : profiles.length === 0 ? (
          <p style={{ ...muted, fontSize: 13, margin: '0 0 4px' }}>No profiles yet — create one below.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }} role="tablist" aria-label="Profiles">
              {profiles.map((p) => {
                const isActive = p.id === activeId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveId(p.id)}
                    title={`${p.name} — ${p.mcVersion || 'unknown version'} • ${p.modLoader}`}
                    style={{
                      flexShrink: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius)',
                      border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: isActive ? 'var(--accent-soft)' : 'var(--card)',
                      color: 'var(--text)',
                      maxWidth: 220,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <strong style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</strong>
                      {isActive ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>●</span> : null}
                    </div>
                    <div className="mono" style={{ fontSize: 11, ...muted, marginTop: 2, whiteSpace: 'nowrap' }}>
                      {p.mcVersion || '?'} • {p.modLoader}
                    </div>
                  </button>
                );
              })}
            </div>

            {active ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 8,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--card-2)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13, color: 'var(--text)' }}>{active.name}</strong>
                  <div className="mono" style={{ fontSize: 11, ...muted, marginTop: 2 }}>
                    {active.mcVersion || 'unknown version'} • {active.modLoader}
                    {active.loaderVersion ? ` ${active.loaderVersion}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={launchingId === active.id}
                  onClick={() => void handlePlay(active.id)}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  {launchingId === active.id ? 'Launching…' : '▶ Play'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={deletingId === active.id}
                  onClick={() => void handleDelete(active.id)}
                  aria-label={`Delete ${active.name}`}
                  style={{ fontSize: 12 }}
                >
                  {deletingId === active.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ) : null}
          </>
        )}
        {launchError ? <p style={{ fontSize: 12, color: 'var(--text)', margin: '8px 0 0' }}>⚠ {launchError}</p> : null}

        <form onSubmit={(e) => void handleCreate(e)} style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>New profile</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 12, ...muted }}>
              Name
              <input
                className="input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My modded instance"
                maxLength={64}
              />
            </label>
            <label style={{ fontSize: 12, ...muted }}>
              Minecraft version
              <select className="select" value={createMcVersion} onChange={(e) => setCreateMcVersion(e.target.value)}>
                <option value="">{versionsLoading ? 'Loading…' : 'Select…'}</option>
                {versions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, ...muted }}>
              Loader
              <select
                className="select"
                value={createLoader}
                onChange={(e) => setCreateLoader(e.target.value === 'vanilla' ? 'vanilla' : 'fabric')}
              >
                <option value="fabric">fabric</option>
                <option value="vanilla">vanilla</option>
              </select>
            </label>
          </div>
          {createError ? <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--text)' }}>⚠ {createError}</p> : null}
          <div style={{ marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={creating || !createMcVersion}>
              {creating ? 'Creating…' : 'Create profile'}
            </button>
          </div>
        </form>
      </Card>

      {/* 2 — Mod browser */}
      <Card>
        <div style={{ ...rowBetween, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Mod browser</h3>
          <span style={{ fontSize: 12, ...muted }}>
            {active ? (
              <>
                for <strong style={{ color: 'var(--text)' }}>{active.name}</strong> ({active.mcVersion || 'unknown version'})
              </>
            ) : (
              'select a profile first'
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder={active ? `🔍  Search mods for ${active.mcVersion || 'your version'}…` : '🔍  Select a profile to browse…'}
            value={query}
            disabled={!active}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch(query.trim(), active?.mcVersion ?? '');
              }
            }}
            style={{ flex: 1, minWidth: 200 }}
            aria-label="Search mods"
          />
          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value === 'popular' || e.target.value === 'newest' ? e.target.value : 'relevance')}
            disabled={!active}
            aria-label="Sort mods"
            title={sort === 'newest' ? 'Newest uses title order (no date field from API)' : 'Sort order'}
            style={{ width: 'auto' }}
          >
            <option value="relevance">Relevance</option>
            <option value="popular">Popular</option>
            <option value="newest">Newest</option>
          </select>
          <button
            type="button"
            className="btn-ghost"
            disabled={!active || searching}
            onClick={() => void runSearch(query.trim(), active?.mcVersion ?? '')}
          >
            Search
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {!active ? (
            <p style={{ ...muted, fontSize: 13, margin: 0 }}>No active profile — pick one above to browse mods.</p>
          ) : searching ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }} aria-label="Searching mods">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : searchError ? (
            <div style={errBox}>
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>⚠ {searchError}</p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void runSearch(query.trim(), active.mcVersion ?? '')}
              >
                Retry
              </button>
            </div>
          ) : sortedResults.length === 0 ? (
            <p style={{ ...muted, fontSize: 13, margin: 0 }}>
              {query ? `No results for “${query}”.` : 'Type to search — e.g. sodium, iris, lithium.'}
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12, ...muted, margin: '0 0 8px' }}>
                {sortedResults.length} result{sortedResults.length === 1 ? '' : 's'} • sorted by{' '}
                {sort === 'popular' ? 'downloads' : sort === 'newest' ? 'title (A–Z)' : 'relevance'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {sortedResults.map((m) => (
                  <ModCard
                    key={m.slug}
                    mod={m}
                    installing={installingSlug === m.slug}
                    installed={!!installOk[m.slug]}
                    installError={installErr[m.slug] ?? null}
                    onInstall={(s) => void handleInstall(s)}
                    onSelect={(sel) => setSelected({ slug: sel.slug, title: sel.title, description: sel.description, iconUrl: sel.iconUrl, downloads: sel.downloads, clientSide: sel.clientSide })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* 3 — Installed */}
      <Card>
        <div style={{ ...rowBetween, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Installed</h3>
          <span style={{ fontSize: 12, ...muted }}>
            {active ? `${installed.length} mod${installed.length === 1 ? '' : 's'} in ${active.name}` : 'no profile selected'}
          </span>
          {active ? (
            <span style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                className="btn-ghost"
                disabled={installedLoading}
                onClick={() => void refreshInstalled(active.id)}
              >
                ↻ Refresh
              </button>
            </span>
          ) : null}
        </div>
        {active ? (
          <p className="mono" style={{ fontSize: 11, ...muted, margin: '0 0 8px' }}>
            {active.mcVersion || 'unknown version'} • {active.modLoader}
            {active.loaderVersion ? ` ${active.loaderVersion}` : ''}
          </p>
        ) : null}

        {!active ? (
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>Select a profile to see installed mods.</p>
        ) : installedLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Loading installed mods">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" aria-hidden="true" />
              <span style={{ fontSize: 13, ...muted }}>Loading installed mods…</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 52, borderRadius: 'var(--radius)', background: 'var(--card-2)', border: '1px solid var(--border)' }} />
            ))}
          </div>
        ) : installedError ? (
          <div style={errBox}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>⚠ {installedError}</p>
            <button type="button" className="btn-ghost" onClick={() => void refreshInstalled(active.id)}>
              Retry
            </button>
          </div>
        ) : installed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 12px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>No mods installed yet</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, ...muted }}>Browse above and hit Install — mods land in this profile.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modActionError ? (
              <div style={errBox}>
                <p style={{ margin: 0, fontSize: 12 }}>⚠ {modActionError}</p>
              </div>
            ) : null}
            {installed.map((m) => (
              <div
                key={m.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--card)',
                  opacity: removingSlug === m.slug ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text)' }}>{m.name}</strong>
                    {m.version ? (
                      <span className="mono" style={{ fontSize: 11, ...muted }}>
                        {m.version}
                      </span>
                    ) : null}
                  </div>
                  <div className="mono" style={{ fontSize: 11, ...muted, marginTop: 2 }}>
                    {m.slug}
                    {m.file ? ` • ${m.file}` : ''} • {m.enabled ? 'enabled' : 'disabled'}
                  </div>
                </div>
                <Toggle
                  checked={m.enabled}
                  label={togglingSlug === m.slug ? '…' : undefined}
                  onChange={(v) => void handleToggle(m.slug, v)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={removingSlug === m.slug}
                  onClick={() => void handleRemove(m.slug)}
                  style={{ fontSize: 12 }}
                >
                  {removingSlug === m.slug ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 4 — Detail modal */}
      {selected ? (
        <div
          role="presentation"
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.title}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card)', padding: 20 }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {selected.iconUrl ? (
                <img
                  src={selected.iconUrl}
                  alt=""
                  width={64}
                  height={64}
                  style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 14,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    fontSize: 28,
                    color: 'var(--text)',
                    background: 'var(--card-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {(selected.title || selected.slug || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 17, color: 'var(--text)' }}>{selected.title}</h3>
                <p className="mono" style={{ margin: '2px 0 0', fontSize: 11, ...muted }}>{selected.slug}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text2)' }}>⬇ {formatDownloads(selected.downloads)}</span>
                  {typeof selected.clientSide === 'string' && selected.clientSide ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--green-soft)', color: 'var(--green)' }}>
                      {selected.clientSide}
                    </span>
                  ) : selected.clientSide === true ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--green-soft)', color: 'var(--green)' }}>
                      Client-side
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '14px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selected.description || 'No description available.'}
            </p>
            <p style={{ fontSize: 12, ...muted, margin: '12px 0 0' }}>
              Installs the latest Fabric build for {active ? `“${active.name}” (${active.mcVersion || 'unknown MC version'})` : 'the active profile’s MC version'}.
            </p>
            {installErr[selected.slug] ? (
              <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--red)' }}>⚠ {installErr[selected.slug]}</p>
            ) : null}
            {installOk[selected.slug] ? (
              <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--green)', fontWeight: 700 }}>✓ Installed</p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button ref={closeBtnRef} type="button" className="btn-ghost" onClick={() => setSelected(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!active || installingSlug === selected.slug}
                onClick={() => void handleInstall(selected.slug)}
              >
                {installingSlug === selected.slug ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Mods;
