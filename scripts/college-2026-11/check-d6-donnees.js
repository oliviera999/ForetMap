#!/usr/bin/env node
'use strict';

/**
 * Contrôle des fichiers de données du flux D6 (chantier collège, novembre 2026) :
 * espèces phares par carte (`map_species.is_featured`) et descriptions collège
 * (`plants.description_college`).
 *
 *   node scripts/college-2026-11/check-d6-donnees.js
 *
 * Sortie 0 si tout passe, 1 sinon (liste des manquements). Utilisé aussi par
 * `tests/content/college-d6-especes-phares.test.js`.
 *
 * Les contrôles croisés avec l'instantané de production (existence de la fiche et de la
 * présence, dangerosité, groupes) ne tournent que si le dossier
 * `docs/coordination/college-2026-11/snapshot/` est présent (SI le supprime avant `main`).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'd6');
const SNAPSHOT_DIR = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'snapshot');

const MIN_PAR_CARTE = 12;
const MAX_PAR_CARTE = 20;
/** Cartes à petit registre : on garde celles qui remplissent les critères, sans minimum. */
const CARTES_SANS_MINIMUM = new Set(['beaulieu']);
const MAX_MOTS = 35;
const VERBES_INTERDITS = /cueill|go[uû]t|touch|frott|manipul|ramass|attrap/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const TOXICITES_EXCLUES = new Set(['toxique', 'mortel']);
const GROUPES_PLANTES =
  /^(Angiosperme|Gymnosperme|Fougères|Chlorophytes|Rhodophytes|Phéophycées|Lichens|Mousses)/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadData() {
  return {
    phares: readJson(path.join(DATA_DIR, 'especes-phares.json')),
    descriptions: readJson(path.join(DATA_DIR, 'descriptions-college.json')),
  };
}

function loadSnapshot() {
  if (!fs.existsSync(path.join(SNAPSHOT_DIR, 'plants.json'))) return null;
  return {
    plants: readJson(path.join(SNAPSHOT_DIR, 'plants.json')),
    mapSpecies: readJson(path.join(SNAPSHOT_DIR, 'map_species.json')),
  };
}

const keyOf = (e) => `${e.name}\u0000${e.scientific_name ?? ''}`;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(text) {
  return text
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«])/u)
    .filter(Boolean).length;
}

/** Manquements de rédaction d'un texte destiné à tout le collège (règles § 1.8). */
function checkTexte(label, text) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return [`${label} : texte vide`];
  if (text !== text.normalize('NFKC')) errors.push(`${label} : caractères non NFKC`);
  if (text !== text.trim()) errors.push(`${label} : espaces en bord de texte`);
  if (/ {2,}/.test(text)) errors.push(`${label} : espaces doubles`);
  if (/\s[,.]/.test(text)) errors.push(`${label} : espace avant une virgule ou un point`);
  if (/[^  ][;:!?]/.test(text)) {
    errors.push(`${label} : espace insécable manquante avant ; : ! ?`);
  }
  if (/["’]/.test(text)) errors.push(`${label} : guillemet droit ou apostrophe courbe`);
  if (EMOJI.test(text)) errors.push(`${label} : emoji dans le texte`);
  if (VERBES_INTERDITS.test(text)) errors.push(`${label} : verbe interdit (§ 1.8)`);
  if (!/^[A-ZÀ-ÖØ-Þ]/u.test(text)) errors.push(`${label} : ne commence pas par une majuscule`);
  if (!/\.$/.test(text)) errors.push(`${label} : ne finit pas par un point`);
  const mots = countWords(text);
  if (mots > MAX_MOTS) errors.push(`${label} : ${mots} mots (max ${MAX_MOTS})`);
  const phrases = countSentences(text);
  if (phrases !== 2) errors.push(`${label} : ${phrases} phrase(s) au lieu de 2`);
  return errors;
}

function checkD6({ data = loadData(), snapshot = loadSnapshot() } = {}) {
  const errors = [];
  const { phares, descriptions } = data;
  const cartes = phares.cartes || {};
  const descs = descriptions.especes || [];

  const descByKey = new Map();
  for (const d of descs) {
    const k = keyOf(d);
    if (descByKey.has(k)) errors.push(`description en double : ${d.name}`);
    descByKey.set(k, d);
    errors.push(...checkTexte(`description « ${d.name} »`, d.description_college));
    if (!d.pourquoi || !String(d.pourquoi).trim()) errors.push(`justification vide : ${d.name}`);
  }

  const pharesKeys = new Set();
  for (const [mapId, liste] of Object.entries(cartes)) {
    const n = liste.length;
    if (n > MAX_PAR_CARTE) errors.push(`${mapId} : ${n} espèces phares (max ${MAX_PAR_CARTE})`);
    if (n < MIN_PAR_CARTE && !CARTES_SANS_MINIMUM.has(mapId)) {
      errors.push(`${mapId} : ${n} espèces phares (min ${MIN_PAR_CARTE})`);
    }
    if (n === 0) errors.push(`${mapId} : aucune espèce phare`);
    const vus = new Set();
    for (const e of liste) {
      const k = keyOf(e);
      if (vus.has(k)) errors.push(`${mapId} : ${e.name} en double`);
      vus.add(k);
      pharesKeys.add(k);
      if (!descByKey.has(k)) errors.push(`${mapId} : ${e.name} sans description collège`);
    }
  }
  for (const d of descs) {
    if (!pharesKeys.has(keyOf(d))) errors.push(`description hors espèces phares : ${d.name}`);
  }

  if (snapshot) {
    const plantsByKey = new Map();
    for (const p of snapshot.plants) {
      const k = keyOf(p);
      plantsByKey.set(k, plantsByKey.has(k) ? null : p);
    }
    const presence = new Set(snapshot.mapSpecies.map((m) => `${m.map_id}#${m.plant_id}`));
    for (const [mapId, liste] of Object.entries(cartes)) {
      let plantes = 0;
      let insectes = 0;
      for (const e of liste) {
        const p = plantsByKey.get(keyOf(e));
        if (p === undefined) {
          errors.push(`${mapId} : ${e.name} absente de l'instantané (nom + nom scientifique)`);
          continue;
        }
        if (p === null) {
          errors.push(`${mapId} : ${e.name} ambiguë (plusieurs fiches de même clé)`);
          continue;
        }
        if (!presence.has(`${mapId}#${p.id}`)) {
          errors.push(`${mapId} : ${e.name} absente du registre de la carte`);
        }
        if (p.entity_kind === 'ressource') errors.push(`${mapId} : ${e.name} est une ressource`);
        if (TOXICITES_EXCLUES.has(p.toxicity_level)) {
          errors.push(`${mapId} : ${e.name} dangereuse (${p.toxicity_level})`);
        }
        if (p.toxicity_level && p.toxicity_level !== 'aucune' && !Number(p.hazard_reviewed)) {
          errors.push(`${mapId} : ${e.name} dangereuse sans mention de danger relue`);
        }
        if (GROUPES_PLANTES.test(p.taxon_group || '')) plantes += 1;
        if (p.taxon_group === 'Insectes') insectes += 1;
      }
      if (!CARTES_SANS_MINIMUM.has(mapId)) {
        if (!plantes) errors.push(`${mapId} : aucune plante ni algue parmi les espèces phares`);
        if (!insectes) errors.push(`${mapId} : aucun insecte parmi les espèces phares`);
      }
    }
  }
  return errors;
}

module.exports = {
  checkD6,
  checkTexte,
  countWords,
  countSentences,
  loadData,
  loadSnapshot,
  keyOf,
  MIN_PAR_CARTE,
  MAX_PAR_CARTE,
  MAX_MOTS,
};

if (require.main === module) {
  const errors = checkD6();
  if (errors.length) {
    console.error(`D6 : ${errors.length} manquement(s)`);
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }
  const { phares, descriptions } = loadData();
  const n = Object.values(phares.cartes).reduce((s, l) => s + l.length, 0);
  console.log(
    `D6 : données conformes (${n} lignes phares, ${descriptions.especes.length} descriptions` +
      `${loadSnapshot() ? ', contrôles instantané compris' : ', instantané absent'}).`,
  );
}
