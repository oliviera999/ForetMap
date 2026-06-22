'use strict';

const crypto = require('crypto');

const DEFAULT_TTL_SEC = 3600;
const TOKEN_SEP = '.';

function previewSecret() {
  const fromEnv = String(process.env.VISIT_COOKIE_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    const jwt = String(process.env.JWT_SECRET || '').trim();
    if (jwt) return jwt;
    throw new Error('VISIT_COOKIE_SECRET requis en production');
  }
  return process.env.JWT_SECRET || 'visit-dev-secret-change-me';
}

function signValue(value) {
  return crypto.createHmac('sha256', previewSecret()).update(value).digest('base64url');
}

function verifySignature(value, signature) {
  const expected = signValue(value);
  try {
    const a = Buffer.from(String(signature || ''), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function normalizePackId(packId) {
  const id = String(packId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return id;
}

function normalizeFilename(filename) {
  const name = String(filename || '')
    .replace(/^.*[\\/]/, '')
    .trim();
  if (!name || !/^[a-zA-Z0-9._-]+\.png$/i.test(name)) return null;
  return name;
}

/**
 * @param {string} packId
 * @param {string} filename
 * @param {{ ttlSec?: number }} [opts]
 * @returns {string|null}
 */
function signVisitMascotPackAssetPreview(packId, filename, opts = {}) {
  const id = normalizePackId(packId);
  const fn = normalizeFilename(filename);
  if (!id || !fn) return null;
  const ttl = Math.max(60, Math.min(86_400, Number(opts.ttlSec) || DEFAULT_TTL_SEC));
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${exp}|${id}|${fn}`;
  const sig = signValue(payload);
  return `${payload}${TOKEN_SEP}${sig}`;
}

/**
 * @param {string} token
 * @param {string} packId
 * @param {string} filename
 * @returns {boolean}
 */
function verifyVisitMascotPackAssetPreview(token, packId, filename) {
  const id = normalizePackId(packId);
  const fn = normalizeFilename(filename);
  if (!id || !fn) return false;
  const raw = String(token || '').trim();
  const splitAt = raw.lastIndexOf(TOKEN_SEP);
  if (splitAt <= 0) return false;
  const payload = raw.slice(0, splitAt);
  const sig = raw.slice(splitAt + 1);
  if (!verifySignature(payload, sig)) return false;
  const parts = payload.split('|');
  if (parts.length !== 3) return false;
  const [expStr, tokenPackId, tokenFilename] = parts;
  if (tokenPackId !== id || tokenFilename !== fn) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

/**
 * @param {string} canonicalUrl
 * @param {string} packId
 * @param {string} filename
 * @param {{ ttlSec?: number }} [opts]
 * @returns {string}
 */
function appendPreviewTokenToAssetUrl(canonicalUrl, packId, filename, opts = {}) {
  const base = String(canonicalUrl || '').trim();
  if (!base) return base;
  const token = signVisitMascotPackAssetPreview(packId, filename, opts);
  if (!token) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}preview_token=${encodeURIComponent(token)}`;
}

module.exports = {
  DEFAULT_TTL_SEC,
  signVisitMascotPackAssetPreview,
  verifyVisitMascotPackAssetPreview,
  appendPreviewTokenToAssetUrl,
};
