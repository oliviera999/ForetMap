import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Pied de l'assistant de lancement.
 * Composant feuille prop-driven : à l'étape « fund », boutons Annuler / Lancer ;
 * sinon un simple bouton Fermer. Toutes les actions remontent via callbacks
 * (les appels de sort restent dans le parent).
 *
 * @param {string} step étape courante du wizard
 * @param {boolean} busy
 * @param {boolean} fundLoading
 * @param {boolean} canLaunch brouillon prêt et présent
 * @param {()=>void} onCancelDraft
 * @param {()=>void} onLaunch
 * @param {()=>void} onClose
 */
export function GLSpellCastFooter({
  step,
  busy = false,
  fundLoading = false,
  canLaunch = false,
  onCancelDraft,
  onLaunch,
  onClose,
}) {
  return (
    <footer className="gl-spell-cast-panel__footer">
      {step === 'fund' ? (
        <>
          <GLButton
            type="button"
            variant="ghost"
            disabled={busy || fundLoading}
            onClick={onCancelDraft}
          >
            Annuler le brouillon
          </GLButton>
          <GLButton
            type="button"
            variant="primary"
            disabled={!canLaunch || busy || fundLoading}
            onClick={onLaunch}
          >
            Lancer le sortilège
          </GLButton>
        </>
      ) : (
        <GLButton type="button" variant="ghost" onClick={onClose}>
          Fermer
        </GLButton>
      )}
    </footer>
  );
}
