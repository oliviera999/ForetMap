import React, { useMemo, useState } from 'react';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { resolveRoleText } from '../constants/help';
import { DialogShell } from './DialogShell';

function HelpPanel({
  sectionId,
  title,
  entries = [],
  isTeacher = false,
  isPulsing = false,
  onMarkSeen,
  onOpen,
  onDismiss,
}) {
  const [open, setOpen] = useState(false);
  useOverlayHistoryBack(open, () => setOpen(false));

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
        onClick={() => {
          onOpen?.(sectionId);
          setOpen(true);
        }}
      >
        ?
      </button>
      {open ? (
        <DialogShell
          open={open}
          onClose={closePanel}
          overlayClassName="modal-overlay modal-overlay--help-panel"
          dialogClassName="log-modal fm-help-panel fade-in"
          ariaLabel={title}
          showCloseButton
          closeButtonLabel="Fermer l aide"
        >
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
                onDismiss?.(sectionId);
                closePanel();
              }}
            >
              Ne plus afficher
            </button>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}

export { HelpPanel };
