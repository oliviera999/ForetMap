'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { execute, queryOne } = require('../database');
const { getSettingValue } = require('./settings');

const PASSWORD_RESET_MIN_LEN = 4;
const PASSWORD_RESET_TTL_MINUTES = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getPasswordResetBaseUrl() {
  return process.env.PASSWORD_RESET_BASE_URL
    || process.env.FRONTEND_ORIGIN
    || 'http://localhost:3000';
}

function getGlPasswordResetBaseUrl(req) {
  const fromEnv = String(process.env.GL_PASSWORD_RESET_BASE_URL || process.env.GL_FRONTEND_ORIGIN || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (req?.protocol && req?.get) {
    return `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  }
  return getPasswordResetBaseUrl().replace(/\/$/, '');
}

function makeResetUrl(type, token, { product = 'foret' } = {}, req = null) {
  const base = (product === 'gl' ? getGlPasswordResetBaseUrl(req) : getPasswordResetBaseUrl()).replace(/\/$/, '');
  if (product === 'gl') {
    return `${base}/#resetType=${encodeURIComponent(type)}&resetToken=${encodeURIComponent(token)}`;
  }
  return `${base}/?resetType=${encodeURIComponent(type)}&resetToken=${encodeURIComponent(token)}`;
}

async function getPasswordMinLength() {
  const n = await getSettingValue('security.password_min_length', PASSWORD_RESET_MIN_LEN);
  const parsed = parseInt(n, 10);
  if (!Number.isFinite(parsed)) return PASSWORD_RESET_MIN_LEN;
  return Math.min(Math.max(parsed, 4), 32);
}

async function createPasswordResetToken(userType, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  const ttlMs = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await execute(
    'INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)',
    [uuidv4(), userType, String(userId), tokenHash, expiresAt]
  );
  return token;
}

async function consumePasswordResetToken(userType, token) {
  const tokenHash = hashResetToken(token);
  const row = await queryOne(
    `SELECT id, user_id
       FROM password_reset_tokens
      WHERE user_type = ?
        AND token_hash = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [userType, tokenHash]
  );
  if (!row) return null;

  const result = await execute(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
    [row.id]
  );
  if (!result.affectedRows) return null;
  return row.user_id;
}

module.exports = {
  EMAIL_RE,
  PASSWORD_RESET_MIN_LEN,
  PASSWORD_RESET_TTL_MINUTES,
  hashResetToken,
  getPasswordResetBaseUrl,
  getGlPasswordResetBaseUrl,
  makeResetUrl,
  getPasswordMinLength,
  createPasswordResetToken,
  consumePasswordResetToken,
};
