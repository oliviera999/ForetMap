import { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLTourJournal } from '../mj/GLTourJournal.jsx';

/**
 * Projection (vidéoprojecteur) : vue lecture seule d'une partie « Tenir à deux » — plateau
 * (position des équipes), voile, tour, journal. Aucun bouton, aucune bourse (le serveur n'en
 * sert aucune à une projection). Rechargement à chaque événement temps réel et bouton
 * « Actualiser » discret pour le long-polling.
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
  return (
    <div className="gl-projection" data-testid="gl-projection">
      <header className="gl-projection__banner">
        <h1>{state?.game?.name || 'Projection'}</h1>
        <p>
          {round ? `Tour ${round.number} — ${round.phase}` : 'En attente du tour'}
          {voile >= 0 ? ` · le voile est à la case ${voile + 1}` : ''}
        </p>
      </header>
      {error ? <p className="gl-error-banner">{error}</p> : null}
      <ol className="gl-projection__teams">
        {(tour?.teams || []).map((t) => (
          <li key={t.id} className={`gl-projection__team gl-projection__team--${t.type}`}>
            <strong>{t.name}</strong> — case {t.pathIndex == null ? '—' : t.pathIndex + 1}
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
                  {p.etat === 'endormie' ? 'dort encore' : p.etat}
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
