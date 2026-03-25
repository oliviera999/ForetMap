const logger = require('./logger');

/**
 * Valide les variables d'environnement au démarrage.
 * En production, TEACHER_PIN et (recommandé) FRONTEND_ORIGIN doivent être définis.
 * @throws {Error} si une variable requise manque
 */
function validateEnv() {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(', ')}. ` +
      'Copiez .env.example vers .env et renseignez les valeurs.'
    );
  }
  if (process.env.DB_PORT) {
    const p = parseInt(process.env.DB_PORT, 10);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      logger.warn(`DB_PORT invalide (« ${process.env.DB_PORT} ») : le port par défaut 3306 sera utilisé.`);
    }
  }
  if (!process.env.PORT && !process.env.ALWAYSDATA_HTTPD_PORT) {
    process.env.PORT = '3000';
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TEACHER_PIN) {
      logger.warn(
        'TEACHER_PIN non défini en production : le mode professeur sera désactivé (POST /api/auth/teacher renverra 503).'
      );
    }
    if (!process.env.JWT_SECRET) {
      logger.warn(
        'JWT_SECRET non défini en production : le mode professeur sera désactivé (token JWT impossible).'
      );
    }
    if (!process.env.FRONTEND_ORIGIN) {
      logger.warn('FRONTEND_ORIGIN non défini en production : CORS reste permissif.');
    }
    if (!process.env.DEPLOY_SECRET) {
      logger.warn(
        'DEPLOY_SECRET non défini en production : /api/admin/restart et /api/admin/logs resteront inaccessibles.'
      );
    }
    if (!process.env.SMTP_HOST) {
      logger.warn(
        'SMTP_HOST non défini en production : les emails de réinitialisation de mot de passe seront désactivés.'
      );
    }
    if ((process.env.SMTP_USER && !process.env.SMTP_PASS) || (!process.env.SMTP_USER && process.env.SMTP_PASS)) {
      logger.warn(
        'Configuration SMTP incomplète : définir SMTP_USER et SMTP_PASS ensemble (ou aucun des deux).'
      );
    }
    if (!process.env.TEACHER_ADMIN_EMAIL || !process.env.TEACHER_ADMIN_PASSWORD) {
      logger.warn(
        'TEACHER_ADMIN_EMAIL/TEACHER_ADMIN_PASSWORD non définis : aucun compte prof email ne sera auto-semé.'
      );
    }
  }
}

module.exports = { validateEnv };
