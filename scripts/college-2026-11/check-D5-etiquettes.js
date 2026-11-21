#!/usr/bin/env node
'use strict';

/**
 * Contrôle des données du flux D5 (chantier collège, novembre 2026) : étiquettes simples
 * (`plants.usage_label`) des fiches visibles des élèves.
 *
 * Lit `data/college-2026-11/D5/*.json` (un fichier par groupe d'usage) et l'instantané de
 * contenu (`docs/coordination/college-2026-11/snapshot/`), et vérifie :
 *   - couverture : chaque fiche hors `entity_kind = 'ressource'` a exactement une étiquette,
 *     aucune ressource n'en reçoit, chaque fiche citée existe (nom + nom scientifique) ;
 *   - rangement : la fiche relève bien du groupe d'usage de son fichier (boîte de l'arbre
 *     collège la plus proche en remontant les clades, arbre de D2) ;
 *   - forme : article indéfini en tête (un, une, des), minuscule initiale, 40 caractères au
 *     plus, Unicode NFC / NFKC, aucun emoji, aucun verbe interdit, apostrophe droite, pas de
 *     double espace ni de point final ;
 *   - vocabulaire : aucun terme du glossaire hors palier `base` (formes exactes) ;
 *   - cohérence avec le clade : le nom de tête (premier nom après l'article et les adjectifs
 *     de taille) n'appartient pas à un autre grand groupe (un insecte n'est pas « une
 *     araignée », une plante n'est pas « un animal »…) ; un milieu (« des fleurs ») reste libre.
 *
 * Usage : node scripts/college-2026-11/check-D5-etiquettes.js [--json]
 * Code de sortie 1 si une erreur est trouvée. Aucune I/O base de données.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'D5');
const SNAPSHOT_DIR = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'snapshot');

const MAX_LENGTH = 40;
const ARTICLE = /^(un|une|des) \S/;
const FORBIDDEN_VERBS = /(cueill|goût|gout|touch|frott|manipul|ramass|attrap)/i;

// Mots du langage courant qui sont aussi des variantes de termes du glossaire hors `base`.
const MOTS_COURANTS = new Set(['sable']);

/**
 * Mots interdits par grand groupe (cohérence avec le clade). Les clés sont les `groupe` des
 * fichiers ; les motifs portent sur des mots entiers (insensibles à la casse).
 */
const PLANTES = ['plante', 'arbre', 'arbuste', 'herbe', 'fleur', 'fougère', 'mousse', 'liane'];
const ANIMAUX_GENERIQUES = ['animal', 'insecte', 'araignée', 'oiseau', 'poisson', 'mammifère'];
const INCOMPATIBLES = {
  'plantes-a-fleurs': [...ANIMAUX_GENERIQUES, 'algue', 'champignon', 'bactérie', 'mousse'],
  'autres-plantes': [...ANIMAUX_GENERIQUES, 'algue', 'champignon', 'bactérie', 'fleur'],
  algues: [...ANIMAUX_GENERIQUES, 'arbre', 'arbuste', 'herbe', 'fleur', 'champignon'],
  champignons: [...ANIMAUX_GENERIQUES, 'plante', 'arbre', 'fleur', 'algue', 'bactérie'],
  microbes: ['arbre', 'fleur', 'oiseau', 'poisson', 'mammifère', 'insecte'],
  insectes: [...PLANTES, 'araignée', 'oiseau', 'poisson', 'mammifère', 'crustacé', 'ver'],
  arachnides: [...PLANTES, 'insecte', 'oiseau', 'poisson', 'mammifère', 'crustacé'],
  crustaces: [...PLANTES, 'insecte', 'araignée', 'oiseau', 'poisson', 'mammifère'],
  'mille-pattes': [...PLANTES, 'araignée', 'oiseau', 'poisson', 'mammifère', 'crustacé'],
  mollusques: [...PLANTES, 'insecte', 'araignée', 'oiseau', 'poisson', 'mammifère'],
  vers: [...PLANTES, 'insecte', 'araignée', 'oiseau', 'poisson', 'mammifère'],
  'meduses-oursins': [...PLANTES, 'insecte', 'araignée', 'oiseau', 'poisson', 'mammifère'],
  poissons: [...PLANTES, 'insecte', 'araignée', 'oiseau', 'mammifère'],
  'amphibiens-reptiles': [...PLANTES, 'insecte', 'araignée', 'oiseau', 'poisson', 'mammifère'],
  oiseaux: [...PLANTES, 'insecte', 'araignée', 'poisson', 'mammifère'],
  mammiferes: [...PLANTES, 'insecte', 'araignée', 'oiseau', 'poisson'],
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadData(dir = DATA_DIR) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => ({ file: f, ...readJson(path.join(dir, f)) }));
}

function loadSnapshot(dir = SNAPSHOT_DIR) {
  return {
    clades: readJson(path.join(dir, 'clades.json')),
    plants: readJson(path.join(dir, 'plants.json')),
    glossary: readJson(path.join(dir, 'glossary_terms.json')),
  };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordRe(word) {
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(word)}[sx]?($|[^\\p{L}])`, 'iu');
}

/** Index des formes (terme + variantes) des termes du glossaire hors palier `base`. */
function buildNonBaseForms(glossary) {
  const forms = [];
  for (const t of glossary) {
    if (!t || t.niveau === 'base') continue;
    const all = [t.terme, ...String(t.variantes || '').split(',')]
      .map((s) => String(s || '').trim())
      .filter((s) => s.length >= 3 && !MOTS_COURANTS.has(s.toLowerCase()));
    for (const f of all) forms.push({ terme: t.terme, niveau: t.niveau, re: wordRe(f) });
  }
  return forms;
}

function nonBaseTermsIn(text, forms) {
  const found = new Set();
  for (const f of forms) if (f.re.test(text)) found.add(`${f.terme} (${f.niveau})`);
  return [...found];
}

/** Contrôles de forme d'une étiquette. */
function checkLabel(where, text) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return [`${where} : étiquette vide`];
  if (text !== text.trim()) errors.push(`${where} : blancs en bord de texte`);
  if (text.length > MAX_LENGTH)
    errors.push(`${where} : ${text.length} caractères (max ${MAX_LENGTH})`);
  if (!ARTICLE.test(text))
    errors.push(`${where} : article indéfini attendu en tête (un, une, des)`);
  if (text.normalize('NFC') !== text) errors.push(`${where} : texte non normalisé NFC`);
  if (text.replace(/ | /g, ' ').normalize('NFKC') !== text.replace(/ | /g, ' '))
    errors.push(`${where} : caractère de compatibilité Unicode (NFKC)`);
  if (/[\u0000-\u001f\u007f]/.test(text)) errors.push(`${where} : caractère de contrôle`);
  if (/\p{Extended_Pictographic}/u.test(text)) errors.push(`${where} : emoji dans un texte`);
  if (FORBIDDEN_VERBS.test(text))
    errors.push(`${where} : verbe interdit (${text.match(FORBIDDEN_VERBS)[0]})`);
  if (/’/.test(text)) errors.push(`${where} : apostrophe courbe (corpus : apostrophe droite)`);
  if (/ {2}/.test(text)) errors.push(`${where} : double espace`);
  if (/[.;:!?]$/.test(text)) errors.push(`${where} : ponctuation finale`);
  if (/[;:!?«»]/.test(text)) errors.push(`${where} : ponctuation forte ou guillemets`);
  return errors;
}

/** Groupe d'usage (identifiant de boîte) d'un clade : boîte listée la plus proche. */
function boxFor(cladeId, parentOf, boxes) {
  let id = cladeId;
  const seen = new Set();
  while (id && !seen.has(id)) {
    if (boxes.has(id)) return id;
    seen.add(id);
    id = parentOf.get(id);
  }
  return null;
}

const ADJ_TETE = new Set([
  'petit',
  'petite',
  'petits',
  'petites',
  'grand',
  'grande',
  'grands',
  'grandes',
  'gros',
  'grosse',
  'minuscule',
  'minuscules',
  'tout',
  'très',
  'vrai',
  'vraie',
]);

/** Nom de tête d'une étiquette : premier mot après l'article et les adjectifs de taille. */
function headNoun(label) {
  const words = String(label || '')
    .toLowerCase()
    .split(/\s+/)
    .slice(1);
  while (words.length > 1 && ADJ_TETE.has(words[0])) words.shift();
  return words[0] || '';
}

function runChecks(data = loadData(), snapshot = loadSnapshot()) {
  const errors = [];
  const warnings = [];
  const parentOf = new Map(snapshot.clades.map((c) => [c.id, c.parent_id]));
  const boxToFile = new Map();
  for (const d of data) {
    if (!d.groupe || !Array.isArray(d.boites) || !Array.isArray(d.fiches)) {
      errors.push(`${d.file} : champs groupe / boites / fiches attendus`);
      continue;
    }
    if (!INCOMPATIBLES[d.groupe]) errors.push(`${d.file} : groupe inconnu ${d.groupe}`);
    for (const b of d.boites) {
      if (boxToFile.has(b)) errors.push(`${d.file} : boîte ${b} déjà dans ${boxToFile.get(b)}`);
      boxToFile.set(b, d.file);
    }
  }
  const boxes = new Set(boxToFile.keys());
  const byName = new Map(snapshot.plants.map((p) => [p.name, p]));
  const forms = buildNonBaseForms(snapshot.glossary);
  const seen = new Map();
  let count = 0;

  for (const d of data) {
    const banned = (INCOMPATIBLES[d.groupe] || []).map((w) => ({ w, re: wordRe(w) }));
    for (const f of d.fiches || []) {
      count += 1;
      const where = `${d.file} › ${f.name}`;
      if (seen.has(f.name))
        errors.push(`${where} : fiche en double (aussi dans ${seen.get(f.name)})`);
      seen.set(f.name, d.file);
      const p = byName.get(f.name);
      if (!p) {
        errors.push(`${where} : fiche absente de l'instantané`);
        continue;
      }
      if ((p.scientific_name ?? null) !== (f.scientific_name ?? null))
        errors.push(
          `${where} : nom scientifique ${f.scientific_name} ≠ instantané ${p.scientific_name}`,
        );
      if (p.entity_kind === 'ressource') errors.push(`${where} : ressource (hors périmètre)`);
      const box = boxFor(p.clade_id, parentOf, boxes);
      const expected = box ? boxToFile.get(box) : boxToFile.get('(sans clade)');
      if (expected !== d.file)
        errors.push(
          `${where} : rangée dans ${d.file}, groupe d'usage attendu ${expected} (boîte ${box})`,
        );
      errors.push(...checkLabel(where, f.usage_label));
      const label = String(f.usage_label || '');
      const terms = nonBaseTermsIn(label, forms);
      if (terms.length) errors.push(`${where} : terme hors palier base : ${terms.join(', ')}`);
      const head = headNoun(label);
      for (const { w, re } of banned)
        if (re.test(head))
          errors.push(`${where} : mot « ${w} » incohérent avec le groupe ${d.groupe}`);
    }
  }
  for (const p of snapshot.plants) {
    if (p.entity_kind === 'ressource') continue;
    if (!seen.has(p.name)) errors.push(`fiche sans étiquette : ${p.name}`);
  }
  // Doublons d'étiquette : tolérés (espèces voisines), signalés pour la revue.
  const labels = new Map();
  for (const d of data)
    for (const f of d.fiches || []) {
      const k = String(f.usage_label || '').toLowerCase();
      labels.set(k, [...(labels.get(k) || []), f.name]);
    }
  for (const [k, names] of labels)
    if (names.length > 3) warnings.push(`étiquette partagée par ${names.length} fiches : « ${k} »`);
  return { errors, warnings, count };
}

module.exports = { loadData, loadSnapshot, runChecks, checkLabel, boxFor, headNoun, MAX_LENGTH };

if (require.main === module) {
  const res = runChecks();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  } else {
    for (const w of res.warnings) process.stdout.write(`avertissement : ${w}\n`);
    for (const e of res.errors) process.stdout.write(`ERREUR : ${e}\n`);
    process.stdout.write(`${res.count} étiquettes, ${res.errors.length} erreur(s).\n`);
  }
  process.exit(res.errors.length ? 1 : 0);
}
