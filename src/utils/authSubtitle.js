/** Sous-titre par défaut, aligné sur `content.auth.subtitle` (`lib/settings/identity.js`). */
export const DEFAULT_AUTH_SUBTITLE = 'Le terrain d’apprentissage vivant du lycée';

/**
 * Retire le nom du logiciel en tête du sous-titre (« ForêtMap — Le terrain… ») quand il
 * répète le titre juste au-dessus (audit UI/UX du 19/11/2026, U3). Une valeur saisie en
 * administration qui commence par le titre est ainsi affichée sans la répétition, sans
 * toucher à la base.
 * @param {string} subtitle
 * @param {string} title
 * @returns {string}
 */
export function stripLeadingAppName(subtitle, title) {
  const sub = String(subtitle || '').trim();
  const name = String(title || '').trim();
  if (!name || sub.slice(0, name.length).toLowerCase() !== name.toLowerCase()) return sub;
  return sub.slice(name.length).replace(/^[\s\u00a0—–:·,-]+/, '') || sub;
}
