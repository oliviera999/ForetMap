import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { acquireGlSocket, subscribeGlGame } from '../../realtime/glSocketClient.js';
import { toGameViewModel } from '../../utils/glAppShellHelpers.js';
import { resolveBoardMovementConfig } from '../../utils/glBoardPath.js';
import { useGlChasse } from '../../hooks/useGlChasse.js';
import { useGLSpellCast } from '../../hooks/useGLSpellCast.js';
import { GLSpellCastWizard } from '../GLSpellCastWizard.jsx';
import { GLMascotCatalogProvider } from '../../context/GLMascotCatalogContext.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLMapView } from '../GLMapView.jsx';
import { GLTenirEquipeView } from './GLTenirEquipeView.jsx';
import { GLCarnetClasseView } from './GLCarnetClasseView.jsx';
import { GLDefisCasePanel } from './GLDefisCasePanel.jsx';
import { GLMarcheTablette } from './GLMarcheTablette.jsx';

const NOOP = () => {};
/** Rechargement après un évènement temps réel : regroupé, et étalé entre tablettes. */
const RELOAD_DELAY_MS = 250;
const RELOAD_JITTER_MS = 500;

/**
 * Écran d'une tablette d'équipe (« Tenir à deux », lot 2) : session ouverte par le lien de
 * classe. Même écran d'équipe (`GLTenirEquipeView`) et même plateau que l'élève connecté avec
 * son compte ; la tablette n'affiche aucune bourse hors tour et ne garde rien après fermeture
 * de l'onglet. Le serveur rejoue chaque geste : ici, on ne fait que griser.
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
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('gl:game:event', onEvent);
      unsubscribe();
      release();
    };
  }, [token, gameId, reloadGame]);

  const tenir = gameState?.tenir || null;
  const live = String(gameState?.game?.status || '') === 'live';
  const round = tenir?.round || null;
  const tourOuvert = !!round?.phase && round.phase !== 'clos';
  const chasse = useGlChasse({
    gameId,
    enabled: !!tenir?.enabled && live,
    onChanged: reloadGame,
  });
  // Marché : un geste y touche la bourse d'un élève → la tablette demande « Qui agit ? ».
  const [marcheOuvert, setMarcheOuvert] = useState(false);
  const marchePermis = tourOuvert && tenir?.permissions?.marche === true;
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

  return (
    <GLMascotCatalogProvider token={null}>
      <div className="gl-team-session" data-testid="gl-team-session">
        <header className="gl-team-session__head">
          <div>
            <strong>{team?.name || auth?.teamName || 'Équipe'}</strong>
            {auth?.className ? <span className="gl-hint"> · {auth.className}</span> : null}
          </div>
          <GLButton type="button" variant="ghost" size="sm" onClick={onQuit}>
            Changer d’équipe
          </GLButton>
        </header>
        {error ? <p className="gl-error-banner">{error}</p> : null}
        {gameState && tenir?.enabled ? (
          <>
            {tourOuvert ? (
              <GLTenirEquipeView
                gameState={gameState}
                tenir={tenir}
                teamId={teamId}
                onReloadGame={reloadGame}
                onJeter={(code) =>
                  setSort({ open: true, code: code ? String(code).toUpperCase() : null })
                }
                chasse={chasse}
                tablette
              />
            ) : null}
            {marchePermis && !marcheOuvert ? (
              <GLButton
                type="button"
                variant="secondary"
                onClick={() => setMarcheOuvert(true)}
                data-testid="gl-team-session-marche"
              >
                Marché
              </GLButton>
            ) : null}
            {marchePermis && marcheOuvert ? (
              <GLMarcheTablette
                token={token}
                classId={gameState.game?.class_id ?? gameState.game?.classId ?? null}
                roster={(gameState.roster || []).filter((p) => Number(p.teamId) === Number(teamId))}
                presents={tenir.tablette?.presents || []}
                onChanged={reloadGame}
                onClose={() => setMarcheOuvert(false)}
              />
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
              </section>
            )}
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
              roster={gameState.roster || []}
              tenirLayers={tenirLayers}
              fouilleMode={chasse.fouilleMode}
              onFouille={chasse.fouiller}
            />
            {!tourOuvert && chasse.carnet ? <GLCarnetClasseView chasse={chasse} readOnly /> : null}
          </>
        ) : !error ? (
          <p className="gl-hint" role="status">
            Chargement de la partie…
          </p>
        ) : null}
        <GLSpellCastWizard
          open={sort.open && tourOuvert}
          onClose={() => setSort({ open: false, code: null })}
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
