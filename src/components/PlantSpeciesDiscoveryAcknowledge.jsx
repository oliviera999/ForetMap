import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError, createContextComment, getAuthToken } from '../services/api';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { AttachmentImagesPicker } from './attachment-images-picker';
import { DialogShell } from './DialogShell';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { PlantDiscoveryObservedCounts } from './PlantDiscoveryObservedCounts.jsx';
import { LearningAcknowledgeButton } from '../shared/components/LearningAcknowledgeButton.jsx';
import { LearningQuizPopover } from '../shared/components/LearningQuizPopover.jsx';
import { createFmGatingHandlers } from '../shared/utils/learningGatingChallengeClient.js';
import { IconCheck } from '../shared/icons.jsx';

const MIN_CONTEXT_COMMENT_CHARS = 2;

/**
 * Bouton + modal pour confirmer une observation d’espèce (terrain + lecture de fiche).
 * N’affiche rien si aucune session (pas de jeton).
 *
 * @param {boolean} [offerPlantCommentAfterObservation] — si vrai, après validation propose un commentaire (texte et/ou photos) sur la fiche (`contextType` plant).
 */
export function PlantSpeciesDiscoveryAcknowledgeButton({
  plantId,
  speciesName,
  myObservationCount = 0,
  siteObservationCount = 0,
  onAcknowledged,
  onForceLogout,
  offerPlantCommentAfterObservation = false,
  /** Résumé du conditionnement pour cette fiche (chargé en lot par la vue). */
  gatingSummary = null,
}) {
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichBody, setEnrichBody] = useState('');
  const [enrichImages, setEnrichImages] = useState([]);
  const [enrichSaving, setEnrichSaving] = useState(false);
  const [enrichError, setEnrichError] = useState('');
  const [enrichToast, setEnrichToast] = useState('');

  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();
  const gatingHandlers = useMemo(() => createFmGatingHandlers(api), []);
  const gatingResource = useMemo(
    () => ({ resourceType: 'plant', resourceRef: String(plantId) }),
    [plantId],
  );
  const my = Math.max(0, Number(myObservationCount) || 0);
  const site = Math.max(0, Number(siteObservationCount) || 0);
  const hasObserved = my > 0;

  const busy = enrichSaving;

  useOverlayHistoryBack(enrichOpen, () => {
    if (!busy) setEnrichOpen(false);
  });

  useEffect(() => {
    if (!enrichOpen) {
      setEnrichBody('');
      setEnrichImages([]);
      setEnrichError('');
      setEnrichToast('');
    }
  }, [enrichOpen]);

  useEffect(() => {
    if (!enrichToast) return undefined;
    const t = setTimeout(() => setEnrichToast(''), 2400);
    return () => clearTimeout(t);
  }, [enrichToast]);

  const submitDiscovery = useCallback(async () => {
    const pid = Number(plantId);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new Error('Fiche espèce invalide — recharge la page ou rouvre le catalogue.');
    }
    const res = await api(`/api/plants/${pid}/acknowledge-discovery`, 'POST', { confirm: true });
    if (!res || res.success !== true) {
      throw new Error('Réponse serveur inattendue. Réessayez ou recharge la page.');
    }
    onAcknowledged?.(pid, {
      my_observation_count: Number(res.my_observation_count) || 0,
      site_observation_count: Number(res.site_observation_count) || 0,
    });
  }, [plantId, onAcknowledged]);

  const submitEnrichment = useCallback(
    async (onClose) => {
      const trimmed = String(enrichBody || '').trim();
      const imgs = Array.isArray(enrichImages) ? enrichImages : [];
      if (trimmed.length < MIN_CONTEXT_COMMENT_CHARS && imgs.length === 0) {
        setEnrichError(
          `Saisis au moins ${MIN_CONTEXT_COMMENT_CHARS} caractères ou ajoute une photo.`,
        );
        return;
      }
      setEnrichSaving(true);
      setEnrichError('');
      try {
        await createContextComment({
          contextType: 'plant',
          contextId: String(plantId),
          body: trimmed.length >= MIN_CONTEXT_COMMENT_CHARS ? trimmed : undefined,
          images: imgs.length ? imgs : undefined,
        });
        onClose?.();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        setEnrichError(e?.message || 'Erreur');
      } finally {
        setEnrichSaving(false);
      }
    },
    [enrichBody, enrichImages, plantId, onForceLogout],
  );

  if (!hasToken) return null;

  const renderEnrichStep = (open, onClose) => (
    <DialogShell
      open={open}
      onClose={() => !busy && onClose()}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in tuto-read-ack-modal"
      ariaLabelledBy="plant-discovery-enrich-title"
      closeOnOverlay={!busy}
      showCloseButton
      closeButtonLabel="Fermer"
      closeButtonDisabled={busy}
    >
      <h3 id="plant-discovery-enrich-title">Enrichir ta observation ?</h3>
      <p className="tuto-read-ack-intro">
        Tu peux publier un court commentaire sur la fiche{' '}
        <strong>« {speciesName || 'cette espèce'} »</strong> (lieu, comportement, stade…) et joindre
        jusqu’à trois photos. Ce passage est optionnel.
      </p>
      <div style={{ marginBottom: 8 }}>
        <MarkdownTextarea
          className="task-log-comment-input"
          style={{ width: '100%', minHeight: 72, marginTop: 6, resize: 'vertical' }}
          rows={3}
          maxLength={4000}
          value={enrichBody}
          onChange={(e) => setEnrichBody(e.target.value)}
          disabled={enrichSaving}
          placeholder="Ex. : vu près du compost, fleurs blanches, plusieurs pieds…"
          aria-label="Commentaire pour enrichir l’observation"
        />
      </div>
      <AttachmentImagesPicker
        value={enrichImages}
        onChange={setEnrichImages}
        disabled={enrichSaving}
        onNotify={(msg) => setEnrichToast(msg)}
        label="Photos (optionnel, max 3, JPEG / PNG / WebP)"
      />
      {enrichError ? <p className="tuto-read-ack-error">{enrichError}</p> : null}
      {enrichToast ? (
        <p
          className="tuto-read-ack-intro"
          style={{ marginTop: 6, color: 'var(--leaf)' }}
          role="status"
        >
          {enrichToast}
        </p>
      ) : null}
      <div className="tuto-read-ack-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={enrichSaving}
          onClick={onClose}
        >
          Plus tard
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={enrichSaving}
          onClick={() => submitEnrichment(onClose)}
        >
          {enrichSaving ? 'Publication…' : 'Publier sur la fiche'}
        </button>
      </div>
    </DialogShell>
  );

  // Bouton commun aux deux cas — première observation ET ré-observation.
  //
  // La ré-observation empruntait auparavant une branche entièrement séparée : une modale
  // maison, sans conditionnement ni popover. Dès qu'un élève avait observé l'espèce une
  // fois, plus aucune question ne lui était jamais posée sur cette fiche. Ce n'était pas
  // une décision, c'était une divergence de code.
  const ackButton = (
    <LearningAcknowledgeButton
      labelAction={hasObserved ? 'Espèce observée' : 'Espèce découverte'}
      labelDone={
        <>
          <IconCheck size={14} /> Observée
        </>
      }
      titleDone="Tu as confirmé cette observation"
      itemTitle={speciesName}
      buttonClassName={
        hasObserved
          ? 'btn btn-secondary btn-sm plant-discovery-observed-btn'
          : 'btn btn-secondary btn-sm'
      }
      confirmIntro={
        hasObserved ? (
          <>
            Tu confirmes une observation supplémentaire pour l&apos;espèce{' '}
            <strong>« {speciesName || 'cette fiche'} »</strong> : observation réelle sur le terrain
            et prise de connaissance des informations de la fiche.
          </>
        ) : (
          <>
            En validant, tu confirmes pour l&apos;espèce{' '}
            <strong>« {speciesName || 'cette fiche'} »</strong> que tu as réellement observé
            l&apos;être vivant sur le terrain et pris connaissance des informations présentées sur
            la fiche.
          </>
        )
      }
      confirmCheckboxLabel="J'ai observé réellement l'espèce sur le terrain et pris connaissance des informations de la fiche."
      gatingHandlers={gatingHandlers}
      gatingResource={gatingResource}
      gatingSummary={gatingSummary}
      enableGating
      // Même popover que le tutoriel : la question surgit par-dessus la fiche.
      Shell={LearningQuizPopover}
      overlayClassName="fm-quiz-popover fm-quiz-popover--ack"
      dialogClassName="fm-quiz-popover__panel animate-pop"
      onSubmit={async () => {
        try {
          await submitDiscovery();
        } catch (e) {
          if (e instanceof AccountDeletedError) onForceLogout?.();
          throw e;
        }
      }}
      onDone={() => {
        if (offerPlantCommentAfterObservation) setEnrichOpen(true);
      }}
    />
  );

  return (
    <>
      {hasObserved ? (
        <div className="plant-discovery-observed-wrap">
          {ackButton}
          <PlantDiscoveryObservedCounts my={my} site={site} />
        </div>
      ) : (
        ackButton
      )}
      {enrichOpen ? renderEnrichStep(enrichOpen, () => setEnrichOpen(false)) : null}
    </>
  );
}

/**
 * Compteurs d’observations par fiche pour l’utilisateur connecté et tout le site.
 * @param {number[]} plantIds
 * @returns {Promise<Record<string, { my_observation_count: number, site_observation_count: number }>>}
 */
export async function fetchPlantObservationCounts(plantIds) {
  if (!getAuthToken() || !Array.isArray(plantIds) || plantIds.length === 0) return {};
  const unique = [];
  const seen = new Set();
  for (const raw of plantIds) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
    if (unique.length >= 200) break;
  }
  if (unique.length === 0) return {};
  try {
    const q = encodeURIComponent(unique.join(','));
    const res = await api(`/api/plants/me/observation-counts?plant_ids=${q}`);
    return res && typeof res.counts === 'object' && res.counts != null ? res.counts : {};
  } catch {
    return {};
  }
}
