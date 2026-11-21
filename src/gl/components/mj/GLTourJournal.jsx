import { useEffect } from 'react';
import { useGlGameJournal } from '../../hooks/useGlGameJournal.js';

/**
 * Faits marquants d'une séance (projection) : ce que la classe a envie de voir passer au
 * tableau — une page trouvée ou tenue, un défi relevé, le voile qui avance, une arrivée au
 * camp, une péripétie. Les jets, les fouilles et les réglages restent dans le journal complet.
 */
export const FAITS_MARQUANTS = Object.freeze([
  'page_trouvee',
  'page_tenue',
  'defi_case_releve',
  'defi_trame_reussi',
  'voile_avance',
  'arrivee_camp',
  'peripetie',
]);

/** Profondeur de lecture du journal quand on n'en garde que les faits marquants. */
const LECTURE_MARQUANTS = 100;

/** Les `limit` faits marquants les plus récents d'une liste d'évènements (ordre conservé). */
export function faitsMarquants(events, limit = 3) {
  return (Array.isArray(events) ? events : [])
    .filter((evt) => FAITS_MARQUANTS.includes(evt?.eventType))
    .slice(0, Math.max(0, Number(limit) || 0));
}

/**
 * Journal latéral de l'écran du tour : noms d'équipe seulement, jamais d'identité d'élève
 * (les payloads privés sont déjà réduits par le serveur pour tout autre spectateur).
 *
 * `marquants` (projection) : ne garde que les faits marquants (`FAITS_MARQUANTS`), les `limit`
 * plus récents, sans le titre « Journal ». Le filtre se fait ici : la route du journal ne
 * change pas, on en lit simplement assez pour trouver les derniers faits.
 */
export function GLTourJournal({ gameId, token, refreshKey = 0, limit = 40, marquants = false }) {
  const journal = useGlGameJournal({
    gameId,
    token,
    limit: marquants ? Math.max(LECTURE_MARQUANTS, limit) : limit,
  });
  useEffect(() => {
    journal.reload?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  const events = marquants ? faitsMarquants(journal.events, limit) : journal.events.slice(0, limit);
  return (
    <aside
      className={`gl-tour-journal${marquants ? ' gl-tour-journal--marquants' : ''}`}
      aria-label={marquants ? 'Faits marquants' : 'Journal du tour'}
      data-testid="gl-tour-journal"
    >
      {marquants ? null : <h3>Journal</h3>}
      {journal.error ? <p className="gl-error-banner">{journal.error}</p> : null}
      <ul>
        {events.map((evt) => (
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
