'use strict';

/**
 * « Tenir à deux » v2 — Olu commentateur (spec § 13) : table événement du journal → `moment`
 * des lignes d'Olu (`gl_tenir_olu_lignes`). Servie au client par `GET /tenir/olu` (`moments`),
 * qui tire une ligne par moment et substitue `{equipe}`, `{n}`, `{biome}`. Les lignes
 * `moment = oiseau` se disent après l'animation de l'oiseau ; Olu se fige pendant.
 */

const EVENT_MOMENTS = Object.freeze({
  tour_ouvert: 'ouverture',
  dice_roll: 'jet',
  avance_libre: 'jet',
  relance_bonus: 'question',
  qcm_answer: 'question',
  fouille: 'fouille',
  page_trouvee: 'fouille',
  page_reparee: 'fouille',
  page_revelee: 'fouille',
  page_lue: 'tenir',
  page_tenue: 'tenir',
  carnet_complet: 'tenir',
  voile_avance: 'voile',
  voile_dort: 'voile',
  voile_recul: 'voile',
  spell_cast: 'sort',
  spell_effect: 'sort',
  spell_file: 'sort',
  seuil_clos: 'seuil',
  honneur: 'seuil',
  peripetie: 'peripetie',
  chimere_validee: 'bestiaire',
  chapardeur: 'oiseau',
  nid_rendu: 'oiseau',
});

/** Moment d'un type d'événement, ou `null` (Olu se tait). */
function momentForEvent(eventType) {
  return EVENT_MOMENTS[String(eventType || '')] || null;
}

/** Substitue `{equipe}`, `{n}`, `{biome}` (pur, partagé avec le client via `moments`). */
function renderOluLine(texte, vars = {}) {
  return String(texte || '').replace(/\{(equipe|n|biome)\}/g, (m, key) =>
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : m,
  );
}

module.exports = { EVENT_MOMENTS, momentForEvent, renderOluLine };
