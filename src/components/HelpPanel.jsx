import React, { useMemo, useState } from 'react';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { resolveRoleText } from '../constants/help';
import { hasDiscoveryTour } from '../constants/discoveryTour';
import { useTour } from '../contexts/TourContext.jsx';
import { DialogShell } from './DialogShell';

function HelpPanel({
  sectionId,
  title,
  entries = [],
  isTeacher = false,
  isPulsing = false,
  panelTitlePrefix = '💡',
  closeButtonText = 'Fermer',
  dismissButtonText = 'Ne plus afficher',
  onMarkSeen,
  onOpen,
  onDismiss,
}) {
  const [open, setOpen] = useState(false);
  useOverlayHistoryBack(open, () => setOpen(false));
  const tour = useTour();

  const visibleEntries = useMemo(() => {
    return (entries || [])
      .map((entry) => resolveRoleText(entry, isTeacher))
      .map((text) => String(text || '').trim())
      .filter(Boolean);
  }, [entries, isTeacher]);

  const canRunTour = !!sectionId && hasDiscoveryTour(sectionId, isTeacher);

  if (visibleEntries.length === 0) return null;

  const closePanel = () => setOpen(false);

  const startTour = () => {
    closePanel();
    tour?.startTour?.(sectionId, { force: true });
  };

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
          closeButtonLabel={closeButtonText}
        >
          <h3 className="fm-help-panel__title">
            {panelTitlePrefix ? `${panelTitlePrefix} ` : ''}
            {title}
          </h3>
          <ul className="fm-help-panel__list">
            {visibleEntries.map((item) => (
              <li key={item} className="fm-help-panel__item">
                {item}
              </li>
            ))}
          </ul>
          <div className="fm-help-panel__actions">
            {canRunTour && (
              <button
                type="button"
                className="btn btn-primary btn-sm fm-help-panel__tour-cta"
                onClick={startTour}
              >
                ▶ Visite guidée
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={closePanel}>
              {closeButtonText}
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
              {dismissButtonText}
            </button>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}

export { HelpPanel };
