import { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { acquireGlSocket, subscribeGlGame } from '../../realtime/glSocketClient.js';
import { GLTourJournal } from '../mj/GLTourJournal.jsx';
import { GLGameBoard } from '../GLGameBoard.jsx';
import { GLMascotAvatar } from '../GLMascotAvatar.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';
import { GLSablier } from './GLSablier.jsx';
import { GLDefisCasePanel } from './GLDefisCasePanel.jsx';
import { GLCeQuiChange } from './GLCeQuiChange.jsx';
import { resolveBoardMovementConfig } from '../../utils/glBoardPath.js';
import { PHASE_AUCUN_TOUR, titreDuTour } from '../../constants/tenirPhases.js';

/** États d'une page du carnet → libellé affiché (jamais l'état brut). */
export const PAGE_ETAT_LABELS = Object.freeze({
  endormie: 'dort encore',
  revelee: 'révélée',
  palie: 'pâlie',
  trouvee: 'trouvée',
  tenue: 'tenue',
  reparee: 'réparée',
});

export function pageEtatLabel(etat) {
  return PAGE_ETAT_LABELS[String(etat || '')] || String(etat || '');
}

/** Équipe à nommer avec l'état d'une page : celle qui l'a révélée, trouvée ou tenue. */
const PAGE_ETAT_PAR = Object.freeze({
  revelee: 'reveleePar',
  trouvee: 'trouveePar',
  tenue: 'tenuePar',
});

/** « tenue par Les Lucioles », « trouvée par Les Racines », « dort encore »… */
export function pageEtatLigne(page) {
  const label = pageEtatLabel(page?.etat);
  const equipe = page?.[PAGE_ETAT_PAR[String(page?.etat || '')]]?.name;
  return equipe ? `${label} par ${equipe}` : label;
}

/** Ce qu'une pastille d'équipe dit en plus de sa case (mêmes mots que l'écran d'équipe). */
export function mentionsDEquipe(team, voile) {
  const mentions = [];
  if (team?.auCamp) mentions.push('au camp');
  if (voile >= 0 && team?.pathIndex != null && team.pathIndex <= voile) {
    mentions.push('sous le voile');
  }
  // Le tour où le seul dé est dû, la projection le dit au présent, comme l'écran d'équipe.
  if (team?.unDe) {
    mentions.push(
      team.desProchainJet === 1 ? 'ce tour-ci : un seul dé' : 'au prochain tour : un seul dé',
    );
  }
  return mentions;
}

const NOOP = () => {};

/**
 * Lien de projection révoqué (clôture du chapitre) ou échu : le serveur refuse la relecture.
 * La classe lit ce qu'il se passe et qui a la main, pas le refus brut du serveur.
 */
export const PROJECTION_FERMEE =
  'Cette projection est fermée. Le prof peut en ouvrir une nouvelle depuis son écran.';
/** Rechargement après un évènement temps réel : les rafales (jet, case, voile) sont regroupées. */
const RELOAD_DELAY_MS = 250;
const RELOAD_JITTER_MS = 500;

/**
 * Projection (vidéoprojecteur), mode tableau : vue lecture seule d'une partie « Tenir à deux »,
 * faite pour être lue du fond de la salle. Une grille plein écran, sans défilement :
 *
 * - en haut, le nom de la partie, le tour et sa phase en mots d'élève, le sablier ;
 * - à gauche, le plateau (`presentation="projection"` : pions, voile, empreintes, contours
 *   révélés, oiseau témoin, mascottes ; aucun bouton, aucun polygone de zone endormie, aucune
 *   bourse) ;
 * - à droite, les équipes en pastilles, la Lumière en jauge, le carnet de la classe en pages ;
 * - en bas, les trois derniers faits marquants (au camp : « Ce qui change »).
 *
 * À la clôture du tour, la carte « À la prochaine séance » remplace l'écran (page du jour,
 * indice d'une page qui dort, défis à préparer) ; « Voir le plateau » y ramène. Pendant le
 * souffle et au camp, la page du jour s'ouvre de la même façon, à la demande.
 *
 * Une projection est une session invitée : le runtime de l'application ne charge ni n'écoute rien
 * pour elle. La vue s'abonne donc elle-même aux évènements de la partie (`gl:game:event`,
 * `gl:game:equipe` — même patron que `GLTeamSessionView`) et se recharge à chacun.
 */
export function GLProjectionView({ gameId, token, refreshKey = 0 }) {
  const [state, setState] = useState(null);
  const [tour, setTour] = useState(null);
  const [carnet, setCarnet] = useState(null);
  const [error, setError] = useState('');
  // Avance à chaque évènement temps réel de la partie (rafales regroupées).
  const [evenements, setEvenements] = useState(0);
  // Écran choisi à la main (« Voir le plateau », ou le bouton qui rouvre la carte).
  const [choix, setChoix] = useState({ moment: '', vue: null });

  useEffect(() => {
    if (!token || !gameId) return undefined;
    const { socket, release } = acquireGlSocket(token);
    if (!socket) return undefined;
    const unsubscribe = subscribeGlGame(token, gameId);
    let timer = null;
    const onEvent = (evt) => {
      if (Number(evt?.gameId) !== Number(gameId)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => {
          timer = null;
          setEvenements((n) => n + 1);
        },
        RELOAD_DELAY_MS + Math.floor(Math.random() * RELOAD_JITTER_MS),
      );
    };
    socket.on('gl:game:event', onEvent);
    socket.on('gl:game:equipe', onEvent);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('gl:game:event', onEvent);
      socket.off('gl:game:equipe', onEvent);
      unsubscribe();
      release();
    };
  }, [token, gameId]);
  // Les panneaux enfants (défis, journal) se relisent sur la même clé que la vue.
  const cleRelecture = `${refreshKey}:${evenements}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, t, c] = await Promise.all([
          apiGL(`/api/gl/games/${gameId}`),
          apiGL(`/api/gl/games/${gameId}/tenir/tour`),
          apiGL(`/api/gl/games/${gameId}/chasse`).catch(() => null),
        ]);
        if (cancelled) return;
        setState(s);
        setTour(t);
        setCarnet(c);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.status === 403 ? PROJECTION_FERMEE : err.message || 'Projection indisponible',
        );
      }
    }
    if (gameId) load();
    return () => {
      cancelled = true;
    };
  }, [gameId, cleRelecture]);

  const round = tour?.round || null;
  const voile = state?.tenir?.state?.voilePosition ?? -1;
  const voileNumero = numeroCase(voile);
  const tenirLayers = useMemo(
    () => ({ carnet: carnet || null, voilePosition: voile }),
    [carnet, voile],
  );
  const markers = state?.markers || [];
  const teams = state?.teams || [];
  const auCamp = state?.game?.status === 'ended';
  const page = round?.passeur || null;
  // Fin de séance : le tour est clos, la partie continue. L'indice est celui de la première
  // page qui dort encore (jamais un titre, jamais une zone : un indice déjà public).
  const indiceEndormi =
    (carnet?.pages || []).find((p) => p.etat === 'endormie' && p.indice)?.indice || null;
  const accroche = round?.phase === 'clos' && !auCamp;
  // La carte plein écran : d'office à la clôture du tour ; à la demande dès qu'il y a une page
  // du jour (souffle, camp). Le choix de l'écran ne vaut que pour le moment où il a été fait.
  const carteDisponible = accroche || !!page;
  const moment = `${round?.number ?? 0}:${round?.phase ?? ''}:${state?.game?.status ?? ''}`;
  const vueChoisie = choix.moment === moment ? choix.vue : null;
  const carteOuverte = carteDisponible && (vueChoisie ? vueChoisie === 'carte' : accroche);
  const titreCarte = accroche ? 'À la prochaine séance' : 'La page du jour';
  const boardMovement = useMemo(() => resolveBoardMovementConfig(state?.game || {}), [state?.game]);
  return (
    <div
      className={`gl-projection${carteOuverte ? ' gl-projection--carte' : ''}`}
      data-testid="gl-projection"
      data-vue={carteOuverte ? 'carte' : 'plateau'}
    >
      <header className="gl-projection__banner">
        <h1>{state?.game?.name || 'Projection'}</h1>
        <p className="gl-projection__tour" data-testid="gl-projection-tour">
          {/* Tant que le tour n'est pas lu, on ne dit rien : jamais un « bientôt » à tort. */}
          <strong>{round ? titreDuTour(round) : tour ? PHASE_AUCUN_TOUR : ''}</strong>
          {voileNumero != null ? (
            <span className="gl-projection__voile"> · le voile est à la case {voileNumero}</span>
          ) : null}
        </p>
        <div className="gl-projection__outils">
          {tour?.sablier?.phase && round?.phase === 'jeu' ? (
            <GLSablier
              mode="phase"
              secondes={tour.sablier.phase.secondes}
              restantSecondes={tour.sablier.phase.restantSecondes}
              enPause={tour.sablier.phase.enPause}
              doneHint="le sablier a sonné"
              testId="gl-sablier-phase"
            />
          ) : null}
          {carteDisponible && !carteOuverte ? (
            <GLButton
              type="button"
              variant="secondary"
              size="sm"
              data-testid="gl-projection-ouvrir-carte"
              onClick={() => setChoix({ moment, vue: 'carte' })}
            >
              {titreCarte}
            </GLButton>
          ) : null}
        </div>
        {error ? <p className="gl-error-banner gl-projection__erreur">{error}</p> : null}
      </header>
      {carteOuverte ? (
        <section
          className="gl-projection__carte"
          data-testid={accroche ? 'gl-projection-accroche' : 'gl-projection-page'}
        >
          <h2>{accroche ? titreCarte : page?.titre || titreCarte}</h2>
          <div className="gl-projection__carte-corps">
            {page ? (
              <blockquote className="gl-tour-passeur">
                {accroche && page.titre ? <strong>{page.titre}</strong> : null}
                <p>{page.texte}</p>
              </blockquote>
            ) : null}
            <div className="gl-projection__carte-suite">
              {accroche && indiceEndormi ? (
                <p className="gl-projection__indice" data-testid="gl-projection-accroche-indice">
                  Une page dort encore : « {indiceEndormi} »
                </p>
              ) : null}
              {/* À la clôture du tour : les défis à préparer pour la semaine (jamais le critère). */}
              {round?.phase === 'clos' ? (
                <GLDefisCasePanel
                  gameId={gameId}
                  refreshKey={cleRelecture}
                  teams={teams}
                  avecEquipe
                />
              ) : null}
            </div>
          </div>
          <GLButton
            type="button"
            variant="secondary"
            size="sm"
            className="gl-projection__retour"
            data-testid="gl-projection-voir-plateau"
            onClick={() => setChoix({ moment, vue: 'plateau' })}
          >
            Voir le plateau
          </GLButton>
        </section>
      ) : (
        <>
          <section className="gl-projection__board" data-testid="gl-projection-board">
            {state?.game && markers.length ? (
              <GLGameBoard
                presentation="projection"
                chapter={state.game}
                markers={markers}
                teams={teams}
                gameId={state.game.id}
                watchTeamId={null}
                onMarkerClick={NOOP}
                onBoardClick={NOOP}
                onPlayerActionRequest={NOOP}
                onSelectTeam={NOOP}
                canMoveMascot={false}
                canRequestAction={false}
                markerArrivalEnabled={false}
                boardMovement={boardMovement}
                selectedTeamId={null}
                currentTeamId={round?.equipeActiveId ?? null}
                canSpellCast={false}
                canRollDice={false}
                showPlateauMarkers
                showPlateauZones={false}
                tenirLayers={tenirLayers}
              />
            ) : null}
          </section>
          <aside className="gl-projection__cote" data-testid="gl-projection-cote">
            <ul className="gl-projection__teams" aria-label="Les équipes">
              {(tour?.teams || []).map((t) => (
                <ProjectionEquipe
                  key={t.id}
                  team={t}
                  fiche={teams.find((e) => Number(e.id) === Number(t.id)) || null}
                  voile={voile}
                  active={
                    round?.equipeActiveId != null && Number(round.equipeActiveId) === Number(t.id)
                  }
                />
              ))}
            </ul>
            {tour?.lumiere?.active ? (
              <ProjectionLumiere total={tour.lumiere.total} palier={tour.lumiere.palier} />
            ) : null}
            {carnet ? <ProjectionCarnet carnet={carnet} /> : null}
          </aside>
          <footer className="gl-projection__faits" data-testid="gl-projection-faits">
            {/* Au camp : ce qui change au chapitre suivant, pour toute la classe. */}
            {auCamp ? (
              <GLCeQuiChange gameId={gameId} />
            ) : (
              <GLTourJournal
                gameId={gameId}
                token={token}
                refreshKey={cleRelecture}
                limit={3}
                marquants
              />
            )}
          </footer>
        </>
      )}
    </div>
  );
}

/** Une équipe en grosse pastille : mascotte, nom, case, et ce qui la concerne ce tour-ci. */
function ProjectionEquipe({ team, fiche, voile, active }) {
  const mentions = mentionsDEquipe(team, voile);
  return (
    <li
      className={`gl-projection__team gl-projection__team--${team.type}${active ? ' is-active' : ''}`}
      style={{ '--gl-team-color': fiche?.color || undefined }}
      aria-current={active ? 'true' : undefined}
      data-team-id={team.id}
    >
      <GLMascotAvatar
        mascotId={fiche?.mascot_id}
        size={56}
        fallbackType={team.type}
        fallbackPrimaryColor={fiche?.color || undefined}
        fallbackLabel={team.name}
      />
      <div className="gl-projection__team-texte">
        <strong className="gl-projection__team-nom">{team.name}</strong>
        <span className="gl-projection__team-case">case {numeroCase(team.pathIndex) ?? '—'}</span>
        {mentions.length ? (
          <span className="gl-projection__team-mentions">
            {mentions.map((m) => (
              <span key={m} className="gl-projection__mention">
                {m}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** La Lumière de la classe, en jauge : ce qui est réuni, sur ce qu'il faut pour le palier. */
function ProjectionLumiere({ total, palier }) {
  const max = Math.max(1, Number(palier) || 1);
  const valeur = Math.max(0, Math.min(max, Number(total) || 0));
  return (
    <div className="gl-projection__lumiere" data-testid="gl-projection-lumiere">
      <span className="gl-projection__lumiere-titre">Lumière de la classe</span>
      <span className="gl-projection__lumiere-compte">
        {total} / {palier}
      </span>
      <progress max={max} value={valeur} aria-label="Lumière de la classe" />
    </div>
  );
}

/**
 * Le carnet de la classe, une tuile par page : son titre une fois trouvée (« Page 3 » sinon),
 * son état en mots, et l'équipe qui l'a trouvée ou tenue. Les indices restent sur les écrans
 * d'équipe : dix énigmes ne tiennent pas au tableau.
 */
function ProjectionCarnet({ carnet }) {
  return (
    <section className="gl-projection__chasse" data-testid="gl-projection-carnet">
      <h2>
        Carnet de la classe · {carnet.tenues}/{carnet.total} pages tenues
      </h2>
      <ol className="gl-projection__carnet">
        {(carnet.pages || []).map((p, i) => (
          <li key={p.zoneKey} className={`gl-projection__page gl-projection__page--${p.etat}`}>
            <strong className="gl-projection__page-titre">{p.titre || `Page ${i + 1}`}</strong>
            <span className="gl-projection__page-etat">{pageEtatLigne(p)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
