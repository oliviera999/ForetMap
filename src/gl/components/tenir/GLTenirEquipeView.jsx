import { useMemo, useState } from 'react';
import { useGlTenirTour } from '../../hooks/useGlTenirTour.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourDesSaisie } from '../mj/GLTourDesSaisie.jsx';

const PHASE_LABELS = {
  ouverture: 'ouverture',
  jeu: 'jeu',
  souffle: 'souffle',
  clos: 'tour clos',
};

/**
 * Écran d'équipe (surfaces hybride et tablette) : les cinq gestes en boutons, grisés par
 * `tenir.permissions` (le serveur rejoue le calcul ; le client ne fait que griser).
 * `onJeter` ouvre l'assistant de sort ; `onFouiller` bascule le plateau en mode fouille ;
 * `onLire` ouvre le carnet de la classe ; `onRepondre` présente la question de la case.
 */
export function GLTenirEquipeView({
  gameState,
  tenir,
  teamId,
  onReloadGame,
  onJeter = null,
  onFouiller = null,
  onLire = null,
  onRepondre = null,
}) {
  const gameId = gameState?.game?.id;
  const tourApi = useGlTenirTour({
    gameId,
    enabled: !!gameId && !!tenir?.enabled,
    onChanged: onReloadGame,
  });
  const [pending, setPending] = useState(null);
  const perms = tenir?.permissions || {};
  const round = tourApi.tour?.round || tenir?.round || null;
  const team = useMemo(
    () => (gameState?.teams || []).find((t) => Number(t.id) === Number(teamId)) || null,
    [gameState, teamId],
  );
  const mates = useMemo(
    () => (gameState?.roster || []).filter((r) => Number(r.teamId) === Number(teamId)),
    [gameState, teamId],
  );
  if (!tenir?.enabled || !team) return null;

  const surface = tenir.surface || 'tableau';
  const gestes = [
    ['jeter', 'Jeter un sort', onJeter],
    ['lancer', 'Lancer', null],
    ['repondre', 'Répondre', onRepondre],
    ['fouiller', 'Fouiller', onFouiller],
    ['lire', 'Lire', onLire],
  ];

  return (
    <section className="gl-tenir-equipe" data-testid="gl-tenir-equipe">
      <header className="gl-tenir-equipe__head">
        <h3>
          {team.name}{' '}
          <small className="gl-hint">
            · {team.type === 'unicorn' ? 'licornes' : 'gnomes'} · {surface}
          </small>
        </h3>
        <p className="gl-hint">
          {round
            ? `Tour ${round.number} — ${PHASE_LABELS[round.phase] || round.phase}`
            : 'Aucun tour ouvert : attends le prof.'}
          {tenir.enRetrait ? ' · en retrait jusqu’à nouvel ordre' : ''}
        </p>
        <GLButton
          type="button"
          variant="ghost"
          onClick={() => tourApi.refresh().then(onReloadGame)}
        >
          Actualiser
        </GLButton>
      </header>
      <ul className="gl-tenir-equipe__bourses">
        {mates.map((m) => (
          <li key={m.playerId}>
            {m.pseudo || `${m.firstName} ${m.lastName}`.trim()}
            {m.healthPoints != null ? (
              <span className="gl-hint">
                {' '}
                ❤️ {m.healthPoints} · 💎 {m.powerPoints}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="gl-tenir-equipe__gestes">
        {gestes.map(([key, label, handler]) => (
          <GLButton
            key={key}
            type="button"
            disabled={!perms[key] || tourApi.busy}
            aria-disabled={!perms[key]}
            data-geste={key}
            onClick={() => {
              if (key === 'lancer') setPending('lancer');
              else handler?.();
            }}
          >
            {label}
          </GLButton>
        ))}
      </div>
      {pending === 'lancer' && perms.lancer ? (
        <GLTourDesSaisie
          count={tenir.settings?.des_count || 2}
          desMode={tenir.settings?.des_mode_effectif || 'serveur'}
          disabled={tourApi.busy}
          onLancer={async (body) => {
            const result = await tourApi.lancer(body);
            setPending(null);
            if (result?.enAttente) {
              setPending('attente');
            }
          }}
        />
      ) : null}
      {pending === 'attente' ? (
        <p className="gl-hint" role="status">
          Jet saisi : en attente du clic du prof.
        </p>
      ) : null}
      {tourApi.error ? <p className="gl-error-banner">{tourApi.error}</p> : null}
    </section>
  );
}
