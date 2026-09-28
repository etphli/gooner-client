import React from 'react';

// NOTE: macOS renders NATIVE traffic lights (close/minimize/zoom) via
// titleBarStyle:hiddenInset in the main process — never draw fake dots here.
// This bar only reserves left space for them and centers the title.
const TitleBar: React.FC<{ title?: string; right?: React.ReactNode }> = ({ title = 'Gooner Client', right }) => (
  <div className="titlebar" style={{ position: 'relative', paddingLeft: 78, paddingRight: 12 }}>
    <span style={{ position: 'absolute', left: 78, right: 12, textAlign: 'center', fontWeight: 600, fontSize: 13, color: 'var(--text2)', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' as const }}>{right}</span>
  </div>
);
export default TitleBar;
