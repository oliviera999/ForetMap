#!/usr/bin/env node
'use strict';

/**
 * Vrai si l'instantané de contenu du 21/11 est présent. Il ne va pas sur `main` (supprimé par
 * SI avec le dossier de coordination) : sans lui, les contrôles croisés avec la prod sont
 * sautés ; la génération de la migration, qui ne lit que les données, reste vérifiable.
 */
function snapshotAvailable(dir = SNAPSHOT_DIR) {
  return fs.existsSync(path.join(dir, 'clades.json'));
}

/**
 * Contrôle des données du flux D2 (chantier collège, novembre 2026) : groupes d'usage de
 * l'arbre des clades et ordres d'insectes manquants.
 *
 * Lit `data/college-2026-11/D2/*.json` et l'instantané de contenu
 * (`docs/coordination/college-2026-11/snapshot/`), applique les changements à une copie en
 * mémoire et vérifie :
 *   - forme des entrées, longueurs, Unicode NFC, verbes interdits, typographie française ;
 *   - libellés et attributs sans terme du glossaire hors palier `base` non expliqué ;
 *   - chaque fiche visible des élèves (hors `ressource`) a un groupe d'usage autre que la
 *     racine, sauf les fiches sans clade (plancton, biofilm) ;
 *   - profondeur de l'arbre collège ≤ 4 de la racine à une feuille ;
 *   - ordres d'insectes : parent présent, identifiant libre, fiches à déplacer présentes sous
 *     l'ancien clade, ordre taxonomique cohérent, aucune fiche de ces ordres oubliée.
 *
 * Usage : node scripts/college-2026-11/check-D2-donnees.js [--json]
 * Code de sortie 1 si une erreur est trouvée. Aucune I/O base de données.
 */

const fs = require('node:fs');
const path = require('node:path');
const { indexClades, usageGroupFor, ancestorChain } = require('../../lib/clades');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'D2');
const SNAPSHOT_DIR = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'snapshot');

const MAX_DEPTH = 4;
const ROOT_ID = 'vivant';
const HORS_ARBRE_ATTENDUES = 3;
const FORBIDDEN_VERBS = /(cueill|goût|gout|touch|frott|manipul|ramass|attrap)/i;
// Variantes du glossaire qui sont des mots courants du français (pas des termes savants) :
// « anneau » est une variante de « métamérie » (avancé) mais reste un mot de tous les jours.
const MOTS_COURANTS = new Set(['anneau', 'segment']);
const LIMITS = { label_simple: 160, attribute_simple: 255, name: 160, shared_attribute: 255 };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadData(dir = DATA_DIR) {
  return {
    arbre: readJson(path.join(dir, 'arbre-college.json')).boites,
    insectes: readJson(path.join(dir, 'clades-insectes.json')).clades,
    deplacements: readJson(path.join(dir, 'deplacements.json')).fiches,
  };
}

function loadSnapshot(dir = SNAPSHOT_DIR) {
  return {
    clades: readJson(path.join(dir, 'clades.json')),
    plants: readJson(path.join(dir, 'plants.json')),
    glossary: readJson(path.join(dir, 'glossary_terms.json')),
  };
}

/** Contrôles typographiques et lexicaux d'un texte destiné aux élèves. */
function checkText(label, text, max) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return [`${label} : texte vide`];
  if (text !== text.trim()) errors.push(`${label} : blancs en bord de texte`);
  if (text.length > max) errors.push(`${label} : ${text.length} caractères (max ${max})`);
  if (text.normalize('NFC') !== text) errors.push(`${label} : texte non normalisé NFC`);
  // NFKC : seules les espaces insécables sont tolérées comme caractères de compatibilité.
  if (text.replace(/[  ]/g, ' ').normalize('NFKC') !== text.replace(/[  ]/g, ' ')) {
    errors.push(`${label} : caractère de compatibilité Unicode (NFKC)`);
  }
  if (/[\u0000-\u001f\u007f]/.test(text)) errors.push(`${label} : caractère de contrôle`);
  if (/\p{Extended_Pictographic}/u.test(text)) errors.push(`${label} : emoji dans un texte`);
  if (FORBIDDEN_VERBS.test(text))
    errors.push(`${label} : verbe interdit (${text.match(FORBIDDEN_VERBS)[0]})`);
  if (/ [;:!?]/.test(text))
    errors.push(`${label} : espace ordinaire avant ; : ! ? (insécable attendue)`);
  if (/[^\s  ][;:!?]/.test(text))
    errors.push(`${label} : espace insécable manquante avant ; : ! ?`);
  if (/«(?![  ])|(?<![  ])»/.test(text)) errors.push(`${label} : guillemets sans insécable`);
  if (/’/.test(text))
    errors.push(`${label} : apostrophe courbe (le corpus des clades emploie l'apostrophe droite)`);
  if (/ {2}/.test(text)) errors.push(`${label} : double espace`);
  return errors;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Index des formes (terme + variantes) des termes du glossaire hors palier `base`. */
function buildNonBaseForms(glossary) {
  const forms = [];
  for (const t of glossary) {
    // Tous statuts confondus (prudent) : seul le palier `base` est libre au collège.
    if (!t || t.niveau === 'base') continue;
    const all = [t.terme, ...String(t.variantes || '').split(',')]
      .map((s) => String(s || '').trim())
      .filter((s) => s.length >= 3 && !MOTS_COURANTS.has(s.toLowerCase()));
    for (const f of all) {
      forms.push({
        terme: t.terme,
        niveau: t.niveau,
        form: f,
        re: new RegExp(`(^|[^\\p{L}])${escapeRegExp(f)}[sx]?($|[^\\p{L}])`, 'iu'),
      });
    }
  }
  return forms;
}

/** Termes hors `base` trouvés dans un texte (formes exactes, insensible à la casse). */
function nonBaseTermsIn(text, forms) {
  const found = new Set();
  for (const f of forms) if (f.re.test(text)) found.add(f.terme.toLowerCase());
  return [...found];
}

/** Clades de l'instantané après application des données D2 (copie en mémoire). */
function applyToSnapshot(snapshot, data) {
  const clades = snapshot.clades.map((c) => ({
    ...c,
    label_simple: null,
    attribute_simple: null,
    visible_college: 0,
  }));
  const byId = new Map(clades.map((c) => [c.id, c]));
  for (const b of data.arbre) {
    const c = byId.get(b.id);
    if (!c) continue;
    c.label_simple = b.label_simple;
    c.attribute_simple = b.attribute_simple;
    c.visible_college = 1;
  }
  for (const n of data.insectes) {
    if (byId.has(n.id) || !byId.has(n.parent_id)) continue;
    const row = {
      id: n.id,
      parent_id: n.parent_id,
      name: n.name,
      shared_attribute: n.shared_attribute,
      description: n.description,
      sort_order: n.sort_order,
      label_simple: null,
      attribute_simple: null,
      visible_college: 0,
    };
    clades.push(row);
    byId.set(n.id, row);
  }
  const plants = snapshot.plants.map((p) => ({ ...p }));
  for (const d of data.deplacements) {
    for (const p of plants) {
      if (p.scientific_name === d.scientific_name && p.clade_id === d.avant && byId.has(d.apres))
        p.clade_id = d.apres;
    }
  }
  return { clades, plants };
}

/** Profondeur d'une boîte visible dans l'arbre réduit (nombre de boîtes visibles de la racine à elle). */
function collegeDepth(byId, id) {
  return ancestorChain(byId, id).filter((n) => Number(n.visible_college) === 1).length;
}

function runChecks({ data = loadData(), snapshot = loadSnapshot() } = {}) {
  const errors = [];
  const snapById = new Map(snapshot.clades.map((c) => [c.id, c]));
  const forms = buildNonBaseForms(snapshot.glossary);

  // 1. Arbre collège : forme, correspondance avec l'instantané, textes, vocabulaire.
  const seen = new Set();
  for (const b of data.arbre) {
    const tag = `boîte ${b.id}`;
    if (seen.has(b.id)) errors.push(`${tag} : doublon`);
    seen.add(b.id);
    const snap = snapById.get(b.id);
    if (!snap) errors.push(`${tag} : absente de l'instantané`);
    else if (snap.name !== b.name)
      errors.push(`${tag} : nom « ${b.name} » ≠ instantané « ${snap.name} »`);
    errors.push(...checkText(`${tag} label_simple`, b.label_simple, LIMITS.label_simple));
    errors.push(
      ...checkText(`${tag} attribute_simple`, b.attribute_simple, LIMITS.attribute_simple),
    );
    const expliques = new Set((b.termes_expliques || []).map((t) => t.toLowerCase()));
    for (const t of nonBaseTermsIn(`${b.label_simple} ${b.attribute_simple}`, forms)) {
      if (!expliques.has(t)) errors.push(`${tag} : terme hors palier « base » non expliqué (${t})`);
    }
    for (const t of expliques) {
      if (!nonBaseTermsIn(`${b.label_simple} ${b.attribute_simple}`, forms).includes(t)) {
        errors.push(`${tag} : termes_expliques mentionne « ${t} », absent du texte`);
      }
    }
    if (expliques.size && !/\(/.test(b.label_simple) && !b.attribute_simple) {
      errors.push(`${tag} : terme savant sans explication dans la boîte`);
    }
  }
  if (!seen.has(ROOT_ID)) errors.push(`la racine ${ROOT_ID} doit être visible`);

  // 2. Ordres d'insectes.
  const orderOf = new Map();
  for (const n of data.insectes) {
    const tag = `clade ${n.id}`;
    if (snapById.has(n.id)) errors.push(`${tag} : identifiant déjà pris dans l'instantané`);
    if (!snapById.has(n.parent_id)) errors.push(`${tag} : parent ${n.parent_id} absent`);
    if (!/^[a-z_]{3,64}$/.test(n.id)) errors.push(`${tag} : identifiant non conforme`);
    if (!Number.isInteger(n.gbif_key) || n.gbif_key <= 0)
      errors.push(`${tag} : clé GBIF manquante`);
    if (!n.latin) errors.push(`${tag} : nom latin manquant`);
    errors.push(...checkText(`${tag} name`, n.name, LIMITS.name));
    errors.push(
      ...checkText(`${tag} shared_attribute`, n.shared_attribute, LIMITS.shared_attribute),
    );
    errors.push(...checkText(`${tag} description`, n.description, 1000));
    orderOf.set(n.id, n.latin);
  }
  for (const d of data.deplacements) {
    const tag = `fiche ${d.scientific_name}`;
    const hits = snapshot.plants.filter((p) => p.scientific_name === d.scientific_name);
    if (hits.length !== 1)
      errors.push(`${tag} : ${hits.length} fiche(s) dans l'instantané (1 attendue)`);
    const p = hits[0];
    if (p && p.clade_id !== d.avant) errors.push(`${tag} : clade ${p.clade_id} ≠ avant ${d.avant}`);
    if (p && p.name !== d.name) errors.push(`${tag} : nom ${p.name} ≠ ${d.name}`);
    if (p && p.taxon_order !== d.taxon_order)
      errors.push(`${tag} : ordre ${p.taxon_order} ≠ ${d.taxon_order}`);
    if (orderOf.get(d.apres) !== d.taxon_order)
      errors.push(`${tag} : clade cible ${d.apres} ne porte pas l'ordre ${d.taxon_order}`);
  }
  const movedNames = new Set(data.deplacements.map((d) => d.scientific_name));
  const orders = new Set(orderOf.values());
  for (const p of snapshot.plants) {
    if (
      orders.has(p.taxon_order) &&
      p.clade_id === 'insectes' &&
      !movedNames.has(p.scientific_name)
    ) {
      errors.push(`fiche ${p.name} (${p.taxon_order}) oubliée sous insectes`);
    }
  }

  // 3. Arbre résultant : groupe d'usage de chaque fiche visible, profondeur.
  const after = applyToSnapshot(snapshot, data);
  const byId = indexClades(after.clades);
  const horsArbre = [];
  const groupes = new Map();
  for (const p of after.plants) {
    if (p.entity_kind === 'ressource') continue;
    if (!p.clade_id) {
      horsArbre.push(p.name);
      continue;
    }
    const g = usageGroupFor(byId, p.clade_id);
    if (!g) errors.push(`fiche ${p.name} : aucun groupe d'usage`);
    else if (g.id === ROOT_ID)
      errors.push(`fiche ${p.name} : groupe d'usage = racine (${p.clade_id})`);
    else groupes.set(g.id, (groupes.get(g.id) || 0) + 1);
  }
  if (horsArbre.length !== HORS_ARBRE_ATTENDUES) {
    errors.push(
      `${horsArbre.length} fiche(s) visibles hors arbre (${HORS_ARBRE_ATTENDUES} attendues) : ${horsArbre.join(', ')}`,
    );
  }
  let maxDepth = 0;
  for (const c of after.clades) {
    if (Number(c.visible_college) !== 1) continue;
    const d = collegeDepth(byId, c.id);
    maxDepth = Math.max(maxDepth, d);
    if (d > MAX_DEPTH) errors.push(`boîte ${c.id} : profondeur ${d} > ${MAX_DEPTH}`);
  }
  for (const n of data.insectes) {
    const c = byId.get(n.id);
    if (c && Number(c.visible_college) === 1)
      errors.push(`clade ${n.id} : ne doit pas être visible au collège`);
  }

  return {
    errors,
    stats: {
      boites: data.arbre.length,
      fiches_visibles: after.plants.filter((p) => p.entity_kind !== 'ressource').length,
      hors_arbre: horsArbre,
      profondeur_max: maxDepth,
      groupes: Object.fromEntries([...groupes.entries()].sort()),
      deplacements: data.deplacements.length,
    },
  };
}

module.exports = {
  loadData,
  loadSnapshot,
  snapshotAvailable,
  checkText,
  buildNonBaseForms,
  nonBaseTermsIn,
  applyToSnapshot,
  collegeDepth,
  runChecks,
  MAX_DEPTH,
  ROOT_ID,
};

if (require.main === module) {
  const { errors, stats } = runChecks();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
  else {
    process.stdout.write(
      `Boîtes visibles : ${stats.boites} ; fiches visibles : ${stats.fiches_visibles} ; profondeur max : ${stats.profondeur_max}\n`,
    );
    process.stdout.write(`Hors arbre : ${stats.hors_arbre.join(', ')}\n`);
  }
  if (errors.length) {
    process.stderr.write(`${errors.length} erreur(s) :\n- ${errors.join('\n- ')}\n`);
    process.exit(1);
  }
  process.stdout.write('Données D2 conformes.\n');
}
