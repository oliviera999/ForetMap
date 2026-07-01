import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { isLearnedIn } from '../utils/glLearningFields.js';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';
import { GLJournalImportButton } from './GLJournalImportButton.jsx';

/**
 * Contrôles « marquer comme appris/lu/découvert » (avec quiz-gating éventuel) +
 * « importer dans mon journal » pour un élément du site. Composant autonome :
 * il récupère lui-même l'état d'acquisition du joueur. À déposer sur la page de
 * l'élément. L'import n'est proposé qu'une fois l'élément acquis.
 *
 * @param {string} resourceType
 * @param {string|number} resourceRef
 * @param {string} title - libellé de l'élément (affiché dans le carnet)
 * @param {string} [acknowledgePath] - endpoint d'accusé (défaut : endpoint générique)
 * @param {boolean} [enableGating=true]
 * @param {boolean} [journalEnabled=true] - module carnet actif
 */
export function GLLearnAndImport({
  resourceType,
  resourceRef,
  title,
  acknowledgePath,
  enableGating = true,
  journalEnabled = true,
  acknowledgeLabel = 'Marquer comme appris',
  learnedLabel = '✓ Appris',
  confirmIntro,
}) {
  const [learned, setLearned] = useState(false);
  const [alreadyImported, setAlreadyImported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!resourceType || resourceRef == null || resourceRef === '') return undefined;
    const ref = String(resourceRef);
    // Défensif : tolère un apiGL qui lève ou renvoie une valeur non-promesse (tests isolés).
    Promise.resolve()
      .then(() => apiGL('/api/gl/learning/me'))
      .then((res) => {
        if (!cancelled && isLearnedIn(res, resourceType, ref)) setLearned(true);
      })
      .catch(() => {});
    // État « déjà dans mon journal » chargé dès l'affichage (endpoint léger : type + ref).
    Promise.resolve()
      .then(() => apiGL('/api/gl/player-journal/me/imports/refs'))
      .then((res) => {
        const refs = Array.isArray(res?.refs) ? res.refs : [];
        const found = refs.some(
          (r) => r?.resourceType === resourceType && String(r?.resourceRef) === ref,
        );
        if (!cancelled && found) setAlreadyImported(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resourceType, resourceRef]);

  const path =
    acknowledgePath ||
    `/api/gl/learning/mark/${encodeURIComponent(resourceType)}/${encodeURIComponent(String(resourceRef))}`;

  return (
    <div className="gl-inline-actions gl-learn-import">
      <GLLearningAcknowledgeButton
        acknowledgePath={path}
        resourceType={resourceType}
        resourceRef={resourceRef}
        enableGating={enableGating}
        isDone={learned}
        itemTitle={title}
        labelAction={acknowledgeLabel}
        labelDone={learnedLabel}
        confirmIntro={confirmIntro}
        onAcknowledged={() => setLearned(true)}
      />
      <GLJournalImportButton
        resourceType={resourceType}
        resourceRef={resourceRef}
        title={title}
        learned={learned}
        alreadyImported={alreadyImported}
        enabled={journalEnabled}
        onImported={() => setAlreadyImported(true)}
      />
    </div>
  );
}
