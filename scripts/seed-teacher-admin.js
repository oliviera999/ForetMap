'use strict';

require('dotenv').config();
const { ensureTeacherAdminFromEnv } = require('../lib/teacherAdminSeed');
const { ensurePrimaryRole } = require('../lib/rbac');

async function main() {
  const result = await ensureTeacherAdminFromEnv({
    minPasswordLength: 4,
    updatePasswordIfExists: true,
    ensurePrimaryRole,
  });
  if (result.skipped) {
    throw new Error(
      'TEACHER_ADMIN_EMAIL et TEACHER_ADMIN_PASSWORD sont requis (mot de passe ≥ 4).',
    );
  }
  const email = String(process.env.TEACHER_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  if (result.created) console.log(`Compte prof créé: ${email}`);
  else if (result.updated) console.log(`Compte prof mis à jour: ${email}`);
  else console.log(`Compte prof déjà présent: ${email}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
