/**
 * Fin de suite e2e : **rendre la base telle qu'on l'a trouvée** sur le seul réglage que
 * `global-setup.js` force, `ui.auth.allow_register`.
 *
 * Sans ce retour en arrière, l'inscription restait fermée dans la base après la suite, et
 * `npm test` lancé ensuite sur la même base échouait en masse — trente-deux cas, tous en
 * **403** sur `POST /api/auth/register` ou sur le compte élève qu'ils créent au préalable.
 * Le code n'y était pour rien, mais l'enquête coûte à chaque fois, et la CI qui enchaîne les
 * deux suites n'a pas de raison d'y échapper (constaté le 17/09,
 * `docs/AUDIT_PARCOURS_2026-09-17.md` §5).
 *
 * `global-setup.js` mémorise la valeur d'origine ; ici on la repose.
 */
require('dotenv').config();

module.exports = async function globalTeardown() {
  try {
    const { setSetting } = require('../lib/settings');
    const previous = process.env.FORETMAP_E2E_PREVIOUS_ALLOW_REGISTER;
    // Absent (setup en échec, ou valeur illisible) : on rouvre, c'est l'état par défaut du
    // schéma et celui qu'attendent les suites de test.
    await setSetting('ui.auth.allow_register', previous === 'false' ? false : true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[e2e global-teardown] ui.auth.allow_register non restauré:', err.message);
  }
};
