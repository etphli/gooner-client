import React from 'react';

const TitleBar: React.FC<{ title?: string }> = ({ title = 'Gooner Client' }) => (
  <div className="titlebar" style={{ position: 'relative', paddingLeft: 78 }}>
    <span aria-hidden="true" style={{ display: 'flex', gap: 8 }}>
      <span className="dot" style={{ background: '#ff5f57' }} />
      <span className="dot" style={{ background: '#febc2e' }} />
      <span className="dot" style={{ background: '#28c840' }} />
    </span>
    <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontWeight: 600, fontSize: 13, color: 'var(--text2)', pointerEvents: 'none' }}>{title}</span>
  </div>
);
export default TitleBar;
