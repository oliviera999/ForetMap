'use strict';

/**
 * Masquage des valeurs `.env` dans les sorties du connecteur (`lib/mcp/secretGuard.js`) :
 * - `PASSENGER_APP_ENV=production` (injectée par Passenger) n'est plus un secret : « reproduction »
 *   et « productions » sortent intacts (ils sortaient en « re[secret .env masqué] ») ;
 * - une clé listée (`DB_PASS`…) reste masquée même courte, au mot entier ;
 * - une valeur longue repérée par le nom est masquée en sous-chaîne ;
 * - une valeur courte repérée par le nom est masquée au mot entier, un mot courant jamais.
 *
 * Valeurs factices construites à l'exécution (garde-fou `scripts/check-sensitive-files.js`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  collectEnvSecretPatterns,
  maskEnvValuesInString,
  scrubSecretsOnly,
} = require('../lib/mcp/secretGuard');

const MASK = '[secret .env masqué]';
const rnd = (n) => crypto.randomBytes(n).toString('hex').slice(0, n);

test('PASSENGER_APP_ENV=production : « reproduction » et « productions » intacts', () => {
  const env = { PASSENGER_APP_ENV: 'production', MCP_PASSENGER_LOG: '/home/u/logs/x.log' };
  assert.deepEqual(collectEnvSecretPatterns(env), []);
  const text = 'Mode de reproduction des oiseaux ; productions du potager ; production';
  assert.equal(maskEnvValuesInString(text, env), text);
});

test('un mot courant n’est jamais masqué, même sous un nom de secret', () => {
  const env = { SOME_TOKEN: 'production', OTHER_SECRET: 'true', API_KEY: '12345' };
  assert.deepEqual(collectEnvSecretPatterns(env), []);
});

test('suffixe de configuration (URL, chemin…) : pas un secret', () => {
  const env = {
    PASSWORD_RESET_BASE_URL: 'https://foretmap.example.org/reset',
    BACKUP_ENCRYPT_KEY_FILE: '/home/u/.foretmap-backup.key',
  };
  assert.deepEqual(collectEnvSecretPatterns(env), []);
});

test('DB_PASS courte : masquée au mot entier, jamais dans un mot', () => {
  const pass = `Zq${rnd(4)}`;
  const env = { DB_PASS: pass };
  const out = maskEnvValuesInString(`mot de passe ${pass} ; mot x${pass}y ; fin`, env);
  assert.equal(out, `mot de passe ${MASK} ; mot x${pass}y ; fin`);
  // Liste explicite : masquée même si c'est un mot courant.
  assert.equal(maskEnvValuesInString('mode production', { DB_PASS: 'production' }), `mode ${MASK}`);
});

test('valeur longue repérée par le nom : masquée en sous-chaîne', () => {
  const secret = `k${rnd(20)}`;
  const env = { CUSTOM_WEBHOOK_TOKEN: secret };
  const [p] = collectEnvSecretPatterns(env);
  assert.equal(p.wholeWord, false);
  assert.equal(maskEnvValuesInString(`url?t=${secret}&x=1`, env), `url?t=${MASK}&x=1`);
});

test('valeur courte repérée par le nom : masquée au mot entier', () => {
  const secret = `s${rnd(6)}`;
  const env = { CUSTOM_PASS: secret };
  assert.equal(maskEnvValuesInString(`a ${secret} b`, env), `a ${MASK} b`);
  assert.equal(maskEnvValuesInString(`a${secret}b`, env), `a${secret}b`);
});

test('secrets d’API ajoutés à la liste explicite', () => {
  const env = {
    DEPLOY_SECRET: `d${rnd(6)}`,
    OPENAI_API_KEY: `sk${rnd(6)}`,
    PLANTNET_API_KEY: `p${rnd(6)}`,
    TREFLE_TOKEN: `t${rnd(6)}`,
    TEACHER_ADMIN_PASSWORD: `a${rnd(6)}`,
  };
  const values = collectEnvSecretPatterns(env).map((p) => p.value);
  for (const v of Object.values(env)) assert.ok(values.includes(v), v);
});

test('scrubSecretsOnly : utilise l’environnement du processus', () => {
  const prev = process.env.PASSENGER_APP_ENV;
  process.env.PASSENGER_APP_ENV = 'production';
  try {
    assert.equal(scrubSecretsOnly('reproduction'), 'reproduction');
  } finally {
    if (prev === undefined) delete process.env.PASSENGER_APP_ENV;
    else process.env.PASSENGER_APP_ENV = prev;
  }
});
