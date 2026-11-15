import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';

/**
 * Défis de case de l'équipe (« Tenir à deux », lot 2, § 7) : titre, consigne et préparation du
 * défi à préparer pour la prochaine séance. Le critère du prof n'arrive jamais ici. Rien ne
 * bloque : le tour continue pendant que l'équipe prépare.
 *
 * Sert à l'écran d'équipe, à la tablette hors tour, au Seuil de l'élève et à la projection
 * (`avecEquipe` : nom de l'équipe devant chaque défi).
 */
export function GLDefisCasePanel({ gameId, refreshKey = 0, teams = [], avecEquipe = false }) {
  const [defis, setDefis] = useState([]);

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/defis-case`);
      setDefis(Array.isArray(data?.defis) ? data.defis : []);
    } catch (_) {
      // Lecture de confort : une erreur ne gêne ni le tour ni le Seuil.
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const aPreparer = defis.filter((d) => d.statut === 'a_preparer');
  if (!aPreparer.length) return null;
  const nomEquipe = (id) => teams.find((t) => Number(t.id) === Number(id))?.name || null;
  return (
    <section className="gl-defis-case gl-gameplay-block" data-testid="gl-defis-case">
      <h4>{aPreparer.length > 1 ? 'Défis à préparer' : 'Défi à préparer'}</h4>
      <p className="gl-hint">
        Pour la prochaine séance. Relevé, il fait reculer le voile ; rien n’est retiré sinon.
      </p>
      <ul className="gl-defis-case__liste">
        {aPreparer.map((d) => (
          <li key={d.id} data-defi={d.code}>
            <strong>
              {avecEquipe && nomEquipe(d.teamId) ? `${nomEquipe(d.teamId)} — ` : ''}
              {d.titre}
            </strong>
            <p>{d.consigne}</p>
            {d.preparation ? (
              <p className="gl-hint">
                <em>À préparer :</em> {d.preparation}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
