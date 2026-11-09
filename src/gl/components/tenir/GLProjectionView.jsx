import { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLTourJournal } from '../mj/GLTourJournal.jsx';
import { GLGameBoard } from '../GLGameBoard.jsx';
import { numeroCase } from '../../../shared/glCaseNumeroCore.js';
import { resolveBoardMovementConfig } from '../../utils/glBoardPath.js';

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

const NOOP = () => {};

/**
 * Projection (vidéoprojecteur) : vue lecture seule d'une partie « Tenir à deux » — le plateau
 * (même composant que l'onglet Cartes : pions, voile gris, empreintes, contours révélés, oiseau
 * témoin, mascottes ; aucun polygone de zone endormie, aucune bourse), le tour, le carnet de la
 * classe, le journal. Aucun bouton d'action. Rechargement à chaque événement temps réel et
 * bouton « Actualiser » discret pour le long-polling.
 */
export function GLProjectionView({ gameId, token, refreshKey = 0 }) {
  const [state, setState] = useState(null);
  const [tour, setTour] = useState(null);
  const [carnet, setCarnet] = useState(null);
  const [error, setError] = useState('');

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
        if (!cancelled) setError(err.message || 'Projection indisponible');
      }
    }
    if (gameId) load();
    return () => {
      cancelled = true;
    };
  }, [gameId, refreshKey]);

  const round = tour?.round || null;
  const voile = state?.tenir?.state?.voilePosition ?? -1;
  const voileNumero = numeroCase(voile);
  const tenirLayers = useMemo(
    () => ({ carnet: carnet || null, voilePosition: voile }),
    [carnet, voile],
  );
  const markers = state?.markers || [];
  const teams = state?.teams || [];
  const boardMovement = useMemo(() => resolveBoardMovementConfig(state?.game || {}), [state?.game]);
  return (
    <div className="gl-projection" data-testid="gl-projection">
      <header className="gl-projection__banner">
        <h1>{state?.game?.name || 'Projection'}</h1>
        <p>
          {round ? `Tour ${round.number} — ${round.phase}` : 'En attente du tour'}
          {voileNumero != null ? ` · le voile est à la case ${voileNumero}` : ''}
        </p>
      </header>
      {error ? <p className="gl-error-banner">{error}</p> : null}
      {state?.game && markers.length ? (
        <section className="gl-projection__board" data-testid="gl-projection-board">
          <GLGameBoard
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
        </section>
      ) : null}
      <ol className="gl-projection__teams">
        {(tour?.teams || []).map((t) => (
          <li key={t.id} className={`gl-projection__team gl-projection__team--${t.type}`}>
            <strong>{t.name}</strong> — case {numeroCase(t.pathIndex) ?? '—'}
            {t.auCamp ? ' · au camp' : ''}
            {voile >= 0 && t.pathIndex != null && t.pathIndex <= voile ? ' · sous le voile' : ''}
          </li>
        ))}
      </ol>
      {carnet ? (
        <section className="gl-projection__chasse">
          <h2>
            Carnet de la classe · {carnet.tenues}/{carnet.total} pages tenues
          </h2>
          <ul className="gl-projection__carnet">
            {(carnet.pages || []).map((p) => (
              <li key={p.zoneKey} className={`gl-carnet-page gl-carnet-page--${p.etat}`}>
                <strong>{p.titre || p.indice}</strong>
                <div className="gl-hint">
                  {pageEtatLabel(p.etat)}
                  {p.trouveePar ? ` · ${p.trouveePar.name}` : ''}
                  {p.tenuePar ? ` · tenue par ${p.tenuePar.name}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {round?.passeur ? (
        <blockquote className="gl-tour-passeur">
          {round.passeur.titre ? <strong>{round.passeur.titre}</strong> : null}
          <p>{round.passeur.texte}</p>
        </blockquote>
      ) : null}
      <GLTourJournal gameId={gameId} token={token} refreshKey={refreshKey} limit={25} />
    </div>
  );
}
