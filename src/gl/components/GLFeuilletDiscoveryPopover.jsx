import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GLLoreGlossaryMarkdown } from './GLLoreGlossaryMarkdown.jsx';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLButton } from './ui/GLButton.jsx';

export function GLFeuilletDiscoveryPopover({
  open = false,
  feuillet = null,
  zone = null,
  loading = false,
  error = '',
  onClose,
  onMarkRead,
  onOpenGlossaryTerm,
  onOpenLoreTerm,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  themeStyle = null,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const modeClass = feuillet?.modeApparition
    ? `gl-feui-${String(feuillet.modeApparition).replace(/_/g, '-')}`
    : 'gl-feui-boite';
  const effPct = Number(feuillet?.effacementPct) || 0;

  return createPortal(
    <div
      className="gl-feui-discovery-overlay"
      role="presentation"
      style={themeStyle || undefined}
      onClick={() => onClose?.()}
    >
      <div
        className={`gl-feui-discovery ${modeClass}${effPct >= 100 ? ' is-effaced' : ''}`}
        role="dialog"
        aria-label={feuillet?.titre ? `Feuillet : ${feuillet.titre}` : 'Feuillet découvert'}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gl-feui-discovery__head">
          <p className="gl-feui-discovery__eyebrow">
            {zone?.label ? `Zone · ${zone.label}` : 'Carnet de Sélène'}
          </p>
          <h3>{feuillet?.titre || 'Feuillet'}</h3>
          {feuillet?.incipit ? <p className="gl-feui-discovery__incipit">{feuillet.incipit}</p> : null}
          <button type="button" className="gl-feui-discovery__close" onClick={() => onClose?.()} aria-label="Fermer">✕</button>
        </header>

        {error ? <p className="gl-error">{error}</p> : null}
        {loading ? <p className="gl-hint">Ouverture du feuillet…</p> : null}

        {!loading && feuillet?.displayText ? (
          <div
            className="gl-feui-discovery__body"
            style={effPct > 0 && effPct < 100 ? { opacity: Math.max(0.35, 1 - effPct / 100) } : undefined}
          >
            <GLLoreGlossaryMarkdown
              markdown={feuillet.displayText}
              loreGlossaryItems={loreGlossaryLinkItems}
              onOpenLoreTerm={onOpenLoreTerm}
              className="gl-feui-discovery__text"
            />
            {feuillet.ancrageScientifique ? (
              <aside className="gl-feui-discovery__science">
                <h4>Ancrage scientifique</h4>
                <GLGlossaryMarkdown
                  markdown={feuillet.ancrageScientifique}
                  glossaryItems={glossaryLinkItems}
                  onOpenGlossaryTerm={onOpenGlossaryTerm}
                />
              </aside>
            ) : null}
          </div>
        ) : null}

        <footer className="gl-feui-discovery__foot">
          <GLButton type="button" variant="ghost" onClick={() => onClose?.()}>Fermer</GLButton>
          <GLButton
            type="button"
            onClick={() => {
              onMarkRead?.();
              onClose?.();
            }}
          >
            Marquer comme lu
          </GLButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
