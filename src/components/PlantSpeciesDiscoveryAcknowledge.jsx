import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  AccountDeletedError,
  createContextComment,
  getAuthClaims,
  getAuthToken,
  isLikelyNetworkTransportFailure,
} from '../services/api';
import { useOverlayHistoryBack } from '../shared/platform/useOverlayHistoryBack';
import { AttachmentImagesPicker } from './attachment-images-picker';
import { DialogShell } from './DialogShell';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { PlantDiscoveryObservedCounts } from './PlantDiscoveryObservedCounts.jsx';
import { LearningAcknowledgeButton } from '../shared/components/LearningAcknowledgeButton.jsx';
import { LearningQuizPopover } from '../shared/components/LearningQuizPopover.jsx';
import { createFmGatingHandlers } from '../shared/utils/learningGatingChallengeClient.js';
import { IconCheck } from '../shared/icons.jsx';
import { FmLearnAndImportSlot } from './journal/FmLearnAndImportSlot.jsx';
import { withPedagoSessionScope } from '../utils/pedagoSessionScope.js';
import { chunkIds, normalizePlantIds } from '../utils/biodivCatalogLoad.js';
import {
  enqueuePlantObservation,
  flushPlantObservationQueue,
  newObservationClientUuid,
} from '../utils/plantObservationQueue.js';

const MIN_CONTEXT_COMMENT_CHARS = 2;

/** Épreuve et validation annoncent la séance en cours : elle impose son niveau. */
const gatingApi = withPedagoSessionScope(api);

function currentUserId() {
  const claims = typeof getAuthClaims === 'function' ? getAuthClaims() : null;
  const id = claims?.canonicalUserId ?? claims?.userId;
  return id == null ? '' : String(id);
}

function sendQueuedObservation(item) {
  return api(`/api/plants/${item.plant_id}/acknowledge-discovery`, 'POST', {
    confirm: true,
    client_uuid: item.client_uuid,
  });
}

/** Rejoue les observations mises en file sans réseau (un seul rejeu à la fois). */
function flushQueuedObservations() {
  return flushPlantObservationQueue(sendQueuedObservation, currentUserId()).catch(() => null);
}

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

  const [queuedNotice, setQueuedNotice] = useState('');

  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();
  const my = Math.max(0, Number(myObservationCount) || 0);
  const site = Math.max(0, Number(siteObservationCount) || 0);
  const hasObserved = my > 0;

  // Sans réseau, l'observation peut être mise en file seulement si le serveur ne posera pas de
  // question à son arrivée : ré-observation (il saute alors le contrôle) ou fiche dont le
  // résumé, chargé en ligne, dit qu'elle n'est pas conditionnée (audit du 25/09, piste D).
  const offlineAllowedRef = useRef(false);
  offlineAllowedRef.current = hasObserved || (!!gatingSummary && gatingSummary.required === false);

  const gatingHandlers = useMemo(() => {
    const base = createFmGatingHandlers(gatingApi);
    return {
      ...base,
      fetchChallenge: async (...args) => {
        try {
          return await base.fetchChallenge(...args);
        } catch (err) {
          if (offlineAllowedRef.current && isLikelyNetworkTransportFailure(err)) {
            return { gating_enabled: false, required: false, questions: [], offline: true };
          }
          throw err;
        }
      },
    };
  }, []);

  useEffect(() => {
    if (!hasToken || typeof window === 'undefined') return undefined;
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void flushQueuedObservations();
    }
    const onOnline = () => void flushQueuedObservations();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [hasToken]);
  const gatingResource = useMemo(
    () => ({ resourceType: 'plant', resourceRef: String(plantId) }),
    [plantId],
  );
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
    const clientUuid = newObservationClientUuid();
    let res;
    try {
      res = await gatingApi(`/api/plants/${pid}/acknowledge-discovery`, 'POST', {
        confirm: true,
        client_uuid: clientUuid,
      });
    } catch (err) {
      const userId = currentUserId();
      if (!offlineAllowedRef.current || !userId || !isLikelyNetworkTransportFailure(err)) {
        throw err;
      }
      enqueuePlantObservation({ user_id: userId, plant_id: pid, client_uuid: clientUuid });
      setQueuedNotice('Pas de réseau : ton observation est gardée et partira toute seule.');
      onAcknowledged?.(pid, { my_observation_count: my + 1, site_observation_count: site + 1 });
      return;
    }
    setQueuedNotice('');
    if (!res || res.success !== true) {
      throw new Error('Réponse serveur inattendue. Réessayez ou recharge la page.');
    }
    onAcknowledged?.(pid, {
      my_observation_count: Number(res.my_observation_count) || 0,
      site_observation_count: Number(res.site_observation_count) || 0,
    });
  }, [plantId, onAcknowledged, my, site]);

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
      <FmLearnAndImportSlot
        resourceType="plant"
        resourceRef={plantId}
        title={speciesName}
        learned={hasObserved}
      >
        {hasObserved ? (
          <div className="plant-discovery-observed-wrap">
            {ackButton}
            <PlantDiscoveryObservedCounts my={my} site={site} />
          </div>
        ) : (
          ackButton
        )}
        {queuedNotice ? (
          <p className="plant-discovery-queued" role="status">
            {queuedNotice}
          </p>
        ) : null}
      </FmLearnAndImportSlot>
      {enrichOpen ? renderEnrichStep(enrichOpen, () => setEnrichOpen(false)) : null}
    </>
  );
}

/**
 * Compteurs d’observations par fiche pour l’utilisateur connecté et tout le site.
 * Le serveur borne à 200 ids par requête : on découpe en lots et on fusionne
 * (`src/utils/biodivCatalogLoad.js`, plan charge biodiv 1A).
 * @param {number[]} plantIds
 * @returns {Promise<Record<string, { my_observation_count: number, site_observation_count: number }>>}
 */
export async function fetchPlantObservationCounts(plantIds) {
  if (!getAuthToken() || !Array.isArray(plantIds) || plantIds.length === 0) return {};
  const unique = normalizePlantIds(plantIds);
  if (unique.length === 0) return {};
  const merged = {};
  try {
    for (const batch of chunkIds(unique)) {
      const q = encodeURIComponent(batch.join(','));
      const res = await api(`/api/plants/me/observation-counts?plant_ids=${q}`);
      const counts = res && typeof res.counts === 'object' && res.counts != null ? res.counts : {};
      Object.assign(merged, counts);
    }
    return merged;
  } catch {
    return merged;
  }
}
