#!/usr/bin/env node
'use strict';

/**
 * Contrôle du fichier de données du flux D4 (chantier collège, novembre 2026) : versions
 * courtes de cinq clés de détermination et clé collège des oiseaux d'eau de la daya.
 *
 *   node scripts/college-2026-11/check-d4-donnees.js
 *
 * Sortie 0 si tout passe, 1 sinon (liste des manquements). Utilisé aussi par
 * `tests/content/college-d4-cles-courtes.test.js` et par le générateur de migration.
 *
 * Contrôles :
 * - forme des clés : 6 à 8 couplets numérotés sans trou, au moins deux propositions par couplet,
 *   tous les couplets atteignables depuis le n° 1, aucun cycle, une seule issue par proposition,
 *   « Pour aller plus loin » seulement sur un résultat, jamais de nom de groupe sur un clade
 *   (contrainte `chk_idkey_lead_outcome`), espèce atteinte une seule fois (sauf clé à chemins
 *   multiples voulus) ;
 * - rédaction (tronc commun § 1.8) : propositions de 15 mots au plus, verbes de manipulation
 *   interdits, typographie française (espace insécable avant `; : ! ?` et dans « »),
 *   caractères normalisés, aucun emoji ;
 * - croisement avec l'instantané de production (s'il est présent : SI le supprime avant
 *   `main`) : espèce existante et unique, présente sur la carte de la clé (ou sur au moins une
 *   carte pour une clé générale), clade, carte et clés de renvoi existantes et publiées.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_FILE = path.join(ROOT, 'data', 'college-2026-11', 'd4', 'cles-courtes.json');
const SNAPSHOT_DIR = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'snapshot');

const MIN_COUPLETS = 6;
const MAX_COUPLETS = 8;
const MAX_MOTS_PROPOSITION = 15;
const MAX_RESULT_LABEL = 160;
const OUTILS = new Set(['loupe', 'boite_loupe', 'jumelles']);
/** Verbes de manipulation (tronc commun § 1.8) et filtre anti-manipulation des clés (D4 § 3). */
const VERBES_INTERDITS = /cueill|go[uû]t|touch|frott|froiss|manipul|ramass|attrap|caress|saisis/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const ISSUES = ['couplet', 'espece', 'groupe', 'clade'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadData() {
  return readJson(DATA_FILE);
}

function loadSnapshot() {
  if (!fs.existsSync(path.join(SNAPSHOT_DIR, 'plants.json'))) return null;
  const r = (f) => readJson(path.join(SNAPSHOT_DIR, f));
  return {
    plants: r('plants.json'),
    mapSpecies: r('map_species.json'),
    clades: r('clades.json'),
    maps: r('maps.json'),
    idKeys: r('id_keys.json'),
    couplets: r('id_key_couplets.json'),
    leads: r('id_key_leads.json'),
    leadPlants: r('id_key_lead_plants.json'),
    zones: r('zones.json'),
    zoneSpecies: r('zone_species.json'),
  };
}

const plantKey = (p) => `${p.name}\u0000${p.scientific_name ?? ''}`;

/** Mots d'une proposition : groupes séparés par des blancs et contenant une lettre ou un chiffre. */
function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/u)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Issue d'une proposition, d'après le champ renseigné. */
function issueOf(lead) {
  const present = ISSUES.filter((k) => lead[k] != null);
  return present.length === 1 ? present[0] : null;
}

/** Manquements de rédaction d'un texte. `phrase` : commence par une majuscule, finit par un point. */
function checkTexte(label, text, { phrase = true } = {}) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return [`${label} : texte vide`];
  // Normalisation : NFKC, en admettant les espaces insécables (U+00A0, U+202F) de la typographie
  // et l'exposant de « n³ », nom propre d'un site.
  const sansInsecables = text.replace(/[\u00a0\u202f]/g, ' ').replace(/n³/g, 'n');
  if (sansInsecables !== sansInsecables.normalize('NFKC')) {
    errors.push(`${label} : caractères non normalisés (NFKC)`);
  }
  if (text !== text.trim()) errors.push(`${label} : espaces en bord de texte`);
  if (/[ \u00a0]{2,}/.test(text)) errors.push(`${label} : espaces doubles`);
  if (/\s[,.]/u.test(text)) errors.push(`${label} : espace avant une virgule ou un point`);
  if (/(^|[^\u00a0\u202f])[;:!?]/u.test(text)) {
    errors.push(`${label} : espace insécable manquante avant ; : ! ?`);
  }
  if (/«(?![\u00a0\u202f])|(?<![\u00a0\u202f])»/u.test(text)) {
    errors.push(`${label} : espace insécable manquante dans les guillemets « »`);
  }
  if (/["’‘]/.test(text)) errors.push(`${label} : guillemet droit ou apostrophe courbe`);
  if (EMOJI.test(text)) errors.push(`${label} : emoji dans le texte`);
  const interdit = text.match(VERBES_INTERDITS);
  if (interdit) errors.push(`${label} : verbe interdit « ${interdit[0]} » (§ 1.8)`);
  if (phrase) {
    if (!/^[\p{Lu}0-9]/u.test(text)) errors.push(`${label} : ne commence pas par une majuscule`);
    if (!/[.?!]$/.test(text)) errors.push(`${label} : ne finit pas par un point`);
  }
  return errors;
}

function checkCle(cle, { snapshot, slugsData }) {
  const errors = [];
  const nom = cle.slug || '(sans slug)';
  const err = (m) => errors.push(`${nom} : ${m}`);

  if (!/^[a-z0-9-]+$/.test(cle.slug || '')) err('slug invalide');
  if (!cle.full_key_slug) err('clé complète (full_key_slug) manquante');
  if (cle.full_key_slug === cle.slug) err('la version courte porte le slug de la clé complète');
  for (const [champ, opts] of [
    ['title', { phrase: false }],
    ['description', {}],
    ['scope_label', { phrase: false }],
    ['safety_note', {}],
  ]) {
    errors.push(...checkTexte(`${nom} · ${champ}`, cle[champ], opts));
  }
  if (cle.tool_required != null) {
    for (const t of String(cle.tool_required).split(',')) {
      if (!OUTILS.has(t)) err(`matériel inconnu « ${t} »`);
    }
  }
  if (![0, 1].includes(cle.allows_multiple_paths)) err('allows_multiple_paths doit valoir 0 ou 1');

  const couplets = Array.isArray(cle.couplets) ? cle.couplets : [];
  if (couplets.length < MIN_COUPLETS || couplets.length > MAX_COUPLETS) {
    err(`${couplets.length} couplets (attendu ${MIN_COUPLETS} à ${MAX_COUPLETS})`);
  }
  const numbers = couplets.map((c) => c.number);
  const attendus = couplets.map((_, i) => i + 1);
  if (JSON.stringify(numbers) !== JSON.stringify(attendus)) {
    err(`couplets numérotés ${numbers.join(',')} au lieu de 1…${couplets.length}`);
  }
  const known = new Set(numbers);

  // Graphe des couplets : atteignabilité et absence de cycle.
  const edges = new Map(couplets.map((c) => [c.number, []]));
  const especesAtteintes = new Map();
  for (const c of couplets) {
    const leads = Array.isArray(c.leads) ? c.leads : [];
    if (leads.length < 2) err(`couplet ${c.number} : ${leads.length} proposition(s)`);
    leads.forEach((l, i) => {
      const where = `couplet ${c.number}, proposition ${i + 1}`;
      errors.push(...checkTexte(`${nom} · ${where}`, l.statement));
      const mots = countWords(l.statement || '');
      if (mots > MAX_MOTS_PROPOSITION) {
        err(`${where} : ${mots} mots (max ${MAX_MOTS_PROPOSITION})`);
      }
      if (l.hint != null) errors.push(...checkTexte(`${nom} · ${where} · aide`, l.hint));
      const issue = issueOf(l);
      if (!issue) {
        err(`${where} : il faut exactement une issue (couplet, espèce, groupe ou clade)`);
        return;
      }
      if (issue === 'couplet') {
        if (!known.has(l.couplet)) err(`${where} : renvoi vers le couplet ${l.couplet} absent`);
        else edges.get(c.number).push(l.couplet);
        if (l.next_key != null) err(`${where} : « Pour aller plus loin » sur un renvoi de couplet`);
      }
      if (issue === 'espece') {
        const k = plantKey(l.espece);
        especesAtteintes.set(k, (especesAtteintes.get(k) || 0) + 1);
      }
      if (issue === 'groupe') {
        const g = l.groupe;
        errors.push(...checkTexte(`${nom} · ${where} · nom du groupe`, g.label, { phrase: false }));
        if (String(g.label || '').length > MAX_RESULT_LABEL)
          err(`${where} : nom de groupe trop long`);
        if (!Array.isArray(g.plants) || g.plants.length === 0) err(`${where} : groupe sans espèce`);
        const vus = new Set();
        for (const p of g.plants || []) {
          if (vus.has(plantKey(p))) err(`${where} : ${p.name} en double dans le groupe`);
          vus.add(plantKey(p));
        }
      }
      if (issue === 'clade') {
        // chk_idkey_lead_outcome : jamais de result_label sur un outcome = 'clade'.
        if (l.result_label != null || l.groupe != null)
          err(`${where} : nom de groupe sur un clade`);
        if (typeof l.clade !== 'string' || !l.clade) err(`${where} : clade manquant`);
      }
    });
  }
  if (Number(cle.allows_multiple_paths) !== 1) {
    for (const [k, n] of especesAtteintes) {
      if (n > 1) err(`espèce ${k.split('\u0000')[0]} atteinte par ${n} feuilles`);
    }
  }
  const seen = new Set();
  const stack = [1];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(edges.get(n) || []));
  }
  for (const n of numbers) if (!seen.has(n)) err(`couplet ${n} inatteignable`);
  const state = new Map();
  const cyclic = (n) => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of edges.get(n) || []) if (cyclic(m)) return true;
    state.set(n, 2);
    return false;
  };
  if (numbers.some((n) => cyclic(n))) err('cycle entre couplets');

  // Résultats : renvoi « Pour aller plus loin » (par défaut la clé complète).
  for (const c of couplets) {
    for (const l of c.leads || []) {
      const nk = l.next_key ?? cle.full_key_slug;
      if (issueOf(l) !== 'couplet' && slugsData.has(nk)) {
        err(`couplet ${c.number} : « Pour aller plus loin » vers une autre clé courte (${nk})`);
      }
    }
  }

  if (snapshot) errors.push(...checkContreInstantane(cle, snapshot).map((m) => `${nom} : ${m}`));
  return errors;
}

/** Espèces atteintes par une clé (espèces uniques et membres des groupes). */
function speciesOf(cle) {
  const out = [];
  for (const c of cle.couplets || []) {
    for (const l of c.leads || []) {
      if (l.espece) out.push(l.espece);
      if (l.groupe) out.push(...(l.groupe.plants || []));
    }
  }
  return out;
}

/** Clades et clés de renvoi utilisés par une clé. */
function refsOf(cle) {
  const clades = new Set();
  const nextKeys = new Set([cle.full_key_slug]);
  for (const c of cle.couplets || []) {
    for (const l of c.leads || []) {
      if (l.clade) clades.add(l.clade);
      if (l.groupe?.clade) clades.add(l.groupe.clade);
      if (l.next_key) nextKeys.add(l.next_key);
    }
  }
  return { clades: [...clades], nextKeys: [...nextKeys] };
}

/** Cartes où une fiche est présente : registre (`map_species`) ou zone (`zone_species`). */
function mapsOf(snap, plantId) {
  const out = new Set(snap.mapSpecies.filter((m) => m.plant_id === plantId).map((m) => m.map_id));
  for (const zs of snap.zoneSpecies) {
    if (zs.plant_id !== plantId) continue;
    const z = snap.zones.find((x) => x.id === zs.zone_id);
    if (z) out.add(z.map_id);
  }
  return out;
}

/** Fiches atteintes par une clé de l'instantané (feuilles et membres des groupes). */
function fullKeyPlants(snap, slug) {
  const key = snap.idKeys.find((k) => k.slug === slug);
  if (!key) return new Set();
  const couplets = new Set(snap.couplets.filter((c) => c.key_id === key.id).map((c) => c.id));
  const leads = snap.leads.filter((l) => couplets.has(l.couplet_id));
  const leadIds = new Set(leads.map((l) => l.id));
  const out = new Set(leads.filter((l) => l.plant_id != null).map((l) => l.plant_id));
  for (const lp of snap.leadPlants) if (leadIds.has(lp.lead_id)) out.add(lp.plant_id);
  return out;
}

function checkContreInstantane(cle, snap) {
  const errors = [];
  const byKey = new Map();
  for (const p of snap.plants) {
    const k = plantKey(p);
    byKey.set(k, [...(byKey.get(k) || []), p]);
  }
  if (cle.map_id != null && !snap.maps.some((m) => m.id === cle.map_id)) {
    errors.push(`carte ${cle.map_id} absente`);
  }
  if (snap.idKeys.some((k) => k.slug === cle.slug)) errors.push('slug déjà pris en production');
  for (const sp of speciesOf(cle)) {
    const found = byKey.get(plantKey(sp)) || [];
    if (found.length !== 1) {
      errors.push(`espèce « ${sp.name} » (${sp.scientific_name}) : ${found.length} fiche(s)`);
      continue;
    }
    const p = found[0];
    if (p.entity_kind === 'ressource') {
      errors.push(`« ${sp.name} » est une fiche de ressource, pas un être vivant`);
    }
    const maps = mapsOf(snap, p.id);
    // Clé générale (sans carte) : présente sur au moins une carte, ou déjà atteinte par la clé
    // complète (registre incomplet : les arbres du lycée n'y sont pas tous, voir la revue).
    const ok =
      cle.map_id == null
        ? maps.size > 0 || fullKeyPlants(snap, cle.full_key_slug).has(p.id)
        : maps.has(cle.map_id);
    if (!ok) {
      errors.push(`« ${sp.name} » absente de la carte ${cle.map_id ?? '(aucune carte)'}`);
    }
  }
  const { clades, nextKeys } = refsOf(cle);
  for (const id of clades) {
    if (!snap.clades.some((c) => c.id === id)) errors.push(`clade ${id} absent`);
  }
  for (const slug of nextKeys) {
    const k = snap.idKeys.find((x) => x.slug === slug);
    if (!k) errors.push(`clé de renvoi ${slug} absente`);
    else if (Number(k.is_published) !== 1) errors.push(`clé de renvoi ${slug} non publiée`);
  }
  return errors;
}

function checkD4({ data = loadData(), snapshot = loadSnapshot() } = {}) {
  const errors = [];
  const cles = Array.isArray(data.cles) ? data.cles : [];
  const slugs = cles.map((c) => c.slug);
  if (new Set(slugs).size !== slugs.length) errors.push('slug de clé en double');
  const slugsData = new Set(slugs);
  for (const cle of cles) errors.push(...checkCle(cle, { snapshot, slugsData }));
  return errors;
}

module.exports = {
  checkD4,
  loadData,
  loadSnapshot,
  countWords,
  issueOf,
  speciesOf,
  refsOf,
  plantKey,
  mapsOf,
  fullKeyPlants,
  DATA_FILE,
  MIN_COUPLETS,
  MAX_COUPLETS,
  MAX_MOTS_PROPOSITION,
  VERBES_INTERDITS,
};

if (require.main === module) {
  const errors = checkD4();
  if (errors.length) {
    console.error(`${errors.length} manquement(s) :`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log('Données D4 conformes.');
}
