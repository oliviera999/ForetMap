import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { MESSAGE_SPECTATEUR } from '../../../shared/glMainCore.js';

/**
 * Plusieurs appareils par équipe (ensemble unifié, M13), en tête de l'écran d'équipe :
 * - **la main** : quand un autre appareil de l'équipe joue un geste décisif, « Lina répond… »
 *   (prénom seul ; « Une autre tablette… » pour une tablette d'équipe) ;
 * - **spectateur** : un élève absent du tour ou en retrait voit tout et ne joue rien ;
 * - **appareils** : une tablette demande à rejoindre l'équipe → « Accepter » / « Refuser »
 *   (la demande expire seule au bout de deux minutes).
 *
 * `equipe` est le bloc `tenir.equipe` servi par le serveur ; ici, on affiche.
 */
export function GLEquipeAppareils({ gameId, equipe = null, spectateur = false, onChanged = null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const repondre = useCallback(
    async (sessionId, decision) => {
      setBusy(true);
      setError('');
      try {
        await apiGL(`/api/gl/games/${gameId}/tenir/sessions/${sessionId}/${decision}`, 'POST', {});
      } catch (err) {
        setError(err.message || 'Réponse impossible');
      } finally {
        setBusy(false);
        await onChanged?.();
      }
    },
    [gameId, onChanged],
  );
  const main = equipe?.main && !equipe.main.moi ? equipe.main : null;
  const appareils = Array.isArray(equipe?.appareils) ? equipe.appareils : [];
  // Une demande expire seule au bout de deux minutes : l'écran se relit à l'échéance de la
  // plus proche, pour ne pas garder un bandeau dont le bouton ne répondrait plus.
  const prochaineEcheance = appareils.length
    ? Math.min(...appareils.map((a) => Number(a.resteSecondes) || 0))
    : null;
  const cleAppareils = appareils.map((a) => a.id).join(',');
  useEffect(() => {
    if (prochaineEcheance == null) return undefined;
    const timer = setTimeout(() => onChanged?.(), (prochaineEcheance + 1) * 1000);
    return () => clearTimeout(timer);
  }, [prochaineEcheance, cleAppareils, onChanged]);
  if (!main && !spectateur && !appareils.length && !error) return null;
  return (
    <>
      {spectateur ? (
        <p className="gl-tenir-spectateur" role="status" data-testid="gl-tenir-spectateur">
          {MESSAGE_SPECTATEUR}
        </p>
      ) : null}
      {main ? (
        <p className="gl-tenir-main" role="status" data-testid="gl-tenir-main">
          {main.texte}
        </p>
      ) : null}
      {appareils.length ? (
        <section className="gl-tenir-appareils" data-testid="gl-tenir-appareils">
          <strong>
            {appareils.length > 1
              ? `${appareils.length} tablettes demandent à rejoindre l’équipe.`
              : 'Une tablette demande à rejoindre l’équipe.'}
          </strong>
          <ul>
            {appareils.map((a) => (
              <li key={a.id} className="gl-inline-actions">
                <GLButton
                  type="button"
                  disabled={busy}
                  onClick={() => repondre(a.id, 'accepter')}
                  data-testid={`gl-tenir-appareil-accepter-${a.id}`}
                >
                  Accepter
                </GLButton>
                <GLButton
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => repondre(a.id, 'refuser')}
                >
                  Refuser
                </GLButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {error ? <p className="gl-error-banner">{error}</p> : null}
    </>
  );
}
