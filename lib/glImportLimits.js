'use strict';

const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const CONTENT_LIBRARY_MAX_FILE_BYTES = 32 * 1024 * 1024;

function parseEnvBytes(rawValue, fallback) {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber);
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|mo|gb)?$/i.exec(raw);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const unit = String(match[2] || 'b').toLowerCase();
  if (unit === 'kb') return Math.floor(amount * 1024);
  if (unit === 'mb' || unit === 'mo') return Math.floor(amount * 1024 * 1024);
  if (unit === 'gb') return Math.floor(amount * 1024 * 1024 * 1024);
  return Math.floor(amount);
}

function getGlImportMaxFileBytes(context = 'default') {
  if (context === 'content_library') {
    return parseEnvBytes(
      process.env.FORETMAP_CONTENT_LIBRARY_MAX_FILE_BYTES,
      CONTENT_LIBRARY_MAX_FILE_BYTES
    );
  }
  return parseEnvBytes(process.env.FORETMAP_GL_IMPORT_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES);
}

function formatImportMaxFileLabel(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '0 o';
  const mb = value / (1024 * 1024);
  if (mb >= 1) {
    const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
    return `${rounded} Mo`;
  }
  const kb = value / 1024;
  if (kb >= 1) return `${Math.round(kb)} Ko`;
  return `${value} o`;
}

module.exports = {
  DEFAULT_MAX_FILE_BYTES,
  CONTENT_LIBRARY_MAX_FILE_BYTES,
  getGlImportMaxFileBytes,
  formatImportMaxFileLabel,
};
