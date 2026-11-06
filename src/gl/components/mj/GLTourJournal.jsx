import { useEffect } from 'react';
import { useGlGameJournal } from '../../hooks/useGlGameJournal.js';

/**
 * Journal latéral de l'écran du tour : noms d'équipe seulement, jamais d'identité d'élève
 * (les payloads privés sont déjà réduits par le serveur pour tout autre spectateur).
 */
export function GLTourJournal({ gameId, token, refreshKey = 0, limit = 40 }) {
  const journal = useGlGameJournal({ gameId, token, limit });
  useEffect(() => {
    journal.reload?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  return (
    <aside className="gl-tour-journal" aria-label="Journal du tour" data-testid="gl-tour-journal">
      <h3>Journal</h3>
      {journal.error ? <p className="gl-error-banner">{journal.error}</p> : null}
      <ul>
        {journal.events.slice(0, limit).map((evt) => (
          <li
            key={evt.id}
            className={`gl-tour-journal__item gl-tour-journal__item--${evt.eventType}`}
          >
            <strong>{evt.presentation?.title || evt.eventType}</strong>
            {evt.presentation?.teamLabel ? <span> · {evt.presentation.teamLabel}</span> : null}
            {evt.presentation?.body ? <p>{evt.presentation.body}</p> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
