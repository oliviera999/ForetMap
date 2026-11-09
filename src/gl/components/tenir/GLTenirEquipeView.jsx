import { useCallback, useMemo, useState } from 'react';
import { useGlTenirTour } from '../../hooks/useGlTenirTour.js';
import { useGlTenirOlu } from '../../hooks/useGlTenirOlu.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLTourDesSaisie } from '../mj/GLTourDesSaisie.jsx';
import { GLTenirQuestionCard } from './GLTenirQuestionCard.jsx';
import { GLCarnetClasseView } from './GLCarnetClasseView.jsx';
import { GLRewardsPanel } from '../GLRewardsPanel.jsx';
import { GLOluBulle } from './GLOluBulle.jsx';
import { GLPeripetieOverlay } from './GLPeripetieOverlay.jsx';
import { GLBestiairePanel } from './GLBestiairePanel.jsx';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';

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
 * `onJeter(code?)` ouvre l'assistant de sort (pré-sélectionné sur `code`, ex. Relance) ;
 * `onFouiller` bascule le plateau en mode fouille ;
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
  /** Modules G&L (`rewardsEnabled` conditionne « Mes badges ») ; `null` = tout allumé. */
  modules = null,
}) {
  const gameId = gameState?.game?.id;
  const tourApi = useGlTenirTour({
    gameId,
    enabled: !!gameId && !!tenir?.enabled,
    onChanged: onReloadGame,
  });
  const [pending, setPending] = useState(null);
  const [carnetOuvert, setCarnetOuvert] = useState(false);
  const [badgesOuverts, setBadgesOuverts] = useState(false);
  const [peripetiesPassees, setPeripetiesPassees] = useState(() => new Set());
  const perms = tenir?.permissions || {};
  const events = gameState?.events || [];
  const olu = useGlTenirOlu({
    teamId,
    gameId,
    events,
    teams: gameState?.teams || [],
    enabled: !!gameId && !!tenir?.enabled,
  });
  // Péripétie de mon équipe non encore passée (case événement sans texte, spec § 13).
  const peripetie = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e.eventType !== 'peripetie' || Number(e.teamId) !== Number(teamId)) continue;
      const id = e.payload?.id || `evt-${e.id}`;
      if (peripetiesPassees.has(id)) return null;
      const age = Date.now() - new Date(e.createdAt || 0).getTime();
      if (Number.isFinite(age) && age > 10 * 60 * 1000) return null;
      return { id, texte: e.payload?.texte || '', eventId: e.id };
    }
    return null;
  }, [events, teamId, peripetiesPassees]);
  const passerPeripetie = useCallback(
    async (p) => {
      setPeripetiesPassees((prev) => new Set([...prev, p.id]));
      await tourApi.peripetiePasser(p.id, teamId);
    },
    [tourApi, teamId],
  );
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
  // E4 : réserve de la caravane de l'équipe (servie seulement à ses membres et au prof).
  const reserve =
    tenir.settings?.surplus_reserve !== false
      ? (tenir.reserves || []).find((r) => Number(r.teamId) === Number(teamId)) || null
      : null;
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
  // Relance : jet de l'équipe dont la case s'affiche sans s'être appliquée.
  const jetEnSuspens =
    (round?.arriveesEnSuspens || []).find((a) => Number(a.teamId) === Number(teamId)) || null;
  const numeroJet = jetEnSuspens ? numeroCase(jetEnSuspens.index) : null;

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
      {reserve ? (
        <p className="gl-hint" data-testid="gl-tenir-reserve">
          Réserve de la caravane : ❤️ {reserve.health} · 💎 {reserve.power}
          <span className="fm-visually-hidden">
            {' '}
            (les gains au-dessus du plafond y vont ; elle paie d’abord les sorts de l’équipe)
          </span>
        </p>
      ) : null}
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
      {jetEnSuspens ? (
        <section
          className="gl-tenir-equipe__jet-suspens gl-gameplay-block"
          role="status"
          data-testid="gl-tenir-jet-suspens"
        >
          <p>
            <strong>Jet de l’équipe : {jetEnSuspens.total}</strong>
            {jetEnSuspens.faces?.length > 1 ? ` (${jetEnSuspens.faces.join(' + ')})` : ''} → case{' '}
            {numeroJet ?? '?'}
            {jetEnSuspens.label ? ` « ${jetEnSuspens.label} »` : ''}
          </p>
          {jetEnSuspens.question ? (
            <p>Une question attend sur cette case.</p>
          ) : jetEnSuspens.effectSummary ? (
            <p>Effet de la case : {jetEnSuspens.effectSummary}</p>
          ) : null}
          <p className="gl-hint">
            La case ne s’applique pas encore. Gardez ce jet, ou lancez Relance pour l’annuler : la
            mascotte revient et l’équipe rejette les dés.
          </p>
          <div className="gl-inline-actions">
            <GLButton
              type="button"
              disabled={tourApi.busy}
              onClick={() => tourApi.garderJet()}
              data-testid="gl-tenir-garder-jet"
            >
              Garder ce jet
            </GLButton>
            {onJeter ? (
              <GLButton
                type="button"
                variant="ghost"
                disabled={tourApi.busy}
                onClick={() => onJeter(jetEnSuspens.relanceSpellCode || null)}
                data-testid="gl-tenir-relance"
              >
                Relance…
              </GLButton>
            ) : null}
          </div>
        </section>
      ) : null}
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
          {fouilles.reparation?.quota
            ? ` + ${fouilles.reparation.restantes}/${fouilles.reparation.quota} réparation (page pâlie)`
            : ''}
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
      <GLOluBulle line={olu.line} speakerName={olu.speakerName} frozen={olu.frozen} />
      {chasse && carnetOuvert ? (
        <>
          <GLCarnetClasseView chasse={chasse} />
          <GLBestiairePanel gameId={gameId} />
        </>
      ) : null}
      <div className="gl-inline-actions">
        <GLButton
          type="button"
          variant="ghost"
          size="sm"
          className="gl-rewards__toggle"
          aria-expanded={badgesOuverts}
          onClick={() => setBadgesOuverts((v) => !v)}
        >
          {badgesOuverts ? 'Fermer mes badges' : 'Mes badges'}
        </GLButton>
      </div>
      {badgesOuverts ? (
        <GLRewardsPanel modules={modules} title="Mes badges" headingLevel={3} />
      ) : null}
      <GLPeripetieOverlay
        peripetie={peripetie}
        teamName={team.name}
        onPasser={passerPeripetie}
        busy={tourApi.busy}
      />
      {tourApi.error ? <p className="gl-error-banner">{tourApi.error}</p> : null}
      {chasse?.error ? <p className="gl-error-banner">{chasse.error}</p> : null}
    </section>
  );
}
