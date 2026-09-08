'use strict';

/** Import dynamique de `jose` (ESM) depuis le runtime CommonJS. */
let cached = null;

async function loadJose() {
  if (!cached) cached = await import('jose');
  return cached;
}

module.exports = { loadJose };
