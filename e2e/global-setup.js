/**
 * Purge les données laissées par les runs e2e précédents (tâches E2E*, assignations).
 * Accélère les specs tâches quand la BDD locale accumule des centaines de projets/tâches.
 */
require('dotenv').config();

module.exports = async function globalSetup() {
  const { pool } = require('../database');
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
