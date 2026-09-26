/**
 * Bandeau du gestionnaire d'un module pédagogique éteint pour les élèves (clés
 * d'identification, individus suivis, séances, récompenses — `ui.modules.*_enabled`).
 *
 * Décision du 25/09/2026 (révisée) : l'interrupteur éteint le module pour les élèves, mais le
 * compte qui porte la permission de gestion garde l'écran pour préparer. Ce bandeau lui dit
 * clairement que rien de ce qu'il fait n'est visible côté élève tant que le module reste éteint,
 * et où le rallumer.
 */
export const MODULE_LEARNER_OFF_DETAIL =
  'Vous pouvez continuer à préparer ; rien n’est visible côté élève tant qu’il reste éteint.';

export function ModuleLearnerOffBanner({ moduleLabel, detail = MODULE_LEARNER_OFF_DETAIL }) {
  return (
    <div className="pedago-module-off-banner" role="status" data-testid="pedago-module-off-banner">
      <strong>{moduleLabel} — module désactivé pour les élèves.</strong> <span>{detail}</span>{' '}
      <span className="pedago-module-off-banner__where">
        Réglage : Paramètres → Accueil &amp; modules.
      </span>
    </div>
  );
}
