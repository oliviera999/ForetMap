import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';

function formatWhen(createdAt) {
  try {
    return new Date(createdAt || Date.now()).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch (_) {
    return '';
  }
}

export function GLJournalEventCard({ event }) {
  const pres = event?.presentation || {};
  const kind = String(pres.kind || 'other');
  const title = String(pres.title || 'Évènement');
  const body = String(pres.body || '').trim();
  const imageUrl = pres.imageUrl ? String(pres.imageUrl) : '';

  const bodyHtml =
    kind === 'narration' && body
      ? renderMarkdownToSafeHtml(body, { allowImages: false })
      : null;

  return (
    <li className={`gl-journal-event gl-journal-${kind}`}>
      <header className="gl-journal-event__head">
        <strong className="gl-journal-event__title">{title}</strong>
        <time className="gl-hint" dateTime={event?.createdAt || undefined}>
          {formatWhen(event?.createdAt)}
        </time>
      </header>
      <div className="gl-journal-event__meta">
        {pres.teamLabel ? (
          <span className="gl-journal-event__badge">{pres.teamLabel}</span>
        ) : null}
        {pres.actorLabel ? (
          <span className="gl-journal-event__actor">{pres.actorLabel}</span>
        ) : null}
      </div>
      {bodyHtml ? (
        <div
          className="gl-journal-event__body gl-markdown"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : body ? (
        <p className="gl-journal-event__body">{body}</p>
      ) : null}
      {imageUrl ? (
        <figure className="gl-journal-event__figure">
          <img src={imageUrl} alt={title} loading="lazy" className="gl-journal-event__img" />
        </figure>
      ) : null}
    </li>
  );
}
