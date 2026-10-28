import { useEffect, useRef, useState } from 'react';

import { FRESQUE_LEVELS } from './fresqueCore.js';

/**
 * Menu « Niveau » : Éclaireur / Explorateur / Expert, changeable à tout moment sans rien
 * perdre. Libellés et résumés viennent de `hints.levels`.
 */
export function FresqueLevelMenu({ level, levels, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = levels?.[level] || { label: level };
  return (
    <div className="fm-fresque-level" ref={rootRef}>
      <button
        type="button"
        className="fm-fresque-btn"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        data-testid="fm-fresque-level-btn"
      >
        Niveau : {current.label} ▾
      </button>
      {open ? (
        <div className="fm-fresque-level__menu" role="menu" aria-label="Choisir un niveau">
          {FRESQUE_LEVELS.map((key) => {
            const def = levels?.[key] || { label: key, summary: '' };
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={key === level ? 'true' : 'false'}
                className="fm-fresque-level__option"
                onClick={() => {
                  onChange?.(key);
                  setOpen(false);
                }}
                data-testid={`fm-fresque-level-${key}`}
              >
                <strong>{def.label}</strong>
                <small>{def.summary}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Choix du niveau à l'étape Découvrir : trois cartes-boutons. */
export function FresqueLevelPicker({ level, levels, onChange }) {
  return (
    <div className="fm-fresque-levels" role="radiogroup" aria-label="Niveau de l’activité">
      {FRESQUE_LEVELS.map((key) => {
        const def = levels?.[key] || { label: key, summary: '' };
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === level ? 'true' : 'false'}
            className="fm-fresque-level__option"
            onClick={() => onChange?.(key)}
            data-testid={`fm-fresque-pick-${key}`}
          >
            <strong>{def.label}</strong>
            <small>{def.summary}</small>
          </button>
        );
      })}
    </div>
  );
}
