import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { ROLES_EN_CONSEIL } from '../../../shared/glSortMomentsCore.js';

const RESSOURCES = { gemmes: '💎', coeurs: '❤️', peuple: 'du peuple', choix: 'au choix' };

function cout(sort) {
  if (!sort.cout) return '';
  const unite = RESSOURCES[sort.ressource] || '';
  return ` · ${sort.cout}${unite ? ` ${unite}` : ''}`;
}

/**
 * Sorts de l'équipe rangés par moment du tour (« Tenir à deux », lot 2) : « Avant de lancer »,
 * « Après le jet », « Pendant le tour », « Plus tard ». Le serveur dit lesquels sont ouverts ; un
 * sort hors fenêtre reste visible, grisé, avec le message de sa fenêtre.
 *
 * `refreshKey` : change à chaque évènement du tour (jet, phase…) pour relire les fenêtres.
 */
export function GLSortsParMoment({
  gameId,
  teamId = null,
  refreshKey = 0,
  disabled = false,
  onJeter,
}) {
  const [moments, setMoments] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(
        `/api/gl/games/${gameId}/tenir/sorts${teamId != null ? `?teamId=${teamId}` : ''}`,
      );
      setMoments(Array.isArray(data?.moments) ? data.moments : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Sorts indisponibles');
    }
  }, [gameId, teamId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) return <p className="gl-error-banner">{error}</p>;
  if (!moments) return null;
  return (
    <section className="gl-sorts-moments gl-gameplay-block" data-testid="gl-sorts-moments">
      <p className="gl-hint gl-role-conseil">{ROLES_EN_CONSEIL.jeter}</p>
      {moments.length === 0 ? <p className="gl-hint">Aucun sort ouvert à ce chapitre.</p> : null}
      {moments.map((moment) => (
        <div key={moment.key} className="gl-sorts-moments__moment" data-moment={moment.key}>
          <h4>{moment.label}</h4>
          <ul className="gl-sorts-moments__liste">
            {moment.sorts.map((sort) => (
              <li key={sort.code} className={sort.ouvert ? '' : 'is-ferme'}>
                <GLButton
                  type="button"
                  variant={sort.ouvert ? 'secondary' : 'ghost'}
                  disabled={disabled || !sort.ouvert}
                  aria-disabled={!sort.ouvert}
                  onClick={() => onJeter?.(sort.code)}
                  data-sort={sort.code}
                >
                  {sort.emoji ? `${sort.emoji} ` : ''}
                  {sort.nom}
                  {cout(sort)}
                </GLButton>
                {sort.ouvert ? (
                  sort.effetCourt ? (
                    <span className="gl-hint"> {sort.effetCourt}</span>
                  ) : null
                ) : (
                  <span className="gl-hint gl-sorts-moments__message"> {sort.message}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
