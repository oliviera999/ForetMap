'use strict';

const { normalizeOptionalString } = require('./shared/httpHelpers');
const { detectAvatarExtension } = require('./shared/dataUrlImage');
const { PSEUDO_RE, PSEUDO_INVALID_MSG } = require('./shared/pseudo');

const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function validatePlayerProfileInput({ pseudo, email, description }) {
  if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
    return PSEUDO_INVALID_MSG;
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
