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
  if (!process.env.PORT && !process.env.ALWAYSDATA_HTTPD_PORT) {
    process.env.PORT = '3000';
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TEACHER_PIN) {
      console.warn('Avertissement : TEACHER_PIN non défini en production. Le mode professeur sera désactivé (POST /api/auth/teacher renverra 503).');
    }
    if (!process.env.FRONTEND_ORIGIN) {
      console.warn('Avertissement : FRONTEND_ORIGIN non défini en production, CORS reste permissif.');
    }
  }
}

module.exports = { validateEnv };
