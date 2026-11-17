import { useCallback, useEffect, useState } from 'react';
import { apiGL, getGlToken } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDefisView } from './GLDefisView.jsx';

const TYPES = Object.freeze([
  ['retisser', 'Retisser'],
  ['reparer', 'Réparer'],
  ['alteree', 'Trame altérée'],
  ['fils', 'Fils cachés'],
  ['ranger', 'Rôle et pays'],
  ['adaptation', 'Fils de l’adaptation'],
]);

/**
 * Onglet « Défis » de la console du prof (« Tenir à deux », lot 3) : lancer un défi de la Trame
 * pour une équipe, et le **suivi** — par élève et par type, unités réussies et indices utilisés,
 * dans l'ordre alphabétique. Aucun classement ; les phrases de Réparer sont à parcourir.
 */
export function GLDefisConsolePanel({ game, teams = [] }) {
  const gameId = game?.id;
  const [teamId, setTeamId] = useState(null);
  const [suivi, setSuivi] = useState(null);
  const [error, setError] = useState('');

  const charger = useCallback(async () => {
    if (!gameId) return;
    try {
      setSuivi(await apiGL(`/api/gl/games/${gameId}/defis/suivi`));
      setError('');
    } catch (err) {
      setError(err.message || 'Suivi indisponible');
    }
  }, [gameId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const exporter = async () => {
    try {
      const res = await fetch(`/api/gl/games/${gameId}/defis/suivi?format=csv`, {
        headers: { Authorization: `Bearer ${getGlToken()}` },
      });
      if (!res.ok) throw new Error('Export indisponible');
      const url = URL.createObjectURL(await res.blob());
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `defis-trame-${gameId}.csv`;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Export indisponible');
    }
  };

  return (
    <div className="gl-defis-console" data-testid="gl-defis-console">
      <section className="gl-gameplay-block">
        <h3>Lancer un défi pour une équipe</h3>
        <p className="gl-hint">
          Pour les équipes qui ont fini l’activité du jour. Un défi ne prend pas de temps de jeu et
          ne donne aucune ressource.
        </p>
        <div className="gl-inline-actions" role="group" aria-label="Équipe">
          {teams.map((t) => (
            <GLButton
              key={t.id}
              type="button"
              size="sm"
              variant={Number(teamId) === Number(t.id) ? 'primary' : 'ghost'}
              aria-pressed={Number(teamId) === Number(t.id)}
              onClick={() => setTeamId(Number(teamId) === Number(t.id) ? null : Number(t.id))}
              data-testid={`gl-defis-console-equipe-${t.id}`}
            >
              {t.name}
            </GLButton>
          ))}
        </div>
        {teamId ? <GLDefisView key={teamId} gameId={gameId} teamId={teamId} /> : null}
      </section>

      <section className="gl-gameplay-block">
        <div className="gl-inline-actions">
          <h3>Suivi</h3>
          <GLButton type="button" variant="ghost" size="sm" onClick={charger}>
            Actualiser
          </GLButton>
          <GLButton type="button" variant="ghost" size="sm" onClick={exporter}>
            Exporter (CSV)
          </GLButton>
        </div>
        {error ? <p className="gl-error-banner">{error}</p> : null}
        {suivi ? (
          <div className="fm-table-wrap">
            <table className="fm-table fm-table--zebra" data-testid="gl-defis-suivi">
              <thead>
                <tr>
                  <th scope="col">Élève</th>
                  <th scope="col">Équipe</th>
                  {TYPES.map(([type, label]) => (
                    <th key={type} scope="col">
                      {label}
                    </th>
                  ))}
                  <th scope="col">Pages</th>
                </tr>
              </thead>
              <tbody>
                {suivi.eleves.map((e) => (
                  <tr key={e.playerId}>
                    <th scope="row">{e.nom}</th>
                    <td>{e.equipe}</td>
                    {TYPES.map(([type]) => {
                      // Un type que le serveur ne connaît pas encore (déploiement en cours) : vide.
                      const reussies = e.defis?.[type]?.reussies?.length || 0;
                      const indices = e.defis?.[type]?.indices || 0;
                      return (
                        <td key={type}>
                          {reussies ? (
                            <>
                              {reussies} réussi
                              {reussies > 1 ? 's' : ''}
                            </>
                          ) : (
                            <span aria-label="aucun réussi">—</span>
                          )}
                          {indices ? <span className="gl-hint"> · {indices} indice(s)</span> : null}
                        </td>
                      );
                    })}
                    <td>{e.pages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {suivi?.phrases?.length ? (
          <section data-testid="gl-defis-phrases">
            <h4>« Dis pourquoi » — à parcourir</h4>
            <ul>
              {suivi.phrases.map((p, i) => (
                <li key={`${p.auteur}-${i}`}>
                  <strong>{p.auteur}</strong> : {p.texte}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}
