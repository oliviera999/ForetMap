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
  const kind = String(pres.kind || event?.eventType || 'unknown');
  const title = String(pres.title || event?.eventType || 'Évènement');
  const body = String(pres.body || '').trim();
  const imageUrl = pres.imageUrl ? String(pres.imageUrl) : '';
  const technical = pres.technical != null ? pres.technical : event?.payload || {};
  const hasTechnical = technical && typeof technical === 'object' && Object.keys(technical).length > 0;

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
          <span className="gl-hint">{pres.actorLabel}</span>
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
      {hasTechnical ? (
        <details className="gl-journal-event__details">
          <summary>Détails techniques</summary>
          <pre>{JSON.stringify(technical, null, 2)}</pre>
        </details>
      ) : null}
    </li>
  );
}
