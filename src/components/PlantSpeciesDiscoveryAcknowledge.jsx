import React, { useCallback, useEffect, useState } from 'react';
import { api, AccountDeletedError, createContextComment, getAuthToken } from '../services/api';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { AttachmentImagesPicker } from './attachment-images-picker';

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
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState('confirm');
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enrichBody, setEnrichBody] = useState('');
  const [enrichImages, setEnrichImages] = useState([]);
  const [enrichSaving, setEnrichSaving] = useState(false);
  const [enrichError, setEnrichError] = useState('');
  const [enrichToast, setEnrichToast] = useState('');

  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();
  const my = Math.max(0, Number(myObservationCount) || 0);
  const site = Math.max(0, Number(siteObservationCount) || 0);
  const hasObserved = my > 0;

  const busy = saving || enrichSaving;

  useOverlayHistoryBack(modalOpen, () => {
    if (!busy) setModalOpen(false);
  });

  useEffect(() => {
    if (!modalOpen) {
      setPhase('confirm');
      setChecked(false);
      setError('');
      setEnrichBody('');
      setEnrichImages([]);
      setEnrichError('');
      setEnrichToast('');
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!enrichToast) return undefined;
    const t = setTimeout(() => setEnrichToast(''), 2400);
    return () => clearTimeout(t);
  }, [enrichToast]);

  const submit = useCallback(async () => {
    if (!checked) return;
    setSaving(true);
    setError('');
    try {
      const res = await api(`/api/plants/${plantId}/acknowledge-discovery`, 'POST', { confirm: true });
      onAcknowledged?.(Number(plantId), {
        my_observation_count: Number(res?.my_observation_count) || 0,
        site_observation_count: Number(res?.site_observation_count) || 0,
      });
      setChecked(false);
      if (offerPlantCommentAfterObservation) {
        setPhase('enrich');
      } else {
        setModalOpen(false);
      }
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setError(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [checked, plantId, onAcknowledged, onForceLogout, offerPlantCommentAfterObservation]);

  const submitEnrichment = useCallback(async () => {
    const trimmed = String(enrichBody || '').trim();
    const imgs = Array.isArray(enrichImages) ? enrichImages : [];
    if (trimmed.length < MIN_CONTEXT_COMMENT_CHARS && imgs.length === 0) {
      setEnrichError(`Saisis au moins ${MIN_CONTEXT_COMMENT_CHARS} caractères ou ajoute une photo.`);
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
      setModalOpen(false);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setEnrichError(e?.message || 'Erreur');
    } finally {
      setEnrichSaving(false);
    }
  }, [enrichBody, enrichImages, plantId, onForceLogout]);

  const skipEnrichment = useCallback(() => {
    setModalOpen(false);
  }, []);

  if (!hasToken) return null;

  const renderEnrichStep = () => (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !busy && setModalOpen(false)}
    >
      <div
        className="log-modal fade-in tuto-read-ack-modal"
        role="dialog"
        aria-labelledby="plant-discovery-enrich-title"
        aria-modal="true"
      >
        <button
          type="button"
          className="modal-close"
          onClick={() => !busy && setModalOpen(false)}
          aria-label="Fermer"
        >
          ✕
        </button>
        <h3 id="plant-discovery-enrich-title">Enrichir ta observation ?</h3>
        <p className="tuto-read-ack-intro">
          Tu peux publier un court commentaire sur la fiche
          {' '}
          <strong>« {speciesName || 'cette espèce'} »</strong>
          {' '}
          (lieu, comportement, stade…) et joindre jusqu’à trois photos. Ce passage est optionnel.
        </p>
        <div style={{ marginBottom: 8 }}>
          <textarea
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
        {enrichToast ? <p className="tuto-read-ack-intro" style={{ marginTop: 6, color: 'var(--leaf)' }} role="status">{enrichToast}</p> : null}
        <div className="tuto-read-ack-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={enrichSaving} onClick={skipEnrichment}>
            Plus tard
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={enrichSaving} onClick={submitEnrichment}>
            {enrichSaving ? 'Publication…' : 'Publier sur la fiche'}
          </button>
        </div>
      </div>
    </div>
  );

  if (hasObserved) {
    return (
      <>
        <div className="plant-discovery-observed-wrap">
          <button
            type="button"
            className="btn btn-secondary btn-sm plant-discovery-observed-btn"
            onClick={() => setModalOpen(true)}
            title="Enregistrer une nouvelle observation (même engagement : terrain + fiche)"
          >
            Espèce observée
          </button>
          <span className="plant-discovery-observed-counts" aria-live="polite">
            <span className="plant-discovery-observed-counts__mine">Mes observations : {my}</span>
            <span className="plant-discovery-observed-counts__sep" aria-hidden="true">
              {' '}
              ·{' '}
            </span>
            <span className="plant-discovery-observed-counts__site">Tout le site : {site}</span>
          </span>
        </div>
        {modalOpen && (phase === 'enrich' ? renderEnrichStep() : (
          <div
            className="modal-overlay"
            role="presentation"
            onClick={(e) => e.target === e.currentTarget && !saving && setModalOpen(false)}
          >
            <div
              className="log-modal fade-in tuto-read-ack-modal"
              role="dialog"
              aria-labelledby="plant-discovery-ack-title-new"
              aria-modal="true"
            >
              <button
                type="button"
                className="modal-close"
                onClick={() => !saving && setModalOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
              <h3 id="plant-discovery-ack-title-new">Nouvelle observation</h3>
              <p className="tuto-read-ack-intro">
                Tu confirmes une observation supplémentaire pour l&apos;espèce
                {' '}
                <strong>« {speciesName || 'cette fiche'} »</strong>
                {' '}
                : observation réelle sur le terrain et prise de connaissance des informations de la fiche.
              </p>
              <label className="tuto-read-ack-check">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={saving} />
                <span>
                  J&apos;ai observé réellement l&apos;espèce sur le terrain et pris connaissance des informations de la
                  fiche.
                </span>
              </label>
              {error ? <p className="tuto-read-ack-error">{error}</p> : null}
              <div className="tuto-read-ack-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setModalOpen(false)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={!checked || saving} onClick={submit}>
                  {saving ? 'Enregistrement…' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(true)}>
        Espèce découverte
      </button>
      {modalOpen && (phase === 'enrich' ? renderEnrichStep() : (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && !saving && setModalOpen(false)}
        >
          <div
            className="log-modal fade-in tuto-read-ack-modal"
            role="dialog"
            aria-labelledby="plant-discovery-ack-title"
            aria-modal="true"
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => !saving && setModalOpen(false)}
              aria-label="Fermer"
            >
              ✕
            </button>
            <h3 id="plant-discovery-ack-title">Confirmer la découverte</h3>
            <p className="tuto-read-ack-intro">
              En validant, tu confirmes pour l&apos;espèce
              {' '}
              <strong>« {speciesName || 'cette fiche'} »</strong>
              {' '}
              que tu as réellement observé l&apos;être vivant sur le terrain et pris connaissance des informations
              présentées sur la fiche.
            </p>
            <label className="tuto-read-ack-check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={saving} />
              <span>
                J&apos;ai observé réellement l&apos;espèce sur le terrain et pris connaissance des informations de la
                fiche.
              </span>
            </label>
            {error ? <p className="tuto-read-ack-error">{error}</p> : null}
            <div className="tuto-read-ack-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!checked || saving} onClick={submit}>
                {saving ? 'Enregistrement…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** @deprecated Utiliser fetchPlantObservationCounts ; conservé pour compat éventuelle. */
export async function fetchPlantDiscoveredIds() {
  if (!getAuthToken()) return [];
  try {
    const res = await api('/api/plants/me/discovered-ids');
    const ids = Array.isArray(res?.plant_ids) ? res.plant_ids : [];
    return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
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
