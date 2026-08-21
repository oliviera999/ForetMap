import React, { useEffect, useState } from 'react';

import { MascotSpeaker } from '../../shared/components/MascotSpeaker.jsx';
import { useGlNarrator } from '../hooks/useGlNarrator.js';

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

function renderHelpBody(body) {
  const text = String(body || '').trim();
  if (!text) return null;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1 && !text.includes('•') && !text.startsWith('-')) {
    return <p>{text}</p>;
  }
  return (
    <ul className="gl-help-list">
      {lines.map((line) => (
        <li key={line}>{line.replace(/^[-•]\s*/, '')}</li>
      ))}
    </ul>
  );
}

/**
 * Affiche un encadré d'aide contextuelle GL avec mémorisation par clé.
 *
 * L'en-tête porte le portrait `face` du narrateur OLU — décoratif (`aria-hidden`), donc
 * jamais porteur d'information, et éteint par le seul interrupteur global partagé avec
 * ForetMap (`docs/MASCOT_NARRATEUR_OLU.md` §8.2 et §9.4).
 */
export function GLHelpPanel({ helpKey, title, body, defaultOpen = true }) {
  const [seen, setSeen] = useState(true);
  const [open, setOpen] = useState(defaultOpen);
  const { narrator } = useGlNarrator();

  useEffect(() => {
    setSeen(readSeen(helpKey));
  }, [helpKey]);

  if (!helpKey || !String(body || '').trim()) return null;
  return (
    <aside className={`gl-help-panel ${seen ? 'is-seen' : 'is-pulse'}`}>
      <header>
        <strong className="gl-help-panel__title">
          <MascotSpeaker
            className="gl-help-panel__portrait"
            narrator={narrator}
            expression="neutre"
            size="face"
          />
          <span>{title || 'Aide'}</span>
        </strong>
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
      {open ? <div className="gl-help-panel-body">{renderHelpBody(body)}</div> : null}
    </aside>
  );
}
