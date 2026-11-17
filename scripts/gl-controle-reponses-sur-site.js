#!/usr/bin/env node
'use strict';

/**
 * Gnomes & Licornes « Tenir à deux » — la réponse est-elle sur le site ? (ensemble unifié, M22)
 *
 * Pour chaque question de zone, puis chaque question de case tirée en partie
 * (`usage_tenir = 1`), cherche les mots de la bonne réponse dans les fiches d'espèces et les
 * termes de glossaire reliés. Sortie CSV (séparateur « ; ») : `trouvée`, `en partie`,
 * `introuvable`. C'est la liste de travail du prochain lot de contenu.
 *
 * **Lecture seule** : aucune écriture, aucune migration lancée (la base doit être à jour).
 *
 * Usage :
 *   node scripts/gl-controle-reponses-sur-site.js                       # CSV sur la sortie standard
 *   node scripts/gl-controle-reponses-sur-site.js --sortie rapport.csv  # CSV dans un fichier
 *   node scripts/gl-controle-reponses-sur-site.js --portee zone         # zones seulement
 *   DB_NAME=foretmap_sim node scripts/gl-controle-reponses-sur-site.js  # corpus du banc
 *
 * Le décompte par portée et par verdict s'écrit sur la sortie d'erreur. La base du banc
 * (`npm run gl:sim:db`) ne porte pas le glossaire : les termes absents sont signalés dans la
 * colonne `note`, et le verdict ne repose alors que sur les fiches.
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { construireRapport, versCsv, resumer } = require('../lib/glReponsesSurSite');

function parseArgs(argv) {
  const args = { sortie: null, portee: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sortie') {
      args.sortie = path.resolve(String(argv[i + 1] || ''));
      i += 1;
    } else if (argv[i] === '--portee') {
      const p = String(argv[i + 1] || '');
      args.portee = ['zone', 'case'].includes(p) ? p : null;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { queryAll, queryOne } = require('../database');
  let rapport = await construireRapport({ queryAll, queryOne });
  if (args.portee) rapport = rapport.filter((l) => l.portee === args.portee);
  const csv = versCsv(rapport);
  if (args.sortie) fs.writeFileSync(args.sortie, csv);
  else process.stdout.write(csv);
  const resume = resumer(rapport);
  for (const [portee, r] of Object.entries(resume)) {
    console.error(
      `[gl-controle-reponses] ${portee} : ${r.total} questions — ${r['trouvée']} trouvées, ${r['en partie']} en partie, ${r.introuvable} introuvables`,
    );
  }
  if (args.sortie) console.error(`[gl-controle-reponses] rapport écrit : ${args.sortie}`);
  process.exit(0);
}

module.exports = { parseArgs };

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-controle-reponses] erreur :', err.message || err);
    process.exit(1);
  });
}
