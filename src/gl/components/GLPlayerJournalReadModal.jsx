import React, { useEffect, useMemo, useState } from 'react';
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

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}

function ReadArticle({ article }) {
  const html = useMemo(
    () =>
      article?.bodyMarkdown
        ? renderMarkdownToSafeHtml(article.bodyMarkdown, {
            allowImages: true,
            allowJournalEmbeds: true,
          })
        : '',
    [article?.bodyMarkdown],
  );
  return (
    <article className="gl-player-journal-read-article">
      <header>
        <h3>{article.title?.trim() || 'Article sans titre'}</h3>
        <p className="gl-hint gl-player-journal-read-meta">
          {article.updatedAt ? <>Modifié le {formatDateTime(article.updatedAt)}</> : null}
          {article.createdAt ? <> · créé le {formatDateTime(article.createdAt)}</> : null}
          {' · '}
          {article.usage?.charCount ?? 0} caractères · {article.usage?.assetCount ?? 0}{' '}
          illustration(s)
        </p>
      </header>
      {html ? (
        <div
          className="gl-markdown gl-player-journal-preview"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="gl-hint">Article sans texte.</p>
      )}
    </article>
  );
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

  const articles = Array.isArray(data?.articles) ? data.articles : [];

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay gl-player-journal-read-modal"
      dialogClassName="fm-modal-panel gl-profile-modal-body gl-player-journal-read-modal__body animate-pop"
      ariaLabelledBy="gl-journal-read-title"
    >
      <header className="gl-profile-modal-head">
        <h2 id="gl-journal-read-title">Carnet de {playerLabel(data?.player)}</h2>
        <GLButton type="button" variant="secondary" onClick={onClose} aria-label="Fermer">
          ✕
        </GLButton>
      </header>
      <div>
        {loading ? <p className="gl-hint">Chargement…</p> : null}
        {error ? <p className="gl-error">{error}</p> : null}
        {!loading && !error && data ? (
          articles.length > 0 ? (
            <div className="gl-player-journal-read-list">
              {articles.map((article) => (
                <ReadArticle key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <p className="gl-hint">Ce joueur n’a pas encore rédigé d’article dans son carnet.</p>
          )
        ) : null}
      </div>
      <GLButton type="button" variant="secondary" onClick={onClose}>
        Fermer
      </GLButton>
    </DialogShell>
  );
}
