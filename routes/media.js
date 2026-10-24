'use strict';

/**
 * Ressources tierces servies depuis notre origine (audit RGPD du 28/09/2026, § 7 ;
 * lot B traceurs 24/10/2026) :
 *  - `GET /api/media/remote?url=…` — relais + cache des images HTTPS publiques ;
 *  - `GET /api/media/commons-preview?category=…` — première image d'une catégorie Commons ;
 *  - `GET /fonts/local-fonts.css` et `GET /fonts/files/:pkg/:file` — polices des fiches
 *    tutoriels (Fontsource, OFL-1.1).
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getSettingValue } = require('../lib/settings');
const {
  RemoteMediaError,
  getRemoteMedia,
  fetchCommonsCategoryPreviewUrl,
  normalizeRemoteMediaUrl,
  normalizeHostList,
  isRemoteMediaRequestAllowed,
} = require('../lib/remoteMedia');
const { buildLocalFontsCss, resolveLocalFontFile } = require('../lib/localFonts');

const mediaRouter = express.Router();

/** Une image servie depuis notre origine ne doit jamais pouvoir s'y exécuter (SVG). */
function setInertImageHeaders(res, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendRemoteMediaError(res, err) {
  if (err instanceof RemoteMediaError) return res.status(err.status).json({ error: err.message });
  throw err;
}

async function loadRemoteMediaPolicy() {
  const [hostsMode, allowRaw, blockedRaw] = await Promise.all([
    getSettingValue('privacy.remote_media_hosts_mode', 'any_public'),
    getSettingValue('privacy.remote_media_hosts', ''),
    getSettingValue('privacy.remote_media_blocked_hosts', ''),
  ]);
  return {
    hostsMode: hostsMode === 'allowlist' ? 'allowlist' : 'any_public',
    allowHosts: normalizeHostList(allowRaw),
    blockedHosts: normalizeHostList(blockedRaw),
  };
}

mediaRouter.get(
  '/remote',
  asyncHandler(async (req, res) => {
    try {
      const policy = await loadRemoteMediaPolicy();
      const normalized = normalizeRemoteMediaUrl(req.query.url, policy);
      if (!normalized) throw new RemoteMediaError(400, 'URL non autorisée');
      if (!isRemoteMediaRequestAllowed(req, normalized)) {
        throw new RemoteMediaError(403, 'Relais refusé depuis une origine tierce');
      }
      const media = await getRemoteMedia(normalized, {
        clientKey: req.ip || null,
        policy,
      });
      setInertImageHeaders(res, media.contentType);
      return res.sendFile(media.filePath, { dotfiles: 'deny' });
    } catch (err) {
      return sendRemoteMediaError(res, err);
    }
  }),
);

mediaRouter.get(
  '/commons-preview',
  asyncHandler(async (req, res) => {
    try {
      const url = await fetchCommonsCategoryPreviewUrl(req.query.category);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json({ url });
    } catch (err) {
      return sendRemoteMediaError(res, err);
    }
  }),
);

const fontsRouter = express.Router();

fontsRouter.get('/local-fonts.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buildLocalFontsCss());
});

fontsRouter.get('/files/:pkg/:file', (req, res) => {
  const filePath = resolveLocalFontFile(req.params.pkg, req.params.file);
  if (!filePath) return res.status(404).end();
  res.setHeader('Content-Type', filePath.endsWith('.woff2') ? 'font/woff2' : 'font/woff');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(filePath);
});

module.exports = { mediaRouter, fontsRouter };
