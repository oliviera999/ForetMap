const logger = require('./logger');

/**
 * Valeurs de `JWT_SECRET` publiées dans le dépôt (CS6, audit 2026-09-30) : exemples de
 * configuration, script de session web, CI, replis de développement. Un serveur de
 * production configuré par copie d'un exemple émettrait des jetons forgeables par quiconque
 * a lu le dépôt : il refuse de démarrer.
 */
const KNOWN_PUBLIC_JWT_SECRETS = Object.freeze([
  'changez_moi_en_production_secret_long_aleatoire', // .env.example
  'dev_jwt_secret_local_only', // env.local.example
  'session-test-secret-not-for-production', // scripts/bootstrap-web-session.sh
  'ci-test-secret-not-for-production', // .github/workflows/ci.yml
  'foretmap_local_root', // docker-compose.yml (mot de passe root MariaDB de dev)
  'dev-secret-change-in-production', // repli middleware/requireTeacher.js, lib/rateLimit.js
  'visit-dev-secret-change-me',
  'plan-dev-secret-change-me',
  'staff-plan-dev-secret-change-me',
  'dev-lti',
]);

function isKnownPublicJwtSecret(value) {
  const v = String(value || '').trim();
  return v !== '' && KNOWN_PUBLIC_JWT_SECRETS.includes(v);
}

/** Harnais e2e (Playwright) : `--foretmap-e2e-no-rate-limit` / `E2E_DISABLE_RATE_LIMIT=1`. */
function isE2eHarness() {
  return String(process.env.E2E_DISABLE_RATE_LIMIT || '').trim() === '1';
}

/**
 * Valide les variables d'environnement au démarrage.
 * En production, JWT_SECRET, VISIT_COOKIE_SECRET et (recommandé) FRONTEND_ORIGIN doivent être définis.
 * @throws {Error} si une variable requise manque
 */
function validateEnv() {
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  const missing = required.filter((k) => !process.env[k]);
  // DB_PASS peut être vide (BDD sans mot de passe : CI, dev local) : on exige
  // seulement qu'elle soit définie, pas non vide.
  if (process.env.DB_PASS === undefined) missing.push('DB_PASS');
  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(', ')}. ` +
        'Copiez .env.example vers .env et renseignez les valeurs.',
    );
  }
  if (process.env.DB_PORT) {
    const p = parseInt(process.env.DB_PORT, 10);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      logger.warn(
        `DB_PORT invalide (« ${process.env.DB_PORT} ») : le port par défaut 3306 sera utilisé.`,
      );
    }
  }
  if (!process.env.PORT && !process.env.ALWAYSDATA_HTTPD_PORT) {
    process.env.PORT = '3000';
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim().length < 16) {
      throw new Error(
        'JWT_SECRET manquant ou trop court en production (min. 16 caractères). ' +
          'Définissez une valeur aléatoire forte dans .env.',
      );
    }
    if (isKnownPublicJwtSecret(process.env.JWT_SECRET)) {
      // Seul le harnais e2e (production locale, jamais exposée) tolère une valeur publiée.
      if (!isE2eHarness()) {
        throw new Error(
          'JWT_SECRET reprend une valeur publiée dans le dépôt (exemple, CI ou repli de ' +
            'développement) : les jetons seraient forgeables. Générez une valeur aléatoire ' +
            '(ex. `openssl rand -hex 32`) dans .env.',
        );
      }
      logger.warn(
        'JWT_SECRET reprend une valeur publiée dans le dépôt : toléré uniquement parce que le ' +
          'harnais e2e est actif (E2E_DISABLE_RATE_LIMIT=1). Ne jamais exposer ce serveur.',
      );
    }
    if (isE2eHarness()) {
      logger.warn(
        'SÉCURITÉ — E2E_DISABLE_RATE_LIMIT=1 (--foretmap-e2e-no-rate-limit) actif en production : ' +
          'limiteurs HTTP désactivés, surcharge de produit par X-Foretmap-Product et jeton ' +
          'Socket.IO en query string acceptés. Réservé au harnais Playwright — ne jamais ' +
          'utiliser sur un serveur exposé.',
      );
    }
    if (String(process.env.LOAD_TEST_SECRET || '').trim()) {
      logger.warn(
        'LOAD_TEST_SECRET défini en production : ignoré (le contournement des limiteurs pour ' +
          'les tests de charge n’est actif qu’hors production).',
      );
    }
    if (
      !process.env.VISIT_COOKIE_SECRET ||
      String(process.env.VISIT_COOKIE_SECRET).trim().length < 16
    ) {
      throw new Error(
        'VISIT_COOKIE_SECRET manquant ou trop court en production (min. 16 caractères). ' +
          'Requis pour les cookies de visite anonyme.',
      );
    }
    if (!process.env.FRONTEND_ORIGIN) {
      logger.warn(
        'FRONTEND_ORIGIN non défini en production : les requêtes cross-origin seront ' +
          'bloquées par CORS (origin: false). Définissez FRONTEND_ORIGIN si un front séparé est servi.',
      );
    }
    if (!process.env.DEPLOY_SECRET) {
      logger.warn(
        'DEPLOY_SECRET non défini en production : /api/admin/restart et /api/admin/logs resteront inaccessibles.',
      );
    }
    if (!process.env.SMTP_HOST) {
      logger.warn(
        'SMTP_HOST non défini en production : les emails de réinitialisation de mot de passe seront désactivés.',
      );
    }
    if (
      (process.env.SMTP_USER && !process.env.SMTP_PASS) ||
      (!process.env.SMTP_USER && process.env.SMTP_PASS)
    ) {
      logger.warn(
        'Configuration SMTP incomplète : définir SMTP_USER et SMTP_PASS ensemble (ou aucun des deux).',
      );
    }
    if (!process.env.TEACHER_ADMIN_EMAIL || !process.env.TEACHER_ADMIN_PASSWORD) {
      logger.warn(
        'TEACHER_ADMIN_EMAIL/TEACHER_ADMIN_PASSWORD non définis : aucun compte prof email ne sera auto-semé.',
      );
    }
    const hasGoogleClientId = !!process.env.GOOGLE_OAUTH_CLIENT_ID;
    const hasGoogleClientSecret = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const hasGoogleRedirectUri = !!process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (hasGoogleClientId || hasGoogleClientSecret || hasGoogleRedirectUri) {
      if (!hasGoogleClientId || !hasGoogleClientSecret || !hasGoogleRedirectUri) {
        logger.warn(
          'Configuration OAuth Google incomplète : définir GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET et GOOGLE_OAUTH_REDIRECT_URI ensemble.',
        );
      }
      if (!process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS && !process.env.GOOGLE_OAUTH_ALLOWED_EMAILS) {
        logger.warn(
          "OAuth Google actif sans liste explicite : seuls les domaines par défaut de l'établissement ouvrent la connexion (la liste d'e-mails par défaut est vide). Un compte Google hors de ces domaines — adresse personnelle d'un administrateur — doit être déclaré dans GOOGLE_OAUTH_ALLOWED_EMAILS.",
        );
      }
    }
  }
}

module.exports = { validateEnv, KNOWN_PUBLIC_JWT_SECRETS, isKnownPublicJwtSecret };
