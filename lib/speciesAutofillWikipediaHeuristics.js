'use strict';

/**
 * Heuristiques légères sur l’extrait Wikipedia FR (déjà récupéré par la pré-saisie).
 * Confiance basse : faux positifs possibles (homonymes, tournures ambiguës).
 */

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * @param {string} text — extrait Wikipedia FR (champ description)
 * @returns {{ fields: Record<string, string>, warnings: string[] }}
 */
function extractTraitsFromWikipediaExtract(text) {
  const raw = asTrimmedString(text).replace(/\s+/g, ' ');
  const fields = {};
  const warnings = [];
  if (raw.length < 12) return { fields, warnings };

  let m = raw.match(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\s*°\s*C\b/i);
  if (m) {
    fields.ideal_temperature_c = `${m[1]}-${m[2]} °C`;
  } else {
    m = raw.match(/\b(?:entre|de)\s+(\d{1,3})\s*(?:°\s*C|°C|°)?\s+(?:et|à|a)\s+(\d{1,3})\s*°?\s*C\b/i);
    if (m) fields.ideal_temperature_c = `${m[1]}-${m[2]} °C`;
  }

  m = raw.match(/\bpH\s*(\d{1,2}[,.]?\d*)\s*[-–]\s*(\d{1,2}[,.]?\d*)/i);
  if (m) {
    fields.optimal_ph = `${m[1]}-${m[2]}`;
  }

  m = raw.match(/\b(\d{1,4})\s*(?:à|a|-|–)\s*(\d{1,4})\s*cm\b/i);
  if (m) {
    fields.size = `${m[1]} à ${m[2]} cm`;
  } else {
    m = raw.match(/\bjusqu[''’]\s*à\s*(\d+(?:[,.]\d+)?)\s*m\b/i);
    if (m) fields.size = `jusqu'à ${m[1]} m`;
  }

  const head = raw.slice(0, 240);
  if (/\b(?:plante\s+)?vivace\b/i.test(head) && !/\bnon[-\s]?vivace\b/i.test(head)) {
    fields.longevity = 'Vivace';
  } else if (/\bannuelle\b/i.test(head)) {
    fields.longevity = 'Annuelle';
  } else if (/\bbisannuelle\b/i.test(head)) {
    fields.longevity = 'Bisannuelle';
  }

  if (/\b(?:reproduction|se\s+reproduit)\s+(?:par|au moyen de|grâce à)\s+([^.;]{3,90})/i.test(raw)) {
    const mm = raw.match(/\b(?:reproduction|se\s+reproduit)\s+(?:par|au moyen de|grâce à)\s+([^.;]{3,90})/i);
    if (mm) fields.reproduction = `Reproduction : ${mm[1].trim()} (indice résumé Wikipedia)`;
  } else if (/\bpollini[sz]ation\b/i.test(raw) && raw.length < 2000) {
    fields.reproduction = 'Pollinisation mentionnée (résumé Wikipedia) — à préciser.';
  } else if (/\b(?:graines?|semences?)\b/i.test(head) && /\b(?:dispers|dissémin|germination)\b/i.test(raw.slice(0, 400))) {
    fields.reproduction = 'Reproduction par graines (indice résumé Wikipedia)';
  }

  if (/\b(?:fruits?|feuilles|fleurs|racines|tubercules|bulbes)\s+comestibles?\b/i.test(raw.slice(0, 500))) {
    const mfc = raw.match(/\b(fruits?|feuilles|fleurs|racines|tubercules|bulbes)\s+comestibles?\b/i);
    if (mfc) {
      const part = mfc[1].charAt(0).toUpperCase() + mfc[1].slice(1);
      fields.harvest_part = `${part} (indice résumé Wikipedia)`;
    }
  }

  const plantHints = [];
  if (/\bplein\s+soleil\b/i.test(raw)) plantHints.push('plein soleil');
  if (/\bmi[-\s]?ombre\b/i.test(raw)) plantHints.push('mi-ombre');
  if (/\b(?:semis?|semé|repiquage|plantation)\b/i.test(raw.slice(0, 600))) {
    const sm = raw.match(/\b(semis?[^.;]{0,80}|repiquage[^.;]{0,80}|plantation[^.;]{0,80})/i);
    if (sm) plantHints.push(sm[1].trim());
  }
  if (plantHints.length > 0) {
    fields.planting_recommendations = [...new Set(plantHints)].join(' · ').slice(0, 220);
  }

  if (/\b(?:culture|potager|verger|plante\s+cultivée)\b/i.test(head)) {
    fields.agroecosystem_category = 'Culture (indice résumé Wikipedia)';
  }

  if (Object.keys(fields).length > 0) {
    warnings.push('Résumé Wikipedia : indices automatiques (température, pH, taille, longévité, culture, etc.) — à vérifier.');
  }
  return { fields, warnings };
}

/**
 * @param {string|null|undefined} descriptionFr — champ `fields.description` de la source Wikipedia FR
 * @returns {object|null} — résultat source pour mergeSources, ou null si rien à ajouter
 */
function buildWikipediaHeuristicSource(descriptionFr) {
  const { fields, warnings } = extractTraitsFromWikipediaExtract(descriptionFr);
  if (Object.keys(fields).length === 0) return null;
  return {
    source: 'wikipedia_heuristic',
    confidence: 0.34,
    source_url: null,
    fields,
    photos: [],
    warnings,
  };
}

module.exports = {
  extractTraitsFromWikipediaExtract,
  buildWikipediaHeuristicSource,
};
