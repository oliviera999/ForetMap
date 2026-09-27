#!/usr/bin/env node
'use strict';

/**
 * Contrôle de l'installation serveur, sans terminal : cPanel → Setup Node.js App →
 * « Run JS Script » → `check:runtime`. Dans un terminal : `npm run check:runtime` (après avoir
 * activé l'environnement Node de l'application, voir docs/EXPLOITATION.md).
 *
 * Remplace les commandes `node -e "require('…')"` du runbook de déploiement, que le terminal
 * cPanel ne sait pas lancer tant que l'environnement Node n'est pas activé.
 *
 * Contrôles (lecture seule) :
 *   - version de Node ;
 *   - schéma de la base à jour (sinon : `npm run db:migrate`) ;
 *   - `isomorphic-dompurify` (obligatoire : nettoyage du HTML des tutoriels) ;
 *   - `sharp` (facultatif : vignettes d'images ; sans lui, l'application fonctionne) ;
 *   - build du front présent (`dist/index.vite.html`) ;
 *   - miroir `lib/visit-pack/` présent (requis au runtime par l'API).
 *
 * Code de sortie : 0 si tout ce qui est obligatoire va bien, 1 sinon.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * @typedef {{ label: string, ok: boolean, required: boolean, detail: string }} RuntimeCheck
 */

/** @returns {RuntimeCheck} */
function checkModule(name, { required, purpose }) {
  try {
    require(name);
    return { label: name, ok: true, required, detail: `chargé (${purpose})` };
  } catch (err) {
    const reason = err && err.code === 'MODULE_NOT_FOUND' ? 'absent' : err.message;
    return { label: name, ok: false, required, detail: `${reason} — ${purpose}` };
  }
}

/** @returns {RuntimeCheck} */
function checkFile(label, relativePath, { required, hint }) {
  const ok = fs.existsSync(path.join(ROOT, relativePath));
  return {
    label,
    ok,
    required,
    detail: ok ? `${relativePath} présent` : `${relativePath} absent — ${hint}`,
  };
}

/** @returns {Promise<RuntimeCheck>} */
async function checkSchema() {
  const database = require('../database');
  const { getMigrationStatus } = require('../lib/migrationStatus');
  try {
    const status = await getMigrationStatus(database);
    if (status.upToDate) {
      return {
        label: 'schéma BDD',
        ok: true,
        required: true,
        detail: `à jour (version ${status.current})`,
      };
    }
    const current = status.current === null ? 'aucune' : status.current;
    return {
      label: 'schéma BDD',
      ok: false,
      required: true,
      detail:
        `version ${current}, dernier fichier ${status.latest} : ${status.pending.length} migration(s) ` +
        'en attente — lancer db:migrate après une sauvegarde',
    };
  } catch (err) {
    return {
      label: 'schéma BDD',
      ok: false,
      required: true,
      detail: `base injoignable : ${err.message}`,
    };
  } finally {
    await database.endPool().catch(() => {});
  }
}

/**
 * @param {RuntimeCheck[]} checks
 * @returns {{ lines: string[], ok: boolean }}
 */
function formatReport(checks) {
  const lines = checks.map((c) => {
    const mark = c.ok ? '✔' : c.required ? '✖' : '⚠';
    return `${mark} ${c.label} : ${c.detail}`;
  });
  const ok = checks.every((c) => c.ok || !c.required);
  lines.push(
    ok
      ? 'Résultat : installation conforme.'
      : 'Résultat : au moins un contrôle obligatoire a échoué.',
  );
  return { lines, ok };
}

async function main() {
  const checks = [
    { label: 'Node.js', ok: true, required: true, detail: process.version },
    await checkSchema(),
    checkModule('isomorphic-dompurify', {
      required: true,
      purpose: 'nettoyage du HTML des tutoriels',
    }),
    checkModule('sharp', {
      required: false,
      purpose: 'vignettes des photos ; facultatif, voir docs/EXPLOITATION.md § 8',
    }),
    checkFile('build du front', 'dist/index.vite.html', {
      required: true,
      hint: 'le cron le récupère sur la branche dist-artifact/main (docs/DEPLOY_DIST_ARTIFACT.md)',
    }),
    checkFile('miroir visit-pack', 'lib/visit-pack/mascotPack.js', {
      required: true,
      hint: 'npm run sync:visit-pack-lib',
    }),
  ];
  const { lines, ok } = formatReport(checks);
  for (const line of lines) console.log(line);
  process.exit(ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { checkModule, checkFile, formatReport };
