const pino = require('pino');
const { teeStream } = require('./logBuffer');

/**
 * Champs jamais écrits dans les journaux (RG6 de `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`,
 * = S-11 de l'audit RGPD du 28/09).
 *
 * Avant : un seul niveau de profondeur (`*.password`), ni `currentPassword`, ni `newPassword`,
 * ni jeton de réinitialisation, ni e-mail, ni code d'accès des plans. Un `logger.warn({ body })`
 * ou un objet d'erreur portant le corps de la requête pouvait donc recopier un mot de passe ou
 * une adresse d'élève dans le tampon de `GET /api/admin/logs` et dans les fichiers de journal.
 *
 * Chaque clé sensible est masquée à la racine et sur **deux niveaux d'imbrication**
 * (`{ user: { email } }`, `{ ctx: { body: { password } } }`) ; le corps d'une requête
 * sérialisée (`req.body`) est retiré en entier.
 *
 * `code` n'est masqué que **sous un corps de requête** (`body.code`, champ des routes
 * `/api/plan`, `/api/staff-plan` et `/api/settings/admin/*-access-code`) : ailleurs, `code`
 * est le code d'une erreur (`err.code = 'ER_DUP_ENTRY'`), indispensable au diagnostic.
 */
const SENSITIVE_KEYS = Object.freeze([
  'password',
  'currentPassword',
  'newPassword',
  'password_hash',
  'passwordHash',
  'legacy_password_hash',
  'pin',
  'secret',
  'token',
  'resetToken',
  'refreshToken',
  'accessToken',
  'authorization',
  'cookie',
  'email',
  'accessCode',
]);

function buildRedactPaths(keys = SENSITIVE_KEYS) {
  const paths = [];
  for (const key of keys) paths.push(key, `*.${key}`, `*.*.${key}`);
  paths.push(
    'req.headers.authorization',
    'req.headers.cookie',
    '*.headers.authorization',
    '*.headers.cookie',
    'req.body.*',
    'body.code',
    '*.body.code',
  );
  return paths;
}

const REDACT_PATHS = Object.freeze(buildRedactPaths());

const logger = pino(
  {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    redact: {
      paths: [...REDACT_PATHS],
      remove: true,
    },
  },
  teeStream,
);

module.exports = logger;
module.exports.REDACT_PATHS = REDACT_PATHS;
module.exports.SENSITIVE_KEYS = SENSITIVE_KEYS;
