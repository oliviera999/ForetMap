const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
if (process.env.TEST_DB_NAME) process.env.DB_NAME = process.env.TEST_DB_NAME;
process.env.NODE_ENV = 'test';
if (!process.env.TEACHER_PIN) process.env.TEACHER_PIN = '1234';
if (!process.env.TEACHER_ADMIN_EMAIL) process.env.TEACHER_ADMIN_EMAIL = 'admin.test@foretmap.local';
if (!process.env.TEACHER_ADMIN_PASSWORD) process.env.TEACHER_ADMIN_PASSWORD = 'admin1234';

// Each test file calls initSchema/initDatabase independently.
// Reset RBAC bootstrap so roles/permissions are reseeded deterministically.
const database = require('../../database');
const rbac = require('../../lib/rbac');

if (typeof rbac.resetRbacBootstrapForTests === 'function') {
  const originalInitSchema = database.initSchema.bind(database);
  const originalInitDatabase = database.initDatabase.bind(database);

  database.initSchema = async (...args) => {
    rbac.resetRbacBootstrapForTests();
    const result = await originalInitSchema(...args);
    // Middleware /api (SERVICE_NOT_READY) exige initDatabase() ; la plupart des fichiers
    // de test n’appellent que initSchema() — marquer la BDD prête après chaque init.
    await originalInitDatabase(...args);
    if (typeof rbac.repairSystemN3beurParticipationDefaults === 'function') {
      await rbac.repairSystemN3beurParticipationDefaults();
    }
    return result;
  };

  database.initDatabase = async (...args) => {
    rbac.resetRbacBootstrapForTests();
    return originalInitDatabase(...args);
  };
}
