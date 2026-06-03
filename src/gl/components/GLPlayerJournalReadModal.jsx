import React, { useEffect, useState } from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { apiGL } from '../services/apiGL.js';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';
import { GLButton } from './ui/GLButton.jsx';

function playerLabel(player) {
  if (!player) return 'Joueur';
  const pseudo = String(player.pseudo || '').trim();
  const name = `${player.firstName || ''} ${player.lastName || ''}`.trim();
  if (pseudo && name) return `${pseudo} (${name})`;
  return pseudo || name || `Joueur #${player.id}`;
}

export function GLPlayerJournalReadModal({ playerId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open || !playerId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGL(`/api/gl/player-journal/players/${playerId}`)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Chargement impossible');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, playerId]);

  const previewHtml = data?.bodyMarkdown
    ? renderMarkdownToSafeHtml(data.bodyMarkdown, { allowImages: true, allowJournalEmbeds: true })
    : '';

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay gl-player-journal-read-modal"
      dialogClassName="fm-modal-panel gl-profile-modal-body gl-player-journal-read-modal__body animate-pop"
      ariaLabelledBy="gl-journal-read-title"
    >
      <header className="gl-profile-modal-head">
        <h2 id="gl-journal-read-title">
          Carnet de {playerLabel(data?.player)}
        </h2>
        <GLButton type="button" variant="secondary" onClick={onClose} aria-label="Fermer">
          ✕
        </GLButton>
      </header>
      <div>
        {loading ? <p className="gl-hint">Chargement…</p> : null}
        {error ? <p className="gl-error">{error}</p> : null}
        {!loading && !error && data ? (
          <>
            <p className="gl-hint gl-player-journal-read-meta">
              {data.usage?.charCount ?? 0} caractères · {data.usage?.assetCount ?? 0} illustration(s)
              {data.updatedAt ? (
                <> · modifié le {new Date(data.updatedAt).toLocaleString('fr-FR')}</>
              ) : null}
            </p>
            {previewHtml ? (
              <div
                className="gl-markdown gl-player-journal-preview"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <p className="gl-hint">Ce joueur n’a pas encore rédigé de contenu dans son carnet.</p>
            )}
          </>
        ) : null}
      </div>
      <GLButton type="button" variant="secondary" onClick={onClose}>Fermer</GLButton>
    </DialogShell>
  );
}
