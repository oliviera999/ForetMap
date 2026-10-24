'use strict';

/**
 * Ressources rattachées à un compte `users`, lisibles sans jeton par URL signée.
 *
 * `GET /api/users/:id/default-avatar?exp=…&sig=…` — avatar par défaut (SVG) d'un compte sans
 * photo, généré par le serveur (`lib/defaultAvatar.js`). Une balise `<img>` n'envoie pas le
 * jeton `Authorization` : comme pour les photos d'élèves, **la signature est l'autorisation**.
 * Elle n'est émise que par les routes qui exposent déjà le compte ; sans signature valide et
 * non expirée — ou si elle a été calculée pour une autre graine — la réponse est un **404**,
 * indiscernable d'un compte absent.
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { queryOne } = require('../database');
const { logRouteError } = require('../lib/routeLog');
const { signedUploadCacheControl } = require('../lib/httpImageCache');
const {
  defaultAvatarSeed,
  parseDefaultAvatarQuery,
  renderDefaultAvatarSvg,
  verifyDefaultAvatarSignature,
} = require('../lib/defaultAvatar');

const router = express.Router();

/** Même politique que les SVG déposés sous `/uploads` : inerte si ouvert directement. */
const SVG_RESPONSE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

function notFound(res) {
  return res.status(404).json({ error: 'Avatar introuvable' });
}

router.get(
  '/:id/default-avatar',
  asyncHandler(async (req, res) => {
    const userId = String(req.params.id || '').trim();
    if (!userId || userId.length > 64) return notFound(res);
    // Forme et échéance vérifiées avant toute lecture en base.
    const parsed = parseDefaultAvatarQuery(req.query);
    if (!parsed) return notFound(res);
    const row = await queryOne(
      'SELECT id, pseudo, first_name, last_name FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!row) return notFound(res);
    const seed = defaultAvatarSeed(row);
    if (!verifyDefaultAvatarSignature(userId, parsed, seed)) return notFound(res);

    let rendered;
    try {
      rendered = await renderDefaultAvatarSvg(seed);
    } catch (err) {
      // Bibliothèque absente ou SVG refusé : le client affiche son repli neutre (`onError`).
      logRouteError(err, req, 'Avatar par défaut indisponible');
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Avatar par défaut indisponible' });
    }

    res.set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': signedUploadCacheControl(),
      'Content-Security-Policy': SVG_RESPONSE_CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      ETag: rendered.etag,
    });
    // `res.send` compare `If-None-Match` à l'ETag posé et répond 304 si rien n'a changé.
    return res.send(rendered.svg);
  }),
);

module.exports = router;
