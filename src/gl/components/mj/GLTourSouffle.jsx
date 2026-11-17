import { useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Phase « souffle » : le prof lance le dé gris (face saisie ou serveur) ou laisse le voile
 * dormir. Affiche le mot du Passeur et le résultat une fois la phase passée.
 *
 * `voileFerme` : l'escalier du chapitre 1 n'a pas encore ouvert le voile (séances 1 et 2). La
 * classe ne l'a pas rencontré : ni dé gris, ni « le voile dort » — le prof passe à la suite.
 */
export function GLTourSouffle({
  round,
  voileActif = true,
  voileFerme = false,
  disabled = false,
  onSouffle,
}) {
  const [face, setFace] = useState(0);
  const done = round?.phase === 'souffle' || round?.phase === 'clos';
  if (voileFerme || round?.souffle?.ferme) {
    return (
      <section className="gl-tour-souffle gl-gameplay-block" data-testid="gl-tour-souffle">
        <h3>Fin du jeu</h3>
        <p className="gl-hint" data-testid="gl-tour-souffle-ferme">
          Le voile s’ouvrira à la séance 3 : pas de dé gris pour l’instant.
        </p>
        {!done ? (
          <GLButton type="button" disabled={disabled} onClick={() => onSouffle?.({ dort: true })}>
            Passer à la suite
          </GLButton>
        ) : null}
        {done && round?.passeur ? (
          <blockquote className="gl-tour-passeur">
            {round.passeur.titre ? <strong>{round.passeur.titre}</strong> : null}
            <p>{round.passeur.texte}</p>
          </blockquote>
        ) : null}
      </section>
    );
  }
  return (
    <section className="gl-tour-souffle gl-gameplay-block" data-testid="gl-tour-souffle">
      <h3>Le voile</h3>
      {!done ? (
        <div className="gl-inline-actions">
          {voileActif ? (
            <>
              <label>
                Dé gris
                <select
                  value={face}
                  disabled={disabled}
                  onChange={(e) => setFace(Number(e.target.value))}
                >
                  <option value={0}>tirage serveur</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <GLButton
                type="button"
                disabled={disabled}
                onClick={() => onSouffle?.({ faces: face ? [face] : null, dort: false })}
              >
                Le voile avance
              </GLButton>
            </>
          ) : null}
          <GLButton
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => onSouffle?.({ dort: true })}
          >
            Le voile dort
          </GLButton>
        </div>
      ) : (
        <p className="gl-hint">
          {round?.souffle?.dort
            ? 'Le voile a dormi cette semaine.'
            : `Dé gris ${round?.souffle?.faces?.[0] ?? '?'} + ${round?.souffle?.bonus ?? 0} = ${round?.souffle?.total ?? '?'} : le voile avance.`}
        </p>
      )}
      {done && round?.passeur ? (
        <blockquote className="gl-tour-passeur">
          {round.passeur.titre ? <strong>{round.passeur.titre}</strong> : null}
          <p>{round.passeur.texte}</p>
        </blockquote>
      ) : null}
    </section>
  );
}
