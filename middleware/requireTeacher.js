const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production');

/** Exige un token JWT professeur valide (header Authorization: Bearer <token>). */
function requireTeacher(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Mode prof non configuré' });
  }
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

module.exports = { requireTeacher, JWT_SECRET };
