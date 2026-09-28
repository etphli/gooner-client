import React, { useCallback, useEffect, useState } from 'react';
import { Card, PageHeader, ProgressBar, SegmentedControl } from '../components/ui';
import type { Instance } from '../gooner';

type VersionFilter = 'release' | 'snapshot';

interface ExtGooner {
  getInstances?: () => Promise<unknown>;
  createInstance?: (input: { name: string; mcVersion: string; modLoader?: string }) => Promise<unknown>;
  getVersions?: (filter?: string) => Promise<unknown>;
  launch?: (opts: { instanceId: string; version?: string }) => Promise<unknown>;
  cancelLaunch?: () => Promise<unknown>;
  onLaunchProgress?: (cb: (p: { percent: number; task: string }) => void) => (() => void) | void;
}

function asInstances(v: unknown): Instance[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[]).filter((i) => i && typeof i.id === 'string').map((i) => ({
    id: String(i.id),
    name: typeof i.name === 'string' ? String(i.name) : String(i.id),
    version: typeof i.version === 'string' ? String(i.version) : '',
    loader: typeof i.loader === 'string' ? String(i.loader) : undefined,
  }));
}

function asStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).filter((x): x is string => typeof x === 'string');
}

function isReleaseVersion(v: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(v.trim());
}

const FALLBACK_VERSIONS = ['1.21.1', '1.21.10', '1.21.11', '1.20.4', '1.20.1'];

const Play: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [filter, setFilter] = useState<VersionFilter>('release');
  const [versions, setVersions] = useState<string[]>(FALLBACK_VERSIONS);
  const [version, setVersion] = useState('1.21.1');
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [task, setTask] = useState('Idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInstances(true);
      try {
        const ext = window.gooner as unknown as ExtGooner | undefined;
        const list = asInstances(await ext?.getInstances?.());
        if (cancelled) return;
        if (list.length > 0) {
          setInstances(list);
          setInstanceId((cur) => (list.some((i) => i.id === cur) ? cur : list[0].id));
        } else {
          // First run: create a real default profile so Play always has a target.
          try {
            const created = await ext?.createInstance?.({ name: 'Main', mcVersion: '1.21.1', modLoader: 'fabric' });
            const fresh = asInstances(await ext?.getInstances?.());
            if (cancelled) return;
            if (fresh.length > 0) {
              setInstances(fresh);
              const asRec = created as Record<string, unknown> | undefined;
              const cid = typeof asRec?.id === 'string' ? (asRec.id as string) : fresh[0].id;
              setInstanceId(fresh.some((i) => i.id === cid) ? cid : fresh[0].id);
            } else {
              setError('Could not create the default profile. Create one in Mods → Profiles.');
            }
          } catch (e) {
            if (!cancelled) setError(`Profiles unavailable: ${(e as Error)?.message ?? e}. Create one in Mods → Profiles.`);
          }
        }
      } catch (e) {
        if (!cancelled) setError(`Profiles unavailable: ${(e as Error)?.message ?? e}`);
      } finally {
        if (!cancelled) setLoadingInstances(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadVersions = useCallback(async (f: VersionFilter) => {
    setLoadingVersions(true);
    try {
      const ext = window.gooner as unknown as ExtGooner | undefined;
      let list: string[] = [];
      try {
        const raw = await ext?.getVersions?.(f);
        list = asStrings(raw);
      } catch {
        list = [];
      }
      // Backend may ignore the filter (release-only). Apply client-side filter.
      if (list.length) {
        const filtered = f === 'release' ? list.filter(isReleaseVersion) : list.filter((v) => !isReleaseVersion(v));
        // If backend returned release-only but snapshot requested, try the live manifest.
        if (filtered.length) {
          list = filtered;
        } else if (f === 'snapshot') {
          try {
            const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
            if (res.ok) {
              const j = (await res.json()) as { versions?: { id: string; type: string }[] };
              const all = (j.versions ?? []).map((x) => x.id).filter(Boolean);
              if (all.length) list = all.filter((v) => !isReleaseVersion(v));
            }
          } catch { /* keep backend list */ }
          if (!list.some((v) => !isReleaseVersion(v))) {
            // Graceful fallback: show what we have with a note.
            setError('No snapshots from local cache — showing releases.');
            try {
              list = asStrings(await ext?.getVersions?.('release')) ?? [];
            } catch {
              list = [];
            }
            if (!list.length) list = FALLBACK_VERSIONS;
          } else {
            setError('');
          }
        }
      }
      if (!list.length) {
        // Last resort: try unfiltered, then fallback constants.
        try {
          const rawAll = await ext?.getVersions?.();
          const all = asStrings(rawAll);
          if (all.length) list = f === 'release' ? all.filter(isReleaseVersion) : all;
        } catch { /* ignore */ }
      }
      if (!list.length) list = FALLBACK_VERSIONS;
      else setError((prev) => (f === 'release' ? '' : prev));
      setVersions(list);
      setVersion((cur) => (list.includes(cur) ? cur : list[0]));
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => { void loadVersions(filter); }, [filter, loadVersions]);

  const launch = async () => {
    if (launching || !instanceId) return;
    setLaunching(true);
    setError('');
    setProgress(1);
    setTask('Preparing…');
    const ext = window.gooner as unknown as ExtGooner | undefined;
    let off: (() => void) | void;
    try {
      off = ext?.onLaunchProgress?.((p) => {
        if (typeof p?.percent === 'number') setProgress(p.percent);
        if (p?.task) setTask(p.task);
      });
    } catch {
      off = undefined;
    }
    try {
      // Spec: launch({ instanceId }); keep version for back-compat backends.
      await ext?.launch?.({ instanceId, version });
      setProgress(100);
      setTask('Running');
    } catch (e) {
      setTask('Failed');
      setError(`Launch failed: ${(e as Error)?.message ?? e}`);
    } finally {
      if (typeof off === 'function') { try { off(); } catch { /* ignore */ } }
      window.setTimeout(() => setLaunching(false), 800);
    }
  };

  const cancel = async () => {
    try {
      await (window.gooner as unknown as ExtGooner | undefined)?.cancelLaunch?.();
      setTask('Cancelled');
    } catch { /* ignore */ }
    setLaunching(false);
  };

  const inst = instances.find((i) => i.id === instanceId);

  return (
    <div className="page">
      <PageHeader
        title="Play"
        sub="Pick an instance, lock a version, hit Play."
        actions={
          <SegmentedControl
            ariaLabel="Version type"
            value={filter}
            onChange={(v) => setFilter(v as VersionFilter)}
            options={[
              { value: 'release', label: 'Releases' },
              { value: 'snapshot', label: 'Snapshots' },
            ]}
          />
        }
      />
      <Card style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 14, flexShrink: 0, background: 'linear-gradient(135deg,#2563eb,#9333ea)', display: 'grid', placeItems: 'center', fontSize: 42 }} aria-hidden>⛏️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="label" htmlFor="play-instance">Instance</label>
          {loadingInstances ? (
            <div className="tiny muted">Loading profiles…</div>
          ) : instances.length === 0 ? (
            <div className="tiny muted">No profiles yet — create one in Mods → Profiles, then come back.</div>
          ) : (
            <select id="play-instance" className="select" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              {instances.map((i) => <option key={i.id} value={i.id}>{i.name}{i.loader ? ` — ${i.loader}` : ''}</option>)}
            </select>
          )}
          <div style={{ height: 8 }} />
          <label className="label" htmlFor="play-version">Version {loadingVersions ? '· loading…' : `· ${versions.length}`}</label>
          <select id="play-version" className="select mono" value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {inst?.version && <div className="tiny muted" style={{ marginTop: 4 }}>Instance default: <span className="mono">{inst.version}</span></div>}
        </div>
      </Card>
      <div style={{ height: 10 }} />
      <Card>
        <div className="row">
          <button className="btn-primary" style={{ fontSize: 14, padding: '9px 30px' }} disabled={launching || !instanceId} onClick={() => void launch()}>
            {launching ? (<><span className="spinner" aria-hidden /><span>Launching…</span></>) : '▶  Play'}
          </button>
          {launching && <button className="btn-ghost" onClick={() => void cancel()}>Cancel</button>}
          <span className="mono tiny muted" style={{ marginLeft: 'auto' }}>{Math.round(progress)}% • {task}</span>
        </div>
        <div style={{ marginTop: 10 }}><ProgressBar percent={progress} /></div>
        {error && <div className="status-line" style={{ marginTop: 10 }}>{error}</div>}
      </Card>
    </div>
  );
};
export default Play;
