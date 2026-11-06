import { useMemo, useState } from 'react';
import { useGlTenirTour } from '../../hooks/useGlTenirTour.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourDesSaisie } from '../mj/GLTourDesSaisie.jsx';
import { GLTenirQuestionCard } from './GLTenirQuestionCard.jsx';
import { GLCarnetClasseView } from './GLCarnetClasseView.jsx';

const VERDICT_TEXTES = {
  froid: 'Froid : la page dort plus loin.',
  tiede: 'Tiède : on s’approche.',
  chaud: 'Chaud : la page est tout près.',
  zone: 'Une page dort ici : réponds à sa question.',
  deja_trouvee: 'Cette page est déjà trouvée.',
  palie: 'Cette page a pâli : seuls les Gnomes peuvent la réparer.',
  page_trouvee: 'Page trouvée ! Elle entre au carnet de la classe.',
  pas_encore: 'Pas encore : la page dort encore ici.',
};

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
  /** Résultat de `useGlChasse` (fouille au clic, question, carnet) ; `null` hors chasse. */
  chasse = null,
}) {
  const gameId = gameState?.game?.id;
  const tourApi = useGlTenirTour({
    gameId,
    enabled: !!gameId && !!tenir?.enabled,
    onChanged: onReloadGame,
  });
  const [pending, setPending] = useState(null);
  const [carnetOuvert, setCarnetOuvert] = useState(false);
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
  const fouilles = chasse?.carnet?.fouilles || null;
  const fouilleMode = !!chasse?.fouilleMode;
  const gestes = [
    ['jeter', 'Jeter un sort', onJeter],
    ['lancer', 'Lancer', null],
    ['repondre', 'Répondre', onRepondre],
    [
      'fouiller',
      fouilleMode ? 'Annuler la fouille' : 'Fouiller',
      chasse ? () => chasse.setFouilleMode(!fouilleMode) : onFouiller,
    ],
    ['lire', 'Lire', chasse ? () => setCarnetOuvert((v) => !v) : onLire],
  ];
  const verdict = chasse?.dernierVerdict || null;

  return (
    <section
      className={`gl-tenir-equipe${fouilleMode ? ' is-fouille' : ''}`}
      data-testid="gl-tenir-equipe"
    >
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
      {chasse && fouilles ? (
        <p className="gl-hint" data-testid="gl-tenir-fouilles">
          Fouilles ce tour : {fouilles.restantes}/{fouilles.quota}
          {fouilles.sousVoile ? ' · sous le voile' : ''}
          {fouilleMode ? ' · touche le plateau pour fouiller' : ''}
        </p>
      ) : null}
      {verdict ? (
        <p className="gl-tenir-equipe__verdict" role="status" data-verdict={verdict.verdict}>
          {verdict.feedback || VERDICT_TEXTES[verdict.verdict] || ''}
        </p>
      ) : null}
      {chasse?.question ? (
        <GLTenirQuestionCard
          question={chasse.question.question}
          title="Une page dort ici"
          disabled={chasse.busy}
          onAnswer={(choiceId) => chasse.repondre(choiceId)}
          onClose={chasse.clearQuestion}
        />
      ) : null}
      {chasse && carnetOuvert ? <GLCarnetClasseView chasse={chasse} /> : null}
      {tourApi.error ? <p className="gl-error-banner">{tourApi.error}</p> : null}
      {chasse?.error ? <p className="gl-error-banner">{chasse.error}</p> : null}
    </section>
  );
}
