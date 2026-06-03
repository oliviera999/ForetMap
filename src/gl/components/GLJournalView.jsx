import React, { useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLTextarea } from './ui/GLTextarea.jsx';
import { GLJournalEventCard } from './GLJournalEventCard.jsx';
import { GLImageInlineInsertControls } from './GLImageInlineInsertControls.jsx';
import { useGlGameJournal } from '../hooks/useGlGameJournal.js';

export function GLJournalView({
  gameId,
  token,
  canEmit = false,
  defaultTeamId = null,
  narrationEnabled = true,
}) {
  const [teamFilterId, setTeamFilterId] = useState(
    defaultTeamId != null ? String(defaultTeamId) : ''
  );
  const [chronological, setChronological] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeImageUrl, setComposeImageUrl] = useState('');
  const [composeTeamId, setComposeTeamId] = useState(
    defaultTeamId != null ? String(defaultTeamId) : ''
  );
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState('');

  const resolvedTeamFilter = useMemo(() => {
    if (teamFilterId === '') return null;
    const n = Number(teamFilterId);
    return Number.isFinite(n) ? n : null;
  }, [teamFilterId]);

  const { events, teams, error, loading, reload } = useGlGameJournal({
    gameId,
    token,
    teamFilterId: resolvedTeamFilter,
    limit: 200,
    chronological,
  });

  async function sendNarration(event) {
    event.preventDefault();
    if (!gameId || !canEmit || !narrationEnabled) return;
    const text = String(composeText || '').trim();
    if (!text) {
      setComposeError('Saisissez un texte pour la narration.');
      return;
    }
    const teamId = composeTeamId !== '' ? Number(composeTeamId) : null;
    setComposeBusy(true);
    setComposeError('');
    try {
      const payload = { text };
      const imageUrl = String(composeImageUrl || '').trim();
      if (imageUrl) payload.imageUrl = imageUrl;
      await apiGL(`/api/gl/games/${gameId}/events`, 'POST', {
        eventType: 'narration',
        teamId,
        payload,
      });
      setComposeText('');
      setComposeImageUrl('');
      await reload();
    } catch (err) {
      setComposeError(err.message || 'Envoi impossible');
    } finally {
      setComposeBusy(false);
    }
  }

  if (!gameId) {
    return (
      <section className="gl-panel">
        <h2>Journal de partie</h2>
        <p className="gl-hint">Aucune partie sélectionnée.</p>
      </section>
    );
  }

  return (
    <section className="gl-panel gl-journal-panel">
      <header className="gl-journal-panel__head">
        <h2>Journal de partie</h2>
        <p className="gl-hint">
          Fil chronologique des actions MJ et des évènements de jeu (déplacements, scores, sortilèges…).
        </p>
      </header>

      {error ? <p className="gl-error">{error}</p> : null}

      <div className="gl-journal-toolbar">
        <GLField label="Filtrer par équipe">
          <select
            className="gl-input"
            value={teamFilterId}
            onChange={(e) => setTeamFilterId(e.target.value)}
          >
            <option value="">Toute la partie</option>
            {teams.map((team) => (
              <option key={team.id} value={String(team.id)}>
                {team.name || `Équipe #${team.id}`}
              </option>
            ))}
          </select>
        </GLField>
        <label className="gl-journal-toolbar__order">
          <input
            type="checkbox"
            checked={chronological}
            onChange={(e) => setChronological(e.target.checked)}
          />
          Ordre chronologique
        </label>
        <GLButton type="button" variant="secondary" onClick={reload} disabled={loading}>
          {loading ? 'Chargement…' : 'Rafraîchir'}
        </GLButton>
      </div>

      {canEmit && narrationEnabled ? (
        <form className="gl-journal-compose gl-animate-in" onSubmit={sendNarration}>
          <h3>Ajouter une narration</h3>
          {composeError ? <p className="gl-error">{composeError}</p> : null}
          <GLField label="Équipe concernée (optionnel)">
            <select
              className="gl-input"
              value={composeTeamId}
              onChange={(e) => setComposeTeamId(e.target.value)}
            >
              <option value="">Toute la partie</option>
              {teams.map((team) => (
                <option key={team.id} value={String(team.id)}>
                  {team.name || `Équipe #${team.id}`}
                </option>
              ))}
            </select>
          </GLField>
          <GLField label="Texte">
            <GLTextarea
              rows={3}
              value={composeText}
              placeholder="Annonce, conséquence de scène, indice…"
              onChange={(e) => setComposeText(e.target.value)}
            />
          </GLField>
          {composeImageUrl ? (
            <p className="gl-hint">
              Image jointe : <code>{composeImageUrl}</code>{' '}
              <GLButton type="button" variant="secondary" onClick={() => setComposeImageUrl('')}>
                Retirer
              </GLButton>
            </p>
          ) : null}
          <GLImageInlineInsertControls
            legend="Illustration (optionnelle)"
            intro="Ajoutez une image de la bibliothèque média à cette entrée de journal."
            onInsert={({ url }) => setComposeImageUrl(String(url || '').trim())}
            onStatus={(msg, isErr) => {
              if (isErr) setComposeError(msg);
            }}
          />
          <div className="gl-inline-actions">
            <GLButton type="submit" disabled={composeBusy}>
              {composeBusy ? 'Envoi…' : 'Publier'}
            </GLButton>
          </div>
        </form>
      ) : null}

      <ul className="gl-journal-events" aria-live="polite" aria-relevant="additions">
        {events.map((evt) => (
          <GLJournalEventCard key={evt.id} event={evt} />
        ))}
        {events.length === 0 && !loading ? (
          <li className="gl-empty gl-hint">
            <span className="gl-empty-icon" aria-hidden>
              📓
            </span>
            Aucun évènement pour le moment. Les actions du MJ et du plateau apparaîtront ici.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
