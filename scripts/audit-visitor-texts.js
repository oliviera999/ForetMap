#!/usr/bin/env node
'use strict';

/**
 * Audit des textes visiteurs d'une base (lecture seule) : incitations à cueillir, goûter ou
 * manipuler un être vivant, et zones grises. Règle et motifs : `lib/visitorTextGuard.js`.
 *
 *   npm run audit:visitor-texts            # base de .env
 *   DB_NAME=autre npm run audit:visitor-texts
 *
 * Sortie : une ligne par correspondance (table, id, colonne, classe, extrait), puis un total.
 * Code de sortie 1 s'il reste une incitation non arbitrée.
 */

require('dotenv').config();
const { queryAll } = require('../database');
const { scanVisitorTextCorpus } = require('../lib/visitorTextCorpus');

async function main() {
  const hits = await scanVisitorTextCorpus({ queryAll });
  const relevant = hits.filter((hit) => !hit.cls.startsWith('faux-positif'));
  for (const hit of relevant) {
    const flag = hit.excepted ? ' (exception arbitrée)' : '';
    console.log(`${hit.cls}${flag}\t${hit.table}#${hit.id}.${hit.column}\t« ${hit.extract} »`);
  }
  const blocking = relevant.filter((hit) => hit.cls === 'incitation' && !hit.excepted);
  console.log(
    `\n${relevant.length} correspondance(s) hors faux positifs, dont ${blocking.length} incitation(s) non arbitrée(s).`,
  );
  process.exitCode = blocking.length > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50));
