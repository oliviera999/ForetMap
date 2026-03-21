/**
 * Duplique la sortie Pino vers stdout et conserve les dernières lignes en mémoire
 * pour consultation via GET /api/admin/logs (secret DEPLOY_SECRET).
 */
'use strict';

const { PassThrough } = require('stream');

const MAX_LINES = Math.min(
  5000,
  Math.max(100, parseInt(process.env.LOG_BUFFER_MAX_LINES || '2000', 10))
);

/** @type {string[]} */
const lines = [];
let carry = '';

function pushCompleteLines(text) {
  const parts = (carry + text).split('\n');
  carry = parts.pop() ?? '';
  for (const line of parts) {
    if (line.length === 0) continue;
    lines.push(line);
    while (lines.length > MAX_LINES) lines.shift();
  }
}

const ringSink = new PassThrough();
ringSink.on('data', (chunk) => {
  pushCompleteLines(chunk.toString());
});

/** Stream unique : Pino écrit ici → stdout + tampon */
const teeStream = new PassThrough();
teeStream.pipe(process.stdout);
teeStream.pipe(ringSink);

/**
 * @param {number} n nombre de lignes (défaut 200, max 5000)
 * @returns {string[]}
 */
function tailLogLines(n) {
  const lim = Math.min(5000, Math.max(1, Number.isFinite(n) ? n : 200));
  return lines.slice(-lim);
}

function getBufferedLineCount() {
  return lines.length;
}

function getMaxLines() {
  return MAX_LINES;
}

module.exports = {
  teeStream,
  tailLogLines,
  getBufferedLineCount,
  getMaxLines,
};
