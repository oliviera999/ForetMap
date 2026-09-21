import { useState } from 'react';

import { Button } from '../../shared/ui/Button.jsx';
import { AccessCodeGate } from '../../shared/components/AccessCodeGate.jsx';
import { startGoogleAuth } from '../../components/auth/startGoogleAuth.js';

/**
 * Écran d'entrée du plan des personnels (proflyautey).
 *
 * L'entrée normale est le **compte ForetMap** : le bouton Google lance le flux déjà en place
 * (`/api/auth/google/start?mode=teacher`), qui revient sur cette origine-ci depuis que le
 * rappel OAuth mémorise le produit de départ (`lib/oauthPublicUrl.js`). Le profil du compte
 * doit être dans `ui.staff_plan.allowed_role_slugs` — sans quoi le serveur refuse la charge,
 * quel que soit le succès de la connexion Google.
 *
 * La saisie du **code partagé** n'apparaît que si un administrateur l'a activée
 * (`ui.staff_plan.access_mode`), et reste repliée derrière un lien : c'est la voie
 * secondaire, pour les personnels sans compte. L'afficher au même niveau que la connexion
 * inviterait à faire circuler un secret partagé là où un compte nominatif existe.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.intro]
 * @param {boolean} [props.codeAvailable] un code est configuré et actif côté serveur.
 * @param {(code: string) => Promise<void>} props.onSubmitCode lève si le code est refusé.
 */
export function PlanAccountGate({ title, intro = '', codeAvailable = false, onSubmitCode }) {
  const [codeOpen, setCodeOpen] = useState(false);
  /**
   * Message d'un retour Google qui a échoué : déposé par `src/staff/main.jsx` avant le montage
   * (le hash est consommé là-bas, il n'existe plus ici). Lu une seule fois, puis effacé — un
   * rechargement ne doit pas réafficher l'échec d'une tentative précédente.
   */
  const [oauthError] = useState(() => {
    try {
      const stored = window.sessionStorage?.getItem?.('staffplan:oauth-error') || '';
      if (stored) window.sessionStorage.removeItem('staffplan:oauth-error');
      return stored;
    } catch (_) {
      return '';
    }
  });

  if (codeOpen) {
    return (
      <div className="plan-access-gate">
        <AccessCodeGate
          className="plan-access-gate__code"
          title={title}
          intro="Saisissez le code communiqué par l’établissement."
          onSubmit={onSubmitCode}
        />
        <button
          type="button"
          className="plan-access-gate__switch"
          onClick={() => setCodeOpen(false)}
        >
          Revenir à la connexion
        </button>
      </div>
    );
  }

  return (
    <div className="plan-access-gate">
      <h1 className="plan-access-gate__title">{title}</h1>
      {intro ? <p className="plan-access-gate__intro">{intro}</p> : null}
      {oauthError ? (
        <p className="plan-access-gate__error" role="alert">
          {oauthError}
        </p>
      ) : null}
      <Button variant="primary" block onClick={() => startGoogleAuth('staff')}>
        Se connecter avec Google
      </Button>
      <p className="plan-access-gate__hint">
        Utilisez votre compte du lycée. Si la connexion aboutit mais que le plan reste fermé, c’est
        que votre profil n’a pas encore l’accès : demandez-le à un administrateur.
      </p>
      {codeAvailable ? (
        <button
          type="button"
          className="plan-access-gate__switch"
          onClick={() => setCodeOpen(true)}
        >
          Je n’ai pas de compte : entrer un code
        </button>
      ) : null}
    </div>
  );
}
