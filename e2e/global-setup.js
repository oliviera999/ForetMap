/**
 * Préparation commune de la suite e2e :
 *
 * 1. **Configuration de production.** `ui.auth.allow_register` est forcé à `false`, la valeur
 *    servie en production. Sans cela la suite tourne sur une configuration que personne ne
 *    sert : n'importe qui y crée son compte par le formulaire public, alors qu'en production
 *    les comptes naissent d'un import de liste de classe fait par un enseignant. La spec
 *    `auth-registration.spec.js` rouvre le réglage le temps de couvrir le formulaire, puis le
 *    referme.
 * 2. **Purge** des données laissées par les runs précédents (tâches E2E*, assignations).
 *    Accélère les specs tâches quand la BDD locale accumule des centaines de projets/tâches.
 */
require('dotenv').config();

module.exports = async function globalSetup() {
  const { pool } = require('../database');

  try {
    const { setSetting, getSettingValue } = require('../lib/settings');
    // Valeur d'origine mémorisée pour `global-teardown.js` : la suite ne doit pas laisser
    // l'inscription fermée derrière elle (`npm test` s'y casse les dents, 32 cas en 403).
    const previous = await getSettingValue('ui.auth.allow_register', true);
    process.env.FORETMAP_E2E_PREVIOUS_ALLOW_REGISTER = previous ? 'true' : 'false';
    await setSetting('ui.auth.allow_register', false);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[e2e global-setup] ui.auth.allow_register non forcé:', err.message);
  }

  const conn = await pool.getConnection();
  try {
    await conn.query(
      `DELETE ta FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
       WHERE t.title LIKE 'E2E %'`,
    );
    await conn.query(`DELETE FROM tasks WHERE title LIKE 'E2E %'`);
    await conn.query(
      `DELETE ur FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE r.slug = 'eleve_ctx_ro_test'`,
    );
    await conn.query(
      `DELETE rp FROM role_permissions rp
       INNER JOIN roles r ON r.id = rp.role_id
       WHERE r.slug = 'eleve_ctx_ro_test'`,
    );
    await conn.query(`DELETE FROM roles WHERE slug = 'eleve_ctx_ro_test'`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[e2e global-setup] purge E2E tasks ignorée:', err.message);
  } finally {
    conn.release();
  }
};
