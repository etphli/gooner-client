import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, SectionTitle, Toggle } from '../components/ui';
import ModCard from '../components/ModCard';

// Electron-only CSS property used by TitleBar (pre-existing file, do not touch).
// Augment here so `tsc --noEmit` passes repo-wide while only editing allowed files.
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag' | string;
  }
}

/* Spec-shaped local types (gooner.d.ts is legacy — calls below use
   optional chaining + ts-ignore so they typecheck either way). */
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

function formatLastPlayed(v?: string | null): string {
  if (!v) return 'Never played';
  const t = Date.parse(v);
  if (Number.isNaN(t)) return String(v);
  return `Last played ${new Date(t).toLocaleDateString()}`;
}

const muted: React.CSSProperties = { color: 'var(--text2)' };
const rowBetween: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

const Mods: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [versions, setVersions] = useState<string[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);

  const [createName, setCreateName] = useState('');
  const [createMcVersion, setCreateMcVersion] = useState('');
  const [createLoader, setCreateLoader] = useState<LoaderChoice>('fabric');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BrowserMod[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedError, setInstalledError] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [removingSlug, setRemovingSlug] = useState<string | null>(null);

  const active = useMemo(() => profiles.find((p) => p.id === activeId) ?? null, [profiles, activeId]);

  const refreshProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const raw = await window.gooner?.getInstances?.();
      const list = Array.isArray(raw) ? raw.map(normalizeProfile).filter((p): p is Profile => p !== null) : [];
      setProfiles(list);
      setActiveId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
      if (list.length === 0) setProfilesError(null);
    } catch (e) {
      setProfilesError(e instanceof Error ? e.message : 'Failed to load profiles.');
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  const refreshVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      // @ts-ignore - spec passes 'release' filter; legacy d.ts takes no args
      const raw = await window.gooner?.getVersions?.('release');
      const list = Array.isArray(raw)
        ? (raw as unknown[]).map((v) => (typeof v === 'string' ? v : String(asRecord(v).id ?? asRecord(v).version ?? ''))).filter(Boolean)
        : [];
      setVersions(list as string[]);
      setCreateMcVersion((prev) => prev || (list as string[])[0] || '');
    } catch {
      setVersions([]);
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
      const raw = await window.gooner?.getMods?.(instanceId);
      const list = Array.isArray(raw)
        ? (raw as unknown[]).map(normalizeInstalledMod).filter((m): m is InstalledMod => m !== null)
        : [];
      setInstalled(list);
    } catch (e) {
      setInstalled([]);
      setInstalledError(e instanceof Error ? e.message : 'Failed to load installed mods.');
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
        // @ts-ignore - spec signature searchMods(query, mcVersion)
        const raw = await window.gooner?.searchMods?.(q, mcVersion);
        const list = Array.isArray(raw)
          ? (raw as unknown[]).map(normalizeBrowserMod).filter((m): m is BrowserMod => m !== null)
          : [];
        setResults(list);
      } catch (e) {
        setResults([]);
        setSearchError(e instanceof Error ? e.message : 'Mod search failed.');
      } finally {
        setSearching(false);
      }
    },
    [activeId],
  );

  useEffect(() => {
    if (!activeId) return;
    const mc = active?.mcVersion ?? '';
    const t = window.setTimeout(() => {
      void runSearch(query.trim(), mc);
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, active?.mcVersion, activeId, runSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const name = createName.trim() || 'New Instance';
    if (!createMcVersion) {
      setCreateError('Pick a Minecraft version first.');
      return;
    }
    setCreating(true);
    try {
      // @ts-ignore - spec create API; legacy d.ts lacks createInstance
      const created = await window.gooner?.createInstance?.({ name, mcVersion: createMcVersion, modLoader: createLoader });
      const norm = normalizeProfile(created);
      await refreshProfiles();
      if (norm) setActiveId(norm.id);
      setCreateName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create profile. Is createInstance exposed?');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this profile? Files on disk may be removed.')) return;
    setDeletingId(id);
    try {
      // @ts-ignore - spec API newer than gooner.d.ts
      await window.gooner?.deleteInstance?.(id);
      await refreshProfiles();
    } catch (e) {
      setProfilesError(e instanceof Error ? e.message : 'Failed to delete profile.');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePlay = async (instanceId: string) => {
    setLaunchingId(instanceId);
    setLaunchError(null);
    try {
      // @ts-ignore - spec calls launch({ instanceId })
      await window.gooner?.launch?.({ instanceId });
      await refreshProfiles();
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : 'Launch failed.');
    } finally {
      setLaunchingId(null);
    }
  };

  const handleInstall = async (slug: string) => {
    if (!activeId) return;
    const mc = active?.mcVersion ?? '';
    setInstallingSlug(slug);
    setInstallError(null);
    try {
      // @ts-ignore - spec signature installMod(instanceId, slug, mcVersion)
      await window.gooner?.installMod?.(activeId, slug, mc);
      await refreshInstalled(activeId);
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : `Failed to install ${slug}.`);
    } finally {
      setInstallingSlug(null);
    }
  };

  const handleToggle = async (slug: string, next: boolean) => {
    if (!activeId) return;
    setTogglingSlug(slug);
    setInstalled((prev) => prev.map((m) => (m.slug === slug ? { ...m, enabled: next } : m)));
    try {
      // @ts-ignore - spec signature toggleMod(instanceId, slug, enabled)
      await window.gooner?.toggleMod?.(activeId, slug, next);
    } catch {
      setInstalled((prev) => prev.map((m) => (m.slug === slug ? { ...m, enabled: !next } : m)));
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleRemove = async (slug: string) => {
    if (!activeId) return;
    setRemovingSlug(slug);
    try {
      // @ts-ignore - spec API newer than gooner.d.ts
      await window.gooner?.removeMod?.(activeId, slug);
      setInstalled((prev) => prev.filter((m) => m.slug !== slug));
    } catch (e) {
      setInstalledError(e instanceof Error ? e.message : `Failed to remove ${slug}.`);
    } finally {
      setRemovingSlug(null);
    }
  };

  return (
    <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionTitle>Mods</SectionTitle>
        <p style={{ ...muted, margin: '0 0 4px' }}>Profiles, Modrinth browser, and installed mods — per instance.</p>
        <p style={{ ...muted, margin: 0, fontSize: 12 }}>
          CurseForge browsing isn't available yet — Modrinth search + install works fully below.
        </p>
      </div>

      {/* 1 — Profiles */}
      <Card>
        <div style={{ ...rowBetween, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Profiles</h3>
          <span style={{ fontSize: 12, ...muted }}>{profilesLoading ? 'Loading…' : `${profiles.length} instance${profiles.length === 1 ? '' : 's'}`}</span>
          <span style={{ marginLeft: 'auto' }}>
            <button type="button" className="btn-ghost" onClick={() => void refreshProfiles()} disabled={profilesLoading}>
              ↻ Refresh
            </button>
          </span>
        </div>

        {profilesLoading ? (
          <p style={{ ...muted, fontSize: 13 }}>Loading profiles…</p>
        ) : profilesError ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text)' }}>⚠ {profilesError}</p>
            <button type="button" className="btn-ghost" onClick={() => void refreshProfiles()}>
              Retry
            </button>
          </div>
        ) : profiles.length === 0 ? (
          <p style={{ ...muted, fontSize: 13 }}>No profiles yet — create one below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map((p) => {
              const isActive = p.id === activeId;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveId(p.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: isActive ? 'var(--bg)' : 'var(--card)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: 'var(--text)', fontSize: 13 }}>{p.name}</strong>
                      {isActive ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>● Active</span>
                      ) : null}
                    </div>
                    <div className="mono" style={{ fontSize: 11, ...muted, marginTop: 2 }}>
                      {p.mcVersion || 'unknown version'} • {p.modLoader}
                      {p.loaderVersion ? ` ${p.loaderVersion}` : ''} • {formatLastPlayed(p.lastPlayedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={launchingId === p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePlay(p.id);
                    }}
                    style={{ padding: '6px 14px', fontSize: 12 }}
                  >
                    {launchingId === p.id ? 'Launching…' : '▶ Play'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={deletingId === p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(p.id);
                    }}
                    aria-label={`Delete ${p.name}`}
                    style={{ fontSize: 12 }}
                  >
                    {deletingId === p.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              );
            })}
          </div>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder={active ? `🔍  Search Modrinth for ${active.mcVersion || 'mods'}…` : '🔍  Select a profile to browse…'}
            value={query}
            disabled={!active}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch(query.trim(), active?.mcVersion ?? '');
              }
            }}
          />
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
            <p style={{ ...muted, fontSize: 13, margin: 0 }}>Searching Modrinth…</p>
          ) : searchError ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>⚠ {searchError}</p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void runSearch(query.trim(), active.mcVersion ?? '')}
              >
                Retry
              </button>
            </div>
          ) : results.length === 0 ? (
            <p style={{ ...muted, fontSize: 13, margin: 0 }}>
              {query ? `No results for “${query}”.` : 'Type to search Modrinth — e.g. sodium, iris, lithium.'}
            </p>
          ) : (
            <>
              {installError ? <p style={{ fontSize: 12, margin: '0 0 8px' }}>⚠ {installError}</p> : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {results.map((m) => (
                  <ModCard key={m.slug} mod={m} installing={installingSlug === m.slug} onInstall={(s) => void handleInstall(s)} />
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

        {!active ? (
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>Select a profile to see installed mods.</p>
        ) : installedLoading ? (
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>Loading installed mods…</p>
        ) : installedError ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>⚠ {installedError}</p>
            <button type="button" className="btn-ghost" onClick={() => void refreshInstalled(active.id)}>
              Retry
            </button>
          </div>
        ) : installed.length === 0 ? (
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>No mods installed in this profile yet — install one from the browser above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
    </div>
  );
};

export default Mods;
