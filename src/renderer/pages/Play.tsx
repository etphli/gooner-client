import React, { useEffect, useState } from 'react';
import { Card, ProgressBar, SectionTitle } from '../components/ui';
import type { Instance } from '../gooner';

const Play: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([{ id: 'main', name: 'Main Survival', version: '1.21.1', loader: 'fabric' }]);
  const [instanceId, setInstanceId] = useState('main');
  const [versions, setVersions] = useState<string[]>(['1.21.1', '1.20.4', '1.20.1']);
  const [version, setVersion] = useState('1.21.1');
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [task, setTask] = useState('Idle');

  useEffect(() => {
    window.gooner?.getInstances().then((l) => { if (l?.length) { setInstances(l); setInstanceId(l[0].id); } }).catch(() => undefined);
    window.gooner?.getVersions().then((v) => { if (v?.length) { setVersions(v); setVersion(v[0]); } }).catch(() => undefined);
  }, []);

  const launch = async () => {
    setLaunching(true); setProgress(2); setTask('Preparing…');
    const off = window.gooner?.onLaunchProgress?.((p) => { setProgress(p.percent); setTask(p.task); });
    const t = window.setInterval(() => setProgress((p) => (p < 90 ? p + Math.random() * 6 : p)), 400);
    try {
      await window.gooner?.launch?.({ instanceId, version });
      setProgress(100); setTask('Running');
    } catch {
      setTask('Failed — see logs');
    } finally {
      window.clearInterval(t); off?.();
      window.setTimeout(() => setLaunching(false), 800);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <SectionTitle>Play</SectionTitle>
      <p style={{ color: 'var(--text2)', margin: '0 0 16px' }}>Pick an instance, lock a version, hit Play.</p>
      <Card style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 120, height: 120, borderRadius: 16, flexShrink: 0, background: 'linear-gradient(135deg,#30d158,#0a84ff 60%,#bf5af2)', display: 'grid', placeItems: 'center', fontSize: 52 }}>⛏️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="play-instance" style={{ fontSize: 12, color: 'var(--text2)' }}>Instance</label>
          <select id="play-instance" className="select" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.name}{i.loader ? ` — ${i.loader}` : ''}</option>)}
          </select>
          <div style={{ height: 10 }} />
          <label htmlFor="play-version" style={{ fontSize: 12, color: 'var(--text2)' }}>Version</label>
          <select id="play-version" className="select" value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </Card>
      <div style={{ height: 14 }} />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-primary" style={{ fontSize: 15, padding: '10px 34px' }} disabled={launching} onClick={launch}>
            {launching ? 'Launching…' : '▶  Play'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text2)' }} className="mono">{progress.toFixed(0)}% • {task}</span>
        </div>
        <div style={{ marginTop: 12 }}><ProgressBar percent={progress} /></div>
      </Card>
    </div>
  );
};
export default Play;
