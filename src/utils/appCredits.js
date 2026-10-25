/**
 * Crédits du projet (auteur, contributeurs, message libre), réglables par un administrateur
 * via `content.auth.credit_*`. Défauts alignés sur `lib/settings/identity.js`.
 */
const DEFAULT_CREDITS = Object.freeze({
  author: 'Mohammed El Farrai',
  contributor: 'Olivier Arnould-Laurent',
  message: '',
});

/**
 * Crédits de contenus tiers affichés dans « À propos » (exigence des licences). La Fresque du
 * Climat : CC BY-NC-ND — cartes reproduites sans modification, crédit visible en permanence
 * dans l'activité (`src/shared/fresque/FresqueCreditBar.jsx`) et dans toute image exportée.
 */
const THIRD_PARTY_CREDITS = Object.freeze([
  Object.freeze({
    id: 'fresque-climat-junior',
    title: 'La Fresque du Climat — version Enfant (FR, v7.5)',
    author: 'Cédric Ringenbach',
    publisher: 'Association La Fresque du Climat',
    url: 'https://fresqueduclimat.org',
    licenceName: 'CC BY-NC-ND (usage non commercial, sans modification)',
    licenceUrl: 'https://fresqueduclimat.org/licence/',
    note: 'Cartes reproduites telles quelles dans l’activité « Fresque » ; usage pédagogique, gratuit, sans publicité.',
  }),
]);

function readCredit(authContent, field, fallback) {
  const raw = authContent?.[`credit_${field}`];
  // Absent (réglages pas encore chargés) → défaut ; chaîne vide enregistrée → mention masquée.
  if (typeof raw !== 'string') return fallback;
  return raw.trim();
}

function getAppCredits(publicSettings) {
  const authContent = publicSettings?.content?.auth;
  return {
    author: readCredit(authContent, 'author', DEFAULT_CREDITS.author),
    contributor: readCredit(authContent, 'contributor', DEFAULT_CREDITS.contributor),
    message: readCredit(authContent, 'message', DEFAULT_CREDITS.message),
  };
}

export { DEFAULT_CREDITS, THIRD_PARTY_CREDITS, getAppCredits };
