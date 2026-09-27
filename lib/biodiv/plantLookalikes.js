'use strict';

/**
 * Sosies des fiches espèces — table `plant_lookalikes` (migration 305, piste C de l'audit du
 * 25/09/2026, § 1.3.6 et § 2.3) : « ne pas confondre avec… », fiche à fiche, avec une note
 * (le critère qui tranche).
 *
 * Une paire est NON ORIENTÉE : si A ressemble à B, B ressemble à A. Elle est stockée une
 * seule fois, dans l'ordre canonique (`plant_id` < `lookalike_plant_id`) ; la symétrie est
 * tenue ici (écriture et lecture), pas par la base. La contrainte `CHECK (plant_id <
 * lookalike_plant_id)` n'est pas posée : MySQL 8 refuse une contrainte CHECK sur une colonne
 * portant une action de clé étrangère (`ON DELETE CASCADE`).
 *
 * Ces paires complètent le texte libre `lookalike_species` (« Confusions possibles »), qui
 * reste la place d'une ressemblance avec une espèce ABSENTE du catalogue. La ventilation
 * des remarques existantes vers les sosies est un travail éditorial : aucune paire n'est
 * créée automatiquement.
 */

const { asTrimmedString } = require('../shared/stringHelpers');

const MAX_LOOKALIKES_PER_PLANT = 20;
const MAX_LOOKALIKE_NOTE_LENGTH = 500;

/** Paire canonique `[petit id, grand id]`. */
function canonicalPair(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? [x, y] : [y, x];
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Sosies envoyés par un client : `[{ plant_id, note }]`. La fiche elle-même et les doublons
 * sont retirés (le dernier doublon donne la note). Renvoie `{ entries }` ou `{ error }`.
 */
function normalizeClientLookalikes(input, selfId = null) {
  if (!Array.isArray(input)) return { error: 'lookalikes : liste attendue' };
  const self = positiveInt(selfId);
  const byId = new Map();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') return { error: 'lookalikes : entrée invalide' };
    const id = positiveInt(entry.plant_id ?? entry.lookalike_plant_id);
    if (!id) {
      // Ligne en cours de saisie dans le formulaire (aucune fiche choisie) : ignorée.
      if (entry.plant_id == null || entry.plant_id === '') continue;
      return { error: 'lookalikes : identifiant de fiche invalide' };
    }
    if (self && id === self) continue;
    const note = asTrimmedString(entry.note);
    if (note.length > MAX_LOOKALIKE_NOTE_LENGTH) {
      return { error: `Sosies : ${MAX_LOOKALIKE_NOTE_LENGTH} caractères au plus par note` };
    }
    byId.set(id, { plant_id: id, note: note || null });
  }
  const entries = [...byId.values()];
  if (entries.length > MAX_LOOKALIKES_PER_PLANT) {
    return { error: `Sosies : ${MAX_LOOKALIKES_PER_PLANT} au plus par fiche` };
  }
  return { entries };
}

/**
 * Sosies d'une fiche vus depuis elle : `[{ plant_id, name, emoji, note }]`, triés par nom.
 * `rows` : paires qui la concernent, avec l'identité des deux fiches
 * (`plant_id`, `lookalike_plant_id`, `note`, `a_name`, `a_emoji`, `b_name`, `b_emoji`).
 */
function lookalikesForPlant(rows, plantId) {
  const id = Number(plantId);
  const out = [];
  for (const row of rows || []) {
    const a = Number(row.plant_id);
    const b = Number(row.lookalike_plant_id);
    if (a !== id && b !== id) continue;
    const otherIsB = a === id;
    out.push({
      plant_id: otherIsB ? b : a,
      name: (otherIsB ? row.b_name : row.a_name) ?? null,
      emoji: (otherIsB ? row.b_emoji : row.a_emoji) ?? null,
      note: row.note ?? null,
    });
  }
  return out.sort((x, y) =>
    String(x.name || '').localeCompare(String(y.name || ''), 'fr', { sensitivity: 'base' }),
  );
}

module.exports = {
  MAX_LOOKALIKES_PER_PLANT,
  MAX_LOOKALIKE_NOTE_LENGTH,
  canonicalPair,
  normalizeClientLookalikes,
  lookalikesForPlant,
};
