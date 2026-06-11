/**
 * Application pure de la pré-saisie biodiversité au formulaire de fiche plante — extraite de
 * `foretmap-views.jsx` (O6).
 */

import { parseLinkCandidates } from './plantFormValues.js';

/**
 * Construit le prochain état du formulaire en appliquant la pré-saisie :
 * - champs texte sélectionnés (`selectedFields`) → écrits si vides, ou si `overwriteFilled` ;
 * - photos cochées (`prefillPhotoSelections`, clé `champ:index`) → réparties par champ cible
 *   (`assignTo` validé contre `photoFieldKeys`, sinon le champ source), fusionnées (dédup) avec
 *   l'existant (ou remplacées si `overwriteFilled`) ; les `source_url` alimentent `sources`.
 * Transformation pure : ne mute pas `prev`.
 *
 * @param {object} prev formulaire courant
 * @param {object} opts { prefillResult, selectedFields, prefillPhotoSelections,
 *   groupedPrefillPhotos, overwriteFilled, speciesPrefillFields, photoFieldKeys }
 */
export function applyPrefillToForm(prev, opts = {}) {
  const {
    prefillResult,
    selectedFields = {},
    prefillPhotoSelections = {},
    groupedPrefillPhotos = {},
    overwriteFilled = false,
    speciesPrefillFields = [],
    photoFieldKeys = new Set(),
  } = opts;

  const next = { ...prev };
  for (const key of speciesPrefillFields) {
    if (!selectedFields[key]) continue;
    const value = String(prefillResult?.fields?.[key] || '').trim();
    if (!value) continue;
    const hasCurrentValue = String(prev?.[key] || '').trim().length > 0;
    if (!hasCurrentValue || overwriteFilled) {
      next[key] = value;
    }
  }

  const mergedSources = parseLinkCandidates(next.sources);
  const picked = [];
  for (const [slotKey, sel] of Object.entries(prefillPhotoSelections || {})) {
    if (!sel?.checked) continue;
    const colon = slotKey.lastIndexOf(':');
    if (colon <= 0) continue;
    const sourceField = slotKey.slice(0, colon);
    const idx = Number(slotKey.slice(colon + 1));
    if (!Number.isFinite(idx)) continue;
    const options = groupedPrefillPhotos[sourceField] || [];
    const selected = options[idx];
    if (!selected?.url) continue;
    const assignTo = photoFieldKeys.has(sel.assignTo) ? sel.assignTo : sourceField;
    picked.push({ assignTo, url: selected.url, source_url: selected.source_url });
  }
  picked.sort((a, b) => a.assignTo.localeCompare(b.assignTo) || String(a.url).localeCompare(String(b.url)));
  const byTarget = new Map();
  for (const row of picked) {
    if (!byTarget.has(row.assignTo)) byTarget.set(row.assignTo, []);
    byTarget.get(row.assignTo).push(row);
  }
  for (const [targetField, rows] of byTarget) {
    const urls = [...new Set(rows.map((r) => r.url).filter(Boolean))];
    if (urls.length === 0) continue;
    const existing = parseLinkCandidates(next[targetField]);
    if (existing.length === 0 || overwriteFilled) {
      next[targetField] = urls.join('\n');
    } else {
      const merged = [...existing];
      for (const u of urls) {
        if (!merged.includes(u)) merged.push(u);
      }
      next[targetField] = merged.join('\n');
    }
    for (const row of rows) {
      if (row.source_url && !mergedSources.includes(row.source_url)) {
        mergedSources.push(row.source_url);
      }
    }
  }
  if (mergedSources.length > 0) {
    next.sources = mergedSources.join('\n');
  }
  return next;
}
