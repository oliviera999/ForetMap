/**
 * Crédits du projet (auteur, contributeurs, message libre), réglables par un administrateur
 * via `content.auth.credit_*`. Défauts alignés sur `lib/settings/identity.js`.
 */
const DEFAULT_CREDITS = Object.freeze({
  author: 'Mohammed El Farrai',
  contributor: 'Olivier Arnould-Laurent',
  message: '',
});

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

export { DEFAULT_CREDITS, getAppCredits };
