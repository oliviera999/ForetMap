/**
 * Identifiant de corrélation par requête (logs / support).
 * Accepte X-Request-Id client si format sûr, sinon UUID.
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

const CLIENT_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function assignRequestId(req, res, next) {
  const raw = String(req.headers['x-request-id'] || '').trim();
  const id = CLIENT_ID_RE.test(raw) ? raw : uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { assignRequestId };
