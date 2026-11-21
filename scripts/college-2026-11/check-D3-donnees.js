#!/usr/bin/env node
'use strict';

/**
 * Flux D3 du chantier collège — contrôle des fichiers de données `data/college-2026-11/D3/`.
 *
 *   node scripts/college-2026-11/check-D3-donnees.js
 *
 * Vérifie :
 *   - décisions de palier : forme, palier 3 | 4 | 'lycee', raison non vide, aucun doublon ;
 *   - énoncés rendus autonomes et descriptions collège : longueur, forme NFKC (hors espaces
 *     insécables), aucun verbe d'invitation à agir sur le vivant (cueill, goût, touch, frott,
 *     manipul, ramass, attrap), typographie française (espace insécable avant « ; : ! ? % » et à
 *     l'intérieur des guillemets « »), aucun emoji ;
 *   - un énoncé autonome nomme le tutoriel en clair (« le tutoriel « … » ») ou ne s'y réfère plus.
 *
 * Sortie : liste des manquements et code 1, ou « OK » et code 0.
 */

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data', 'college-2026-11', 'D3');
const FORBIDDEN = /cueill|goût|touch|frott|manipul|ramass|attrap/i;
const EMOJI = /\p{Extended_Pictographic}/u;
// Points de suspension « … » : caractère du corpus d'origine, que NFKC décompose en « ... ».
const NFKC_ALLOWED = /[\u00a0\u202f\u2026]/g;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

/** Manquements typographiques et de vocabulaire d'un texte visible. */
function textProblems(text, { maxLength }) {
  const problems = [];
  if (typeof text !== 'string' || !text.trim()) return ['texte vide'];
  if (text.length > maxLength) problems.push(`plus de ${maxLength} caractères`);
  if (text.replace(NFKC_ALLOWED, ' ').normalize('NFKC') !== text.replace(NFKC_ALLOWED, ' '))
    problems.push('forme NFKC différente');
  if (FORBIDDEN.test(text)) problems.push(`verbe interdit (${text.match(FORBIDDEN)[0]})`);
  if (EMOJI.test(text)) problems.push('emoji dans le texte');
  if (/ [;:!?%]/.test(text)) problems.push('espace ordinaire avant une ponctuation haute');
  if (/[^\s  ][;!?]/.test(text.replace(/https?:\S+/g, '')))
    problems.push('ponctuation haute sans espace insécable');
  if (/« /.test(text) || / »/.test(text)) problems.push('espace ordinaire dans les guillemets');
  if (/«[^  ]/.test(text) || /[^  ]»/.test(text)) problems.push('guillemets sans espace insécable');
  if (/ {2}/.test(text)) problems.push('double espace');
  return problems;
}

function checkDecisions(errors) {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^paliers-lot\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) errors.push('aucun fichier paliers-lotNN.json');
  const seen = new Set();
  let total = 0;
  for (const file of files) {
    const list = readJson(file);
    if (!Array.isArray(list)) {
      errors.push(`${file} : tableau attendu`);
      continue;
    }
    if (list.length > 50) errors.push(`${file} : plus de 50 décisions`);
    for (const d of list) {
      total += 1;
      const where = `${file} ${d.code}`;
      if (!/^QF\d{4}$/.test(d.code || '')) errors.push(`${where} : code invalide`);
      if (seen.has(d.code)) errors.push(`${where} : décision en double`);
      seen.add(d.code);
      if (!d.categorie) errors.push(`${where} : catégorie manquante`);
      if (![3, 4, 'lycee'].includes(d.palier)) errors.push(`${where} : palier invalide`);
      if (!d.raison || d.raison.length < 8) errors.push(`${where} : raison manquante`);
      if (d.ajouts && d.palier === 'lycee')
        errors.push(`${where} : ajouts collège sur une question lycée`);
      if (d.notions_lycee && d.palier !== 'lycee')
        errors.push(`${where} : notions_lycee hors lycée`);
    }
  }
  return total;
}

function checkEnonces(errors) {
  const { autonomes = [], laisses = [] } = readJson('enonces.json');
  const seen = new Set();
  for (const e of autonomes) {
    const where = `enonces.json ${e.code}`;
    if (seen.has(e.code)) errors.push(`${where} : en double`);
    seen.add(e.code);
    if (!e.avant) errors.push(`${where} : énoncé d'origine manquant (garde <=>)`);
    if (e.avant === e.apres) errors.push(`${where} : énoncé inchangé`);
    for (const p of textProblems(e.apres, { maxLength: 300 })) errors.push(`${where} : ${p}`);
    if (/\b(la|cette) fiche\b|\ble texte\b|\ble panneau\b/i.test(e.apres))
      errors.push(`${where} : renvoie encore à une source implicite`);
    if (/tutoriel/.test(e.apres) && !/tutoriel\s«/.test(e.apres))
      errors.push(`${where} : tutoriel cité sans son titre`);
  }
  for (const e of laisses) {
    if (seen.has(e.code)) errors.push(`enonces.json ${e.code} : à la fois autonome et laissé`);
    if (!e.raison) errors.push(`enonces.json ${e.code} : raison manquante`);
  }
  return autonomes.length;
}

function checkCategories(errors) {
  const list = readJson('categories.json');
  const seen = new Set();
  for (const c of list) {
    const where = `categories.json ${c.slug}`;
    if (seen.has(c.slug)) errors.push(`${where} : en double`);
    seen.add(c.slug);
    // `quiz_categories.description_college` est un VARCHAR(255) (migration de socle).
    for (const p of textProblems(c.description_college, { maxLength: 255 }))
      errors.push(`${where} : ${p}`);
  }
  return list.length;
}

function main() {
  const errors = [];
  const decisions = checkDecisions(errors);
  const enonces = checkEnonces(errors);
  const categories = checkCategories(errors);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log(
    `OK — ${decisions} décisions, ${enonces} énoncés autonomes, ${categories} descriptions collège.`,
  );
}

if (require.main === module) main();

module.exports = { textProblems };
