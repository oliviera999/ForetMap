#!/usr/bin/env node
'use strict';

/**
 * Contrôle des fichiers de données D1 du chantier collège (`data/college-2026-11/d1/*.json`).
 *
 *   node scripts/college-2026-11/check-d1-donnees.js
 *
 * Vérifie, sans base de données :
 *   - la structure de chaque fichier (champs attendus, valeurs avant ≠ après, niveaux connus) ;
 *   - les textes nouveaux (définitions, étapes de séance) : longueur, forme normalisée (NFC, et
 *     NFKC hors espace insécable, « n³ » et « … »), aucun emoji, aucun verbe d'action sur le vivant interdit
 *     (tronc commun § 1.8), typographie française (espace insécable avant ; : ! ? et à
 *     l'intérieur des guillemets) ;
 *   - que la règle d'emoji ne se contredit pas : aucune correction ne pose un emoji que la
 *     table de règles refuserait pour le groupe de la fiche ;
 *   - si l'instantané de coordination est présent (il est supprimé par SI), que les valeurs
 *     « avant » sont bien celles de l'instantané et qu'après correction plus aucune des
 *     644 fiches visibles ne porte un emoji d'un autre groupe.
 *
 * Code de sortie 1 au premier défaut trouvé (liste complète affichée).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'd1');
const SNAPSHOT_DIR = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'snapshot');

const NIVEAUX = ['base', 'approfondissement', 'avance'];
const VERBES_INTERDITS = /cueill|go[uû]t|touch|frott|manipul|ramass|attrap/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const errors = [];
const err = (msg) => errors.push(msg);

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

/**
 * Fiches dont l'emoji figure dans la table de règles sans que la fiche appartienne à l'un des
 * groupes admis pour lui (ressources exclues : elles ne sont pas des êtres vivants). Seuls les
 * rangs renseignés sur la fiche se comparent.
 */
function emojiViolations(plants, regles) {
  const byEmoji = new Map(regles.map((r) => [r.emoji, r]));
  return plants
    .filter((p) => p.entity_kind !== 'ressource')
    .map((p) => ({ p, r: byEmoji.get(p.emoji) }))
    .filter(({ p, r }) => {
      if (!r) return false;
      const connus = Object.keys(r.admis).filter((k) => p[k] != null);
      return connus.length > 0 && !connus.some((k) => r.admis[k].includes(p[k]));
    })
    .map(({ p, r }) => ({ name: p.name, emoji: p.emoji, represente: r.represente }));
}

function checkText(label, text, maxLen) {
  if (typeof text !== 'string' || !text.trim()) return err(`${label} : texte vide`);
  if (text.length > maxLen) err(`${label} : ${text.length} caractères (> ${maxLen})`);
  if (text !== text.normalize('NFC')) err(`${label} : texte non normalisé (NFC)`);
  // Admis malgré NFKC : espace insécable, « n³ » (nom du lieu) et points de suspension.
  const reduit = text.replace(/[\u00a0\u00b3\u2026]/g, ' ');
  if (reduit !== reduit.normalize('NFKC')) err(`${label} : caractère de compatibilité (NFKC)`);
  if (EMOJI.test(text)) err(`${label} : emoji dans un texte`);
  if (VERBES_INTERDITS.test(text)) err(`${label} : verbe d'action sur le vivant interdit`);
  if (/[  ][;:!?]/.test(text)) err(`${label} : espace ordinaire avant ; : ! ?`);
  if (/[^\s («][;!?]/u.test(text)) err(`${label} : ponctuation haute sans espace insécable`);
  if (/«(?! )/.test(text) || /(?<! )»/.test(text)) {
    err(`${label} : guillemets sans espace insécable intérieure`);
  }
  if (/ {2,}/.test(text)) err(`${label} : espaces doublées`);
}

function checkEmoji(doc) {
  if (!Array.isArray(doc.regles) || !doc.regles.length) err('emoji : règles absentes');
  const vus = new Set();
  for (const c of doc.corrections) {
    const label = `emoji « ${c.name} »`;
    if (vus.has(c.name)) err(`${label} : doublon`);
    vus.add(c.name);
    if (!c.avant || !c.apres || c.avant === c.apres) err(`${label} : avant/après invalides`);
    if (!EMOJI.test(c.apres)) err(`${label} : « ${c.apres} » n'est pas un emoji`);
    if (!c.motif) err(`${label} : motif manquant`);
    if (!['audit', 'revue'].includes(c.origine)) err(`${label} : origine inconnue`);
  }
  return vus;
}

function checkGlossaryLevels(doc) {
  const codes = new Set();
  for (const c of doc.changements) {
    const label = `niveau ${c.glossary_code} « ${c.terme} »`;
    if (codes.has(c.glossary_code)) err(`${label} : doublon`);
    codes.add(c.glossary_code);
    if (!NIVEAUX.includes(c.avant) || !NIVEAUX.includes(c.apres)) err(`${label} : niveau inconnu`);
    if (c.avant === c.apres) err(`${label} : niveau inchangé`);
    if (!c.motif) err(`${label} : motif manquant`);
    if (!['consigne', 'revue'].includes(c.origine)) err(`${label} : origine inconnue`);
  }
  for (const m of doc.maintenus_avance) {
    if (codes.has(m.glossary_code)) err(`maintenu ${m.glossary_code} : aussi dans les changements`);
    if (!m.motif) err(`maintenu ${m.glossary_code} : motif manquant`);
  }
}

function checkGlossaryContent(doc) {
  for (const c of doc.categorie) {
    if (c.avant === c.apres) err(`catégorie ${c.glossary_code} : inchangée`);
  }
  for (const d of doc.definitions) {
    const label = `définition ${c(d)}`;
    if (!d.apres.startsWith(d.avant.split('. ')[0])) err(`${label} : la première phrase a changé`);
    checkText(label, d.apres, 1200);
  }
  function c(d) {
    return `${d.glossary_code} « ${d.terme} »`;
  }
}

function checkSessions(doc) {
  for (const e of doc.etapes) {
    const label = `séance ${e.slug} · ${e.step_id}`;
    if (!['modifier', 'inserer'].includes(e.operation)) err(`${label} : opération inconnue`);
    if (e.apres.title != null) checkText(`${label} (titre)`, e.apres.title, 180);
    if (e.apres.body != null) checkText(`${label} (texte)`, e.apres.body, 4000);
    if (e.operation === 'modifier' && e.avant.title == null)
      err(`${label} : garde de titre absente`);
    if (e.operation === 'modifier' && e.avant.body == null)
      err(`${label} : garde de texte absente`);
    for (const value of Object.values(e.apres.payload || {})) {
      if (value && typeof value === 'object' && !value.plante?.name)
        err(`${label} : espèce sans nom`);
    }
  }
}

function checkAgainstSnapshot(emojiDoc, niveaux, contenu, cartes, seances) {
  const snap = (name) => JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, name), 'utf8'));
  const plants = snap('plants.json');
  const byName = new Map(plants.map((p) => [p.name, p]));
  for (const c of emojiDoc.corrections) {
    const p = byName.get(c.name);
    if (!p && c.absente_de_la_production) continue;
    if (!p) err(`instantané : fiche « ${c.name} » absente`);
    else if (p.emoji !== c.avant)
      err(`instantané : « ${c.name} » porte ${p.emoji}, pas ${c.avant}`);
  }
  const corrected = plants.map((p) => {
    const fix = emojiDoc.corrections.find((c) => c.name === p.name);
    return fix ? { ...p, emoji: fix.apres } : p;
  });
  for (const v of emojiViolations(corrected, emojiDoc.regles)) {
    err(`instantané, après correction : ${v.name} (${v.emoji}) hors de « ${v.represente} »`);
  }
  const terms = new Map(snap('glossary_terms.json').map((t) => [t.glossary_code, t]));
  for (const c of niveaux.changements) {
    const t = terms.get(c.glossary_code);
    if (!t || t.terme !== c.terme || t.niveau !== c.avant)
      err(`instantané : niveau ${c.glossary_code}`);
  }
  for (const c of [...contenu.categorie, ...contenu.definitions]) {
    const t = terms.get(c.glossary_code);
    if (!t || t[c.champ] !== c.avant) err(`instantané : ${c.champ} ${c.glossary_code}`);
  }
  const maps = new Map(snap('maps.json').map((m) => [m.id, m]));
  for (const c of cartes.changements) {
    if (maps.get(c.map_id)?.[c.champ] !== c.avant) err(`instantané : carte ${c.map_id}`);
  }
  const sessions = new Map(snap('pedago_sessions.json').map((s) => [s.slug, s]));
  for (const e of seances.etapes) {
    const steps = JSON.parse(sessions.get(e.slug)?.steps_json || '[]');
    if (e.operation === 'inserer') {
      if (steps.length !== e.avant.nb_etapes)
        err(`instantané : ${e.slug} n'a pas ${e.avant.nb_etapes} étapes`);
      continue;
    }
    const s = steps[e.index];
    if (!s || s.id !== e.step_id || s.title !== e.avant.title || s.body !== e.avant.body) {
      err(`instantané : étape ${e.slug} · ${e.step_id} différente de la garde`);
    }
  }
}

function main() {
  const emojiDoc = read('emoji.json');
  const niveaux = read('glossaire-niveaux.json');
  const contenu = read('glossaire-contenu.json');
  const cartes = read('cartes.json');
  const seances = read('seances.json');
  checkEmoji(emojiDoc);
  checkGlossaryLevels(niveaux);
  checkGlossaryContent(contenu);
  checkSessions(seances);
  const withSnapshot = fs.existsSync(path.join(SNAPSHOT_DIR, 'plants.json'));
  if (withSnapshot) checkAgainstSnapshot(emojiDoc, niveaux, contenu, cartes, seances);
  if (errors.length) {
    console.error(`[d1] ${errors.length} défaut(s) :\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(
    `[d1] données conformes : ${emojiDoc.corrections.length} emoji, ${niveaux.changements.length} niveaux, ` +
      `${contenu.categorie.length + contenu.definitions.length} contenus de glossaire, ` +
      `${cartes.changements.length} carte, ${seances.etapes.length} étapes de séance` +
      (withSnapshot
        ? ' (comparées à l’instantané).'
        : ' (instantané absent : comparaison sautée).'),
  );
}

main();
