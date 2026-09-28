import { useEffect, useState } from 'react';
import { UPDATER_BANNER_EVENT, type UpdaterBannerDetail } from './UpdateBanner';

/**
 * Tiny top-right update dot for the title bar. Listens to the same
 * `gooner:update-banner` window event the banner broadcasts — no bridge
 * coupling, display-only. Green dot when an update is ready/downloading.
 */
export default function UpdateDot() {
  const [show, setShow] = useState(false);
  const [label, setLabel] = useState('Update available');

  useEffect(() => {
    const onEvent = (e: Event): void => {
      try {
        const d = (e as CustomEvent<UpdaterBannerDetail>).detail;
        if (!d) return;
        if (d.status === 'downloaded') {
          setLabel(`Restart to install ${d.version ? `v${d.version}` : 'update'}`);
          setShow(true);
        } else if (d.status === 'available' || d.status === 'downloading') {
          setLabel(`Downloading update${d.version ? ` v${d.version}` : ''}… ${Math.round(d.percent)}%`);
          setShow(true);
        } else if (d.status === 'error' || d.status === 'not-available' || d.status === 'idle') {
          setShow(false);
        }
      } catch {
        /* ignore */
      }
    };
    try {
      window.addEventListener(UPDATER_BANNER_EVENT, onEvent);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        window.removeEventListener(UPDATER_BANNER_EVENT, onEvent);
      } catch {
        /* ignore */
      }
    };
  }, []);

  if (!show) return null;
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: 'var(--green)',
        boxShadow: '0 0 0 3px color-mix(in srgb, var(--green) 25%, transparent)',
        flexShrink: 0,
      }}
    />
  );
}
