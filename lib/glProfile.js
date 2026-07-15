'use strict';

const { normalizeOptionalString } = require('./shared/httpHelpers');

const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function detectAvatarExtension(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp);base64,/i.exec(String(dataUrl || ''));
  if (!match) return null;
  const raw = String(match[1]).toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

function validatePlayerProfileInput({ pseudo, email, description }) {
  if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  if (email != null && !EMAIL_RE.test(email)) {
    return 'Email invalide';
  }
  if (description != null && description.length > MAX_DESCRIPTION_LEN) {
    return `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`;
  }
  return null;
}

function validateStaffProfileInput({ displayName, description }) {
  if (displayName != null && displayName.length > 120) {
    return 'Nom affiché trop long (max 120 caractères)';
  }
  if (description != null && description.length > MAX_DESCRIPTION_LEN) {
    return `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`;
  }
  return null;
}

module.exports = {
  MAX_AVATAR_BYTES,
  MAX_DESCRIPTION_LEN,
  normalizeOptionalString,
  normalizeEmail,
  detectAvatarExtension,
  validatePlayerProfileInput,
  validateStaffProfileInput,
};
