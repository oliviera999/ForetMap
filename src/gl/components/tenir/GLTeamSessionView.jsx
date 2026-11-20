import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GL_EQUIPE_ETAT_EVENT } from '../../services/glEquipeEtatEvents.js';
import { acquireGlSocket, subscribeGlGame } from '../../realtime/glSocketClient.js';
import { toGameViewModel } from '../../utils/glAppShellHelpers.js';
import { resolveBoardMovementConfig } from '../../utils/glBoardPath.js';
import { useGlChasse } from '../../hooks/useGlChasse.js';
import { useGLSpellCast } from '../../hooks/useGLSpellCast.js';
import { GLSpellCastWizard } from '../GLSpellCastWizard.jsx';
import { GLMascotCatalogProvider } from '../../context/GLMascotCatalogContext.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLMapView } from '../GLMapView.jsx';
import { GLTenirEcranEquipe } from './GLTenirEcranEquipe.jsx';
import { GLTenirEquipeView } from './GLTenirEquipeView.jsx';
import { GLCarnetClasseView } from './GLCarnetClasseView.jsx';
import { GLDefisCasePanel } from './GLDefisCasePanel.jsx';
import { GLDefisEntree } from '../defis/GLDefisEntree.jsx';

const NOOP = () => {};
/** Rechargement après un évènement temps réel : regroupé, et étalé entre tablettes. */
const RELOAD_DELAY_MS = 250;
const RELOAD_JITTER_MS = 500;

/**
 * Écran d'une tablette d'équipe (« Tenir à deux », lot 2) : session ouverte par le lien de
 * classe. Même écran d'équipe et même plateau que l'élève connecté avec son compte : l'écran en
 * trois choses (`GLTenirEcranEquipe` — bandeau, plateau, carte du moment, tiroir « L'équipe »),
 * tour ouvert ou non. La tablette n'affiche aucune bourse hors tour (le serveur les tait) et ne
 * garde rien après fermeture de l'onglet. Le serveur rejoue chaque geste : ici, on ne fait que
 * montrer ce qu'il permet.
 *
 * Ensemble unifié (M13) : la tablette ne fait que les **gestes d'équipe** — le Marché et le
 * Seuil passent par le compte de chacun (« Qui agit ? » a disparu ; Olu le dit une fois).
 * Plusieurs appareils peuvent servir la même équipe : la main et la version d'état règlent qui
 * joue.
 *
 * Surface « tableau » (« Tout au tableau », ou partie jouée au tableau) : l'ancien écran empilé
 * reste tel quel (`GLTenirEquipeView` puis le plateau) — garde-fou 12, rien n'y change sans
 * décision.
 *
 * `onEnded(message)` : la session ne vaut plus (déconnectée par le prof, lien régénéré, partie
 * close) → retour au code de la classe. `onQuit` : « Changer d'équipe ».
 */
export function GLTeamSessionView({ auth, token, onQuit, onEnded }) {
  const gameId = Number(auth?.teamSession?.gameId) || null;
  const teamId = Number(auth?.teamSession?.teamId) || null;
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');

  const reloadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}`);
      setGameState(toGameViewModel(data));
      setError('');
    } catch (err) {
      if (err?.teamSessionEnded || err?.status === 401) {
        onEnded?.(err.message || '');
        return;
      }
      setError(err.message || 'Chargement de la partie impossible');
    }
  }, [gameId, onEnded]);

  useEffect(() => {
    reloadGame();
  }, [reloadGame]);

  // Temps réel : même room que les comptes élèves ; chaque évènement recharge l'état.
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
          reloadGame();
        },
        RELOAD_DELAY_MS + Math.floor(Math.random() * RELOAD_JITTER_MS),
      );
    };
    socket.on('gl:game:event', onEvent);
    // M13 : la main de l'équipe a changé, ou un appareil demande à la rejoindre.
    socket.on('gl:game:equipe', onEvent);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('gl:game:event', onEvent);
      socket.off('gl:game:equipe', onEvent);
      unsubscribe();
      release();
    };
  }, [token, gameId, reloadGame]);

  // Hors tour, l'écran d'équipe n'est pas monté : l'état périmé se recharge d'ici.
  useEffect(() => {
    const recharger = () => reloadGame();
    window.addEventListener(GL_EQUIPE_ETAT_EVENT, recharger);
    return () => window.removeEventListener(GL_EQUIPE_ETAT_EVENT, recharger);
  }, [reloadGame]);

  const tenir = gameState?.tenir || null;
  const live = String(gameState?.game?.status || '') === 'live';
  const round = tenir?.round || null;
  const tourOuvert = !!round?.phase && round.phase !== 'clos';
  const chasse = useGlChasse({
    gameId,
    enabled: !!tenir?.enabled && live,
    onChanged: reloadGame,
  });
  // Jeter un sort : même assistant que l'élève connecté ; le pot s'y partage tout seul.
  const [sort, setSort] = useState({ open: false, code: null });
  const spellCast = useGLSpellCast({
    token,
    gameId,
    enabled: sort.open,
    onCastComplete: reloadGame,
  });
  const tenirLayers = useMemo(
    () =>
      tenir?.enabled
        ? { carnet: chasse.carnet, voilePosition: tenir?.state?.voilePosition ?? -1 }
        : null,
    [tenir?.enabled, tenir?.state?.voilePosition, chasse.carnet],
  );
  const boardMovement = useMemo(
    () => resolveBoardMovementConfig(gameState?.game || {}),
    [gameState?.game],
  );
  const team = useMemo(
    () => (gameState?.teams || []).find((t) => Number(t.id) === Number(teamId)) || null,
    [gameState?.teams, teamId],
  );

  const auTableau = tenir?.surface === 'tableau';
  const ecranPret = !!gameState && !!tenir?.enabled && !!team;
  const plateau = (presentation) => (
    <GLMapView
      gameState={gameState}
      onMoveMascot={undefined}
      onMoveMascotToPct={undefined}
      onPlayerActionRequest={NOOP}
      onSelectTeam={NOOP}
      onQcmAnswered={reloadGame}
      canMoveMascot={false}
      boardMovement={boardMovement}
      canRequestAction={false}
      markerArrivalEnabled={tourOuvert && tenir?.permissions?.repondre === true}
      selectedTeamId={teamId}
      currentTeamId={round?.equipeActiveId ?? null}
      playerTeamId={teamId}
      canSpellCast={false}
      canRollDice={false}
      showPlateauMarkers
      tenirLayers={tenirLayers}
      fouilleMode={chasse.fouilleMode}
      onFouille={chasse.fouiller}
      presentation={presentation}
    />
  );
  const ouvrirSort = (code) =>
    setSort({ open: true, code: code ? String(code).toUpperCase() : null });

  return (
    <GLMascotCatalogProvider token={null}>
      <div
        className={`gl-team-session${ecranPret && !auTableau ? ' gl-team-session--ecran' : ''}`}
        data-testid="gl-team-session"
      >
        {/* L'écran en trois choses porte son bandeau (et « Changer d'équipe » dans son tiroir) ;
            tant qu'il n'est pas là — chargement, panne, surface « tableau » — cet en-tête reste. */}
        {ecranPret && !auTableau ? null : (
          <header className="gl-team-session__head">
            <div>
              <strong>{team?.name || auth?.teamName || 'Équipe'}</strong>
              {auth?.className ? <span className="gl-hint"> · {auth.className}</span> : null}
            </div>
            <GLButton type="button" variant="ghost" size="sm" onClick={onQuit}>
              Changer d’équipe
            </GLButton>
          </header>
        )}
        {error ? <p className="gl-error-banner">{error}</p> : null}
        {ecranPret && !auTableau ? (
          <GLTenirEcranEquipe
            gameState={gameState}
            tenir={tenir}
            teamId={teamId}
            onReloadGame={reloadGame}
            onJeter={ouvrirSort}
            chasse={chasse}
            tablette
            onChangerEquipe={onQuit}
            token={token}
            board={plateau('tenir')}
          />
        ) : gameState && tenir?.enabled ? (
          <>
            {/* Surface « tableau » : l'écran d'avant, inchangé (garde-fou 12). */}
            {tourOuvert ? (
              <GLTenirEquipeView
                gameState={gameState}
                tenir={tenir}
                teamId={teamId}
                onReloadGame={reloadGame}
                onJeter={ouvrirSort}
                chasse={chasse}
                tablette
              />
            ) : null}
            {tourOuvert ? (
              <p className="gl-hint" data-testid="gl-team-session-comptes">
                Le Marché et le Seuil s’ouvrent depuis le compte de chacun.
              </p>
            ) : null}
            {tourOuvert ? null : (
              <section className="gl-tenir-equipe" data-testid="gl-team-session-attente">
                <p role="status">
                  <strong>Le tour n’est pas ouvert.</strong> Regardez le plateau et le carnet de la
                  classe en attendant le prof.
                </p>
                <GLButton type="button" variant="ghost" onClick={reloadGame}>
                  Actualiser
                </GLButton>
                {/* Hors tour : le défi à préparer reste lisible (lecture seule). */}
                <GLDefisCasePanel gameId={gameId} refreshKey={gameState?.events?.length || 0} />
                {/* Hors tour : l'équipe qui a fini l'activité du jour peut relever un défi. */}
                <GLDefisEntree gameId={gameId} />
              </section>
            )}
            {plateau('standard')}
            {!tourOuvert && chasse.carnet ? <GLCarnetClasseView chasse={chasse} readOnly /> : null}
          </>
        ) : !error ? (
          <p className="gl-hint" role="status">
            Chargement de la partie…
          </p>
        ) : null}
        <GLSpellCastWizard
          open={sort.open && tourOuvert}
          onClose={() => {
            setSort({ open: false, code: null });
            // Fermer l'assistant rend la main à l'équipe (elle expirerait seule sinon).
            apiGL(`/api/gl/games/${gameId}/tenir/main/rendre`, 'POST', {}).catch(() => {});
          }}
          spellCode={sort.code}
          teams={gameState?.teams || []}
          gameId={gameId}
          playerId={null}
          playerTeamId={teamId}
          currentTeamId={teamId}
          contributionMode="self_only"
          teamScope="own_team"
          isStaff={false}
          spellCast={spellCast}
          roster={gameState?.roster || []}
          pagesPalies={(chasse.carnet?.pages || []).filter((p) => p.etat === 'palie')}
          chapterSpells={gameState?.game?.chapter_spells || []}
          onPickSpell={(code) => setSort({ open: true, code })}
          tablette
        />
      </div>
    </GLMascotCatalogProvider>
  );
}
