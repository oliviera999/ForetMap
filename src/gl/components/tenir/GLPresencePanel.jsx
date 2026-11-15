import { useEffect, useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

function nomDe(m) {
  return m.pseudo || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Élève';
}

/**
 * Présences de l'équipe (« Tenir à deux », lot 2). Tant que l'équipe n'a pas répondu :
 * « Il manque quelqu'un ? » — on touche les absents, puis « C'est bon » (un seul appui si
 * l'équipe est complète). Ensuite : « Quelqu'un vient d'arriver » pour un retardataire.
 *
 * `presence` : `{ confirmee, absents: [playerId] }` de l'équipe (vue du tour) ; `mates` : les
 * membres de l'équipe (état de partie). Le serveur rejoue : ici on ne fait que préparer.
 */
export function GLPresencePanel({
  presence,
  mates = [],
  ouverte = true,
  busy = false,
  onConfirmer,
  onArrivee,
}) {
  const [absents, setAbsents] = useState(() => new Set());
  const [retard, setRetard] = useState(false);
  const absentsServeur = (presence?.absents || []).map(Number);
  const cleAbsents = absentsServeur.join(',');
  useEffect(() => {
    setAbsents(new Set(cleAbsents ? cleAbsents.split(',').map(Number) : []));
  }, [cleAbsents]);
  if (!presence || !ouverte) return null;

  if (!presence.confirmee) {
    return (
      <section
        className="gl-presence gl-gameplay-block"
        role="group"
        aria-label="Présences de l’équipe"
        data-testid="gl-presence"
      >
        <h4>Il manque quelqu’un ?</h4>
        <p className="gl-hint">Touchez ceux qui ne sont pas là, puis « C’est bon ».</p>
        <ul className="gl-presence__membres">
          {mates.map((m) => {
            const absent = absents.has(Number(m.playerId));
            return (
              <li key={m.playerId}>
                <button
                  type="button"
                  className={`gl-presence__membre${absent ? ' is-absent' : ''}`}
                  aria-pressed={absent}
                  disabled={busy}
                  onClick={() => {
                    const next = new Set(absents);
                    if (absent) next.delete(Number(m.playerId));
                    else next.add(Number(m.playerId));
                    setAbsents(next);
                  }}
                >
                  {nomDe(m)}
                  <span className="gl-presence__etat">{absent ? ' · pas là' : ' · là'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <GLButton
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => onConfirmer?.([...absents])}
          data-testid="gl-presence-ok"
        >
          C’est bon
        </GLButton>
      </section>
    );
  }

  const manquants = mates.filter((m) => absentsServeur.includes(Number(m.playerId)));
  if (!manquants.length) return null;
  return (
    <section className="gl-presence gl-presence--confirmee" data-testid="gl-presence-retard">
      <GLButton
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={retard}
        disabled={busy}
        onClick={() => setRetard((v) => !v)}
      >
        Quelqu’un vient d’arriver
      </GLButton>
      {retard ? (
        <ul className="gl-presence__membres">
          {manquants.map((m) => (
            <li key={m.playerId}>
              <button
                type="button"
                className="gl-presence__membre"
                disabled={busy}
                onClick={() => {
                  setRetard(false);
                  onArrivee?.(Number(m.playerId));
                }}
              >
                {nomDe(m)} est là
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
