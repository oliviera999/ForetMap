import React, { useMemo, useState } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { resolveRoleText } from '../constants/help';

function HelpPanel({
  sectionId,
  title,
  entries = [],
  isTeacher = false,
  isPulsing = false,
  onMarkSeen,
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useDialogA11y(() => setOpen(false));

  const visibleEntries = useMemo(() => {
    return (entries || [])
      .map((entry) => resolveRoleText(entry, isTeacher))
      .map((text) => String(text || '').trim())
      .filter(Boolean);
  }, [entries, isTeacher]);

  if (visibleEntries.length === 0) return null;

  const closePanel = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className={`fm-help-btn ${isPulsing ? 'is-pulsing' : ''}`}
        aria-label={`Ouvrir l aide: ${title}`}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && closePanel()}>
          <div
            ref={dialogRef}
            className="log-modal fm-help-panel fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" type="button" aria-label="Fermer l aide" onClick={closePanel}>✕</button>
            <h3 className="fm-help-panel__title">💡 {title}</h3>
            <ul className="fm-help-panel__list">
              {visibleEntries.map((item) => (
                <li key={item} className="fm-help-panel__item">{item}</li>
              ))}
            </ul>
            <div className="fm-help-panel__actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closePanel}>
                Fermer
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onMarkSeen?.(sectionId);
                  closePanel();
                }}
              >
                Ne plus afficher
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { HelpPanel };
