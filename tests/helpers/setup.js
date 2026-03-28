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
    return originalInitSchema(...args);
  };

  database.initDatabase = async (...args) => {
    rbac.resetRbacBootstrapForTests();
    return originalInitDatabase(...args);
  };
}
