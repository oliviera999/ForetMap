import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLJournalView({ gameId }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/journal/games/${gameId}?limit=200`);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }, [gameId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!gameId) {
    return (
      <section className="gl-panel">
        <h2>Journal de partie</h2>
        <p className="gl-hint">Aucune partie sélectionnée.</p>
      </section>
    );
  }

  return (
    <section className="gl-panel">
      <h2>Journal de partie</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-inline-actions">
        <button type="button" onClick={reload}>Rafraîchir</button>
      </div>
      <ul className="gl-journal-events">
        {events.map((evt) => (
          <li key={evt.id} className={`gl-journal-event gl-journal-${evt.eventType}`}>
            <strong>{evt.eventType}</strong>
            <span className="gl-hint">{new Date(evt.createdAt || Date.now()).toLocaleString('fr-FR')}</span>
            <pre>{JSON.stringify(evt.payload || {}, null, 2)}</pre>
          </li>
        ))}
        {events.length === 0 ? <li className="gl-hint">Aucun évènement.</li> : null}
      </ul>
    </section>
  );
}
