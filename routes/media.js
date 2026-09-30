'use strict';

/**
 * Ressources tierces servies depuis notre origine (audit RGPD du 28/09/2026, § 7) :
 *  - `GET /api/media/remote?url=…` — relais + cache des images Wikimedia ;
 *  - `GET /api/media/commons-preview?category=…` — première image d'une catégorie Commons ;
 *  - `GET /fonts/local-fonts.css` et `GET /fonts/files/:pkg/:file` — polices des fiches
 *    tutoriels (Fontsource, OFL-1.1).
 *
 * Routes publiques : elles ne servent que du contenu libre déjà public chez Wikimedia ou dans
 * les paquets de polices, jamais une donnée de l'établissement.
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const {
  RemoteMediaError,
  getRemoteMedia,
  fetchCommonsCategoryPreviewUrl,
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

mediaRouter.get(
  '/remote',
  asyncHandler(async (req, res) => {
    try {
      const media = await getRemoteMedia(req.query.url, { clientKey: req.ip || null });
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
