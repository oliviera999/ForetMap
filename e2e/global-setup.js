/**
 * Préparation commune de la suite e2e :
 *
 * 1. **Configuration de production.** `ui.auth.allow_register` est forcé à `false`, la valeur
 *    servie en production. Sans cela la suite tourne sur une configuration que personne ne
 *    sert : n'importe qui y crée son compte par le formulaire public, alors qu'en production
 *    les comptes naissent d'un import de liste de classe fait par un enseignant. La spec
 *    `auth-registration.spec.js` rouvre le réglage le temps de couvrir le formulaire, puis le
 *    referme.
 * 2. **Purge** des données laissées par les runs précédents. Ce n'est pas qu'une question de
 *    vitesse : les `afterEach` de nettoyage sont conditionnés à la réussite du `beforeEach`,
 *    donc un run en échec laisse tout derrière lui. Sept exemplaires du repère
 *    « E2E mascotte A » au même point du plan finissent **agrégés** par le clustering de
 *    `SharedMapStage`, et le repère que la spec cherche n'existe alors plus comme bouton.
 *    Une base locale doit donc repartir propre — la CI, elle, part d'une base neuve.
 *
 *    Périmètre : uniquement ce que l'e2e sème (`E2E %`, groupes `e2e-n3-*`). Les jeux laissés
 *    par `npm test`, qui partage `foretmap_test`, ne sont pas touchés : les supprimer ici
 *    masquerait des fuites appartenant à la suite backend.
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

    // Contenu de visite semé par `e2e/fixtures/visit-api.fixture.js`.
    await conn.query(`DELETE FROM visit_markers WHERE label LIKE 'E2E %'`);
    await conn.query(`DELETE FROM visit_zones WHERE name LIKE 'E2E %'`);

    // Groupes jetables de l'ancienne fixture d'inscription (un par élève créé).
    // La fixture actuelle n'en crée plus qu'un, partagé et stable : `e2e-n3beur`.
    await conn.query(
      `DELETE gm FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
       WHERE g.slug LIKE 'e2e-n3-%'`,
    );
    await conn.query(`DELETE FROM \`groups\` WHERE slug LIKE 'e2e-n3-%'`);
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
