import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { ROLES_EN_CONSEIL } from '../../../shared/glSortMomentsCore.js';
import { GLButDeLAnnee } from './GLButDeLAnnee.jsx';

// Ensemble unifié (M1) : une seule monnaie — tout sort se paie en gemmes.
function cout(sort) {
  if (!sort.cout) return '';
  return ` · ${sort.cout} 💎`;
}

/**
 * Sorts de l'équipe rangés par moment (ensemble unifié, M6 : cinq moments — « Avant de lancer »,
 * « Après le jet », « Pendant le tour », « Pendant l'activité », « En fin de chapitre ou en
 * veillée »). Le serveur ne sert que les sorts lançables et payables à cet instant.
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
  // M19 : la Consécration, but de l'année — visible grisée dès le chapitre 1.
  const [but, setBut] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(
        `/api/gl/games/${gameId}/tenir/sorts${teamId != null ? `?teamId=${teamId}` : ''}`,
      );
      setMoments(Array.isArray(data?.moments) ? data.moments : []);
      setBut(data?.butDeLAnnee || null);
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
      {moments.length === 0 ? <p className="gl-hint">Aucun sort lançable maintenant.</p> : null}
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
                  {sort.offerte ? ' · offerte' : cout(sort)}
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
      <GLButDeLAnnee but={but} />
    </section>
  );
}
