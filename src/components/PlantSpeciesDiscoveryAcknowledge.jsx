import React, { useCallback, useEffect, useState } from 'react';
import { api, AccountDeletedError, getAuthToken } from '../services/api';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';

/**
 * Bouton + modal pour confirmer la découverte d’une espèce (terrain + lecture de fiche).
 * N’affiche rien si aucune session (pas de jeton).
 */
export function PlantSpeciesDiscoveryAcknowledgeButton({
  plantId,
  speciesName,
  isDiscovered,
  onAcknowledged,
  onForceLogout,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();

  useOverlayHistoryBack(modalOpen, () => {
    if (!saving) setModalOpen(false);
  });

  useEffect(() => {
    if (!modalOpen) {
      setChecked(false);
      setError('');
    }
  }, [modalOpen]);

  const submit = useCallback(async () => {
    if (!checked) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/plants/${plantId}/acknowledge-discovery`, 'POST', { confirm: true });
      onAcknowledged?.(Number(plantId));
      setModalOpen(false);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setError(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [checked, plantId, onAcknowledged, onForceLogout]);

  if (!hasToken) return null;

  if (isDiscovered) {
    return (
      <span className="task-chip tuto-read-badge" title="Tu as confirmé avoir observé cette espèce sur le terrain et lu la fiche">
        ✓ Découverte confirmée
      </span>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(true)}>
        Espèce découverte
      </button>
      {modalOpen && (
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
      )}
    </>
  );
}

/** Charge les IDs de fiches marquées « espèce découverte » pour l’utilisateur connecté (tableau vide si pas de jeton). */
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
