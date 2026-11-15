import { lazy, Suspense, useEffect, useState } from 'react';
import { setGlActingPlayer } from '../../services/apiGL.js';
import { formatPlayerLabel } from '../../utils/glSpellCastRules.js';
import { GLButton } from '../ui/GLButton.jsx';

const GLMarketView = lazy(() =>
  import('../GLMarketView.jsx').then((m) => ({ default: m.GLMarketView })),
);

/**
 * Marché depuis la tablette d'une équipe (« Tenir à deux », lot 2) : un geste de Marché touche
 * la bourse d'un élève, donc l'écran demande d'abord **« Qui agit ? »** — les membres présents
 * de l'équipe, sans mot de passe. Le serveur revérifie (présent, non en retrait) et journalise
 * le geste pour le prof. Changer d'élève ou fermer le Marché oublie qui agissait.
 */
export function GLMarcheTablette({
  token,
  classId,
  roster = [],
  presents = [],
  heartsTradable = true,
  onChanged,
  onClose,
}) {
  const [qui, setQui] = useState(null);
  const candidats = roster.filter((p) => presents.map(Number).includes(Number(p.playerId)));
  const acteur = candidats.find((p) => Number(p.playerId) === Number(qui)) || null;

  const choisir = (playerId) => {
    // Avant le rendu du Marché : ses premières lectures partent déjà au nom de l'élève.
    setGlActingPlayer(playerId);
    setQui(playerId);
  };
  useEffect(() => () => setGlActingPlayer(null), []);
  // L'élève choisi n'est plus présent (absence saisie entre-temps) : on redemande.
  useEffect(() => {
    if (qui != null && !acteur) {
      setGlActingPlayer(null);
      setQui(null);
    }
  }, [qui, acteur]);

  return (
    <section className="gl-marche-tablette gl-gameplay-block" data-testid="gl-marche-tablette">
      <div className="gl-inline-actions">
        <h4>Marché</h4>
        <GLButton type="button" variant="ghost" size="sm" onClick={onClose}>
          Fermer le Marché
        </GLButton>
      </div>
      {!acteur ? (
        <>
          <p>
            <strong>Qui agit ?</strong> Chacun vient au Marché avec sa propre bourse.
          </p>
          {candidats.length ? (
            <ul className="gl-marche-tablette__qui">
              {candidats.map((p) => (
                <li key={p.playerId}>
                  <button
                    type="button"
                    className="gl-marche-tablette__eleve"
                    onClick={() => choisir(Number(p.playerId))}
                    data-testid={`gl-qui-agit-${p.playerId}`}
                  >
                    {formatPlayerLabel(p)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gl-hint" role="status">
              Confirmez d’abord les présences de l’équipe.
            </p>
          )}
        </>
      ) : (
        <>
          <p role="status" data-testid="gl-qui-agit-choisi">
            <strong>{formatPlayerLabel(acteur)}</strong> agit.{' '}
            <GLButton type="button" variant="ghost" size="sm" onClick={() => choisir(null)}>
              Changer
            </GLButton>
          </p>
          <Suspense fallback={<div className="gl-tab-loading" role="status" aria-busy="true" />}>
            <GLMarketView
              key={acteur.playerId}
              token={token}
              classId={classId}
              playerId={Number(acteur.playerId)}
              heartsTradable={heartsTradable}
              selfHealthPoints={acteur.healthPoints}
              selfPowerPoints={acteur.powerPoints}
              onTradeCompleted={onChanged}
            />
          </Suspense>
        </>
      )}
    </section>
  );
}
