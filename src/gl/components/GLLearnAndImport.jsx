import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { isLearnedIn } from '../utils/glLearningFields.js';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';
import { GLJournalImportButton } from './GLJournalImportButton.jsx';
import { GLFeuilletDiscoveryPopover } from './GLFeuilletDiscoveryPopover.jsx';

/**
 * Contrôles « marquer comme appris/lu/découvert » (avec quiz-gating éventuel) +
 * « importer dans mon journal » pour un élément du site. Composant autonome :
 * il récupère lui-même l'état d'acquisition du joueur. À déposer sur la page de
 * l'élément. L'import n'est proposé qu'une fois l'élément acquis.
 *
 * Si le backend renvoie un `feuilletRevealed` (acquisition ③ d'un feuillet du
 * pool de chapitre à la 1re consultation gatée), un popover « nouveau feuillet ! »
 * est affiché — même flux que la découverte de zone/espèce.
 *
 * @param {string} resourceType
 * @param {string|number} resourceRef
 * @param {string} title - libellé de l'élément (affiché dans le carnet)
 * @param {string} [acknowledgePath] - endpoint d'accusé (défaut : endpoint générique)
 * @param {boolean} [enableGating=true]
 * @param {boolean} [journalEnabled=true] - module carnet actif
 * @param {number|string|null} [gameId] - partie courante (transmise pour l'acquisition ③)
 * @param {number|string|null} [teamId] - équipe courante (transmise pour l'acquisition ③)
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
  gameId = null,
  teamId = null,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
}) {
  const [learned, setLearned] = useState(false);
  const [feuilletDiscovery, setFeuilletDiscovery] = useState(null);
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

  // Transmet gameId/teamId au backend pour l'acquisition ③ (le backend retombe
  // sinon sur le contexte JWT, mais on reste explicite quand on les connaît).
  const requestBody = useMemo(() => {
    const body = {};
    const gid = Number(gameId);
    if (Number.isFinite(gid) && gid > 0) body.gameId = gid;
    const tid = Number(teamId);
    if (Number.isFinite(tid) && tid > 0) body.teamId = tid;
    return Object.keys(body).length ? body : undefined;
  }, [gameId, teamId]);

  const handleAcknowledged = useCallback((data) => {
    setLearned(true);
    if (data?.feuilletRevealed) setFeuilletDiscovery(data.feuilletRevealed);
  }, []);

  const closeFeuilletDiscovery = useCallback(() => setFeuilletDiscovery(null), []);

  const markFeuilletRead = useCallback(async () => {
    const code = feuilletDiscovery?.feuilletCode;
    const gid = Number(gameId);
    if (!code || !Number.isFinite(gid) || gid <= 0) return;
    try {
      await apiGL(
        `/api/gl/lore/games/${gid}/feuillets/${encodeURIComponent(code)}/read`,
        'POST',
        teamId ? { teamId: Number(teamId) } : {},
      );
    } catch (_) {
      /* lecture best-effort */
    }
  }, [feuilletDiscovery?.feuilletCode, gameId, teamId]);

  const canMarkRead = (() => {
    const gid = Number(gameId);
    return Number.isFinite(gid) && gid > 0;
  })();

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
        requestBody={requestBody}
        onAcknowledged={handleAcknowledged}
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
      <GLFeuilletDiscoveryPopover
        open={!!feuilletDiscovery}
        feuillet={feuilletDiscovery}
        onClose={closeFeuilletDiscovery}
        onMarkRead={markFeuilletRead}
        showMarkRead={canMarkRead}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        onOpenLoreTerm={onOpenLoreTerm}
        glossaryLinkItems={glossaryLinkItems}
        loreGlossaryLinkItems={loreGlossaryLinkItems}
      />
    </div>
  );
}
