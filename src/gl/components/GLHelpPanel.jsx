import React, { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'gl_help_seen:';

function readSeen(key) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`) === '1';
  } catch (_) {
    return false;
  }
}

function writeSeen(key) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, '1');
  } catch (_) {
    // noop
  }
}

/** Affiche un encadré d'aide contextuelle GL avec mémorisation par clé. */
export function GLHelpPanel({ helpKey, title, children, defaultOpen = true }) {
  const [seen, setSeen] = useState(true);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setSeen(readSeen(helpKey));
  }, [helpKey]);

  if (!helpKey) return null;
  return (
    <aside className={`gl-help-panel ${seen ? 'is-seen' : 'is-pulse'}`}>
      <header>
        <strong>{title || 'Aide'}</strong>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (!seen) {
              writeSeen(helpKey);
              setSeen(true);
            }
          }}
        >
          {open ? 'Masquer' : 'Voir l’aide'}
        </button>
      </header>
      {open ? <div className="gl-help-panel-body">{children}</div> : null}
    </aside>
  );
}
