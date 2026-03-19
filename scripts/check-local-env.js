#!/usr/bin/env node
/**
 * Vérifications rapides pour l'environnement local (voir docs/LOCAL_DEV.md).
 * Usage : node scripts/check-local-env.js
 * Nécessite : Node, .env (copié depuis env.local.example), MySQL accessible (docker compose up).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let ok = true;

function check(name, condition, message) {
  const pass = !!condition;
  if (!pass) ok = false;
  console.log(pass ? '  OK' : '  FAIL', name, pass ? '' : `— ${message}`);
}

console.log('1. Fichiers');
check('.env existe', fs.existsSync(path.join(root, '.env')), 'copiez env.local.example vers .env');
check('docker-compose.yml', fs.existsSync(path.join(root, 'docker-compose.yml')), 'fichier manquant');
check('env.local.example', fs.existsSync(path.join(root, 'env.local.example')), 'fichier manquant');

console.log('\n2. Variables .env (si .env présent)');
if (fs.existsSync(path.join(root, '.env'))) {
  require('dotenv').config({ path: path.join(root, '.env') });
  check('DB_HOST', process.env.DB_HOST, 'définir DB_HOST');
  check('DB_NAME', process.env.DB_NAME, 'définir DB_NAME');
  check('DB_USER', process.env.DB_USER, 'définir DB_USER');
  check('DB_PASS', process.env.DB_PASS !== undefined, 'définir DB_PASS');
  check('TEACHER_PIN', process.env.TEACHER_PIN, 'définir TEACHER_PIN (optionnel en dev)');
}

console.log('\n3. Connexion MySQL (optionnel)');
if (process.env.DB_HOST && process.env.DB_USER) {
  (async () => {
    try {
      const { ping } = require('../database');
      await ping();
      console.log('  OK MySQL accessible');
    } catch (err) {
      ok = false;
      console.log('  FAIL MySQL', '—', err.message || err);
      console.log('  → Démarrez Docker : npm run docker:up, attendez le healthcheck, puis réessayez.');
    }
    process.exit(ok ? 0 : 1);
  })();
} else {
  console.log('  SKIP (configurez .env puis relancez)');
  process.exit(ok ? 0 : 1);
}
