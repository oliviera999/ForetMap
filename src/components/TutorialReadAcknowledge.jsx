import React, { useCallback, useEffect, useState } from 'react';
import { api, AccountDeletedError, getAuthToken } from '../services/api';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { DialogShell } from './DialogShell';

/**
 * Bouton + modal pour marquer un tutoriel comme lu après confirmation explicite.
 * N’affiche rien si aucune session (pas de jeton).
 */
export function TutorialReadAcknowledgeButton({ tutorialId, tutorialTitle, isRead, onAcknowledged, onForceLogout }) {
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
      await api(`/api/tutorials/${tutorialId}/acknowledge-read`, 'POST', { confirm: true });
      onAcknowledged?.(Number(tutorialId));
      setModalOpen(false);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setError(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [checked, tutorialId, onAcknowledged, onForceLogout]);

  if (!hasToken) return null;

  if (isRead) {
    return (
      <span className="task-chip tuto-read-badge" title="Tu as confirmé avoir lu et compris ce tutoriel">
        ✓ Lu
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setModalOpen(true)}
      >
        ✓ Marquer comme lu
      </button>
      {modalOpen ? (
        <DialogShell
          open={modalOpen}
          onClose={() => !saving && setModalOpen(false)}
          overlayClassName="modal-overlay modal-overlay--tuto-read-ack"
          dialogClassName="log-modal fade-in tuto-read-ack-modal"
          ariaLabelledBy="tuto-read-ack-title"
          closeOnOverlay={!saving}
          showCloseButton
          closeButtonLabel="Fermer"
          closeButtonDisabled={saving}
        >
          <h3 id="tuto-read-ack-title">Confirmer la lecture</h3>
          <p className="tuto-read-ack-intro">
            En validant, tu t&apos;engages à avoir lu et compris le tutoriel
            {' '}
            <strong>« {tutorialTitle || 'ce tutoriel'} »</strong>.
          </p>
          <label className="tuto-read-ack-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={saving} />
            <span>Je confirme avoir lu et compris ce contenu.</span>
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
        </DialogShell>
      ) : null}
    </>
  );
}

/** Charge les IDs de tutoriels marqués lus pour l’utilisateur connecté (tableau vide si pas de jeton). */
export async function fetchTutorialReadIds() {
  if (!getAuthToken()) return [];
  try {
    const res = await api('/api/tutorials/me/read-ids');
    const ids = Array.isArray(res?.tutorial_ids) ? res.tutorial_ids : [];
    return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}
