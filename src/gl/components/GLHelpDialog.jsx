import React, { useState } from 'react';

import { DialogShell } from '../../components/DialogShell.jsx';
import { MascotSpeaker } from '../../shared/components/MascotSpeaker.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { useGlNarrator } from '../hooks/useGlNarrator.js';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';
import { renderGlHelpBody } from './glHelpBody.jsx';

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

/**
 * Aide contextuelle GL **appelée** par un bouton « ? », sur le modèle du `HelpPanel`
 * de ForetMap.
 *
 * Remplace, pour les onglets, l'encadré replié en bas de page : un texte qu'il fallait
 * aller chercher sous le contenu n'était lu que par ceux qui descendaient jusqu'à lui.
 * Le bouton pulse tant que l'aide de l'onglet n'a jamais été ouverte, puis se calme —
 * la mémoire par clé (`gl_help_seen:`) est celle de l'ancien encadré, donc un onglet
 * déjà consulté ne redemande pas l'attention.
 *
 * L'encadré inline (`GLHelpPanel`) reste utilisé là où l'aide fait partie de la page
 * elle-même, comme le carnet personnel.
 */
export function GLHelpDialog({ helpKey, isStaff = false, onStartTour = null }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);
  const { title, body } = useGlHelpContent(helpKey, { isStaff });
  const { narrator } = useGlNarrator();

  React.useEffect(() => {
    setSeen(readSeen(helpKey));
  }, [helpKey]);

  if (!helpKey || !String(body || '').trim()) return null;

  const markSeen = () => {
    if (seen) return;
    writeSeen(helpKey);
    setSeen(true);
  };

  return (
    <>
      <button
        type="button"
        className={`gl-help-btn ${seen ? '' : 'is-pulsing'}`}
        aria-label={`Ouvrir l'aide : ${title}`}
        data-gl-help-key={helpKey}
        onClick={() => {
          markSeen();
          setOpen(true);
        }}
      >
        ?
      </button>
      {open ? (
        <DialogShell
          open={open}
          onClose={() => setOpen(false)}
          overlayClassName="gl-help-dialog-overlay"
          dialogClassName="gl-help-dialog fade-in"
          ariaLabel={title}
          showCloseButton
          closeButtonLabel="Fermer"
        >
          <h3 className="gl-help-dialog__title">
            <MascotSpeaker
              className="gl-help-dialog__portrait"
              narrator={narrator}
              expression="neutre"
              size="face"
            />
            <span>{title}</span>
          </h3>
          <div className="gl-help-dialog__body">{renderGlHelpBody(body)}</div>
          <div className="gl-help-dialog__actions">
            {onStartTour ? (
              <GLButton
                type="button"
                className="gl-help-dialog__tour-cta"
                onClick={() => {
                  setOpen(false);
                  onStartTour();
                }}
              >
                ▶ Visite guidée
              </GLButton>
            ) : null}
            <GLButton type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </GLButton>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}
