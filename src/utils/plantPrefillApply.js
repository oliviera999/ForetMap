/**
 * Application pure de la pré-saisie biodiversité au formulaire de fiche plante — extraite de
 * `foretmap-views.jsx` (O6).
 */

import { parseLinkCandidates } from './plantFormValues.js';
import { addFormPhoto } from './plantPhotos.js';

/**
 * Construit le prochain état du formulaire en appliquant la pré-saisie :
 * - champs texte sélectionnés (`selectedFields`) → écrits si vides, ou si `overwriteFilled` ;
 * - photos cochées (`prefillPhotoSelections`, clé `champ:index`) → ajoutées à la liste
 *   `photos` du formulaire dans leur emplacement cible (`assignTo` validé contre
 *   `photoFieldKeys`, sinon le champ source), avec auteur, licence, provenance et page
 *   source ; sans doublon (ou en remplacement de l'emplacement si `overwriteFilled`) ; les
 *   `source_url` alimentent aussi `sources`.
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
    // Le « deuxième nom » des sources remplit les autres noms du formulaire (migration 304).
    const formKey = key === 'second_name' && 'secondary_names' in next ? 'secondary_names' : key;
    const hasCurrentValue = String(prev?.[formKey] || '').trim().length > 0;
    if (!hasCurrentValue || overwriteFilled) {
      next[formKey] = value;
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
    picked.push({
      assignTo,
      url: selected.url,
      source_url: selected.source_url,
      credit: selected.credit,
      licence: selected.license ?? selected.licence,
      source: selected.source,
    });
  }
  picked.sort(
    (a, b) => a.assignTo.localeCompare(b.assignTo) || String(a.url).localeCompare(String(b.url)),
  );
  const byTarget = new Map();
  for (const row of picked) {
    if (!byTarget.has(row.assignTo)) byTarget.set(row.assignTo, []);
    byTarget.get(row.assignTo).push(row);
  }
  // Photos (migration 303) : chaque photo retenue entre dans la liste du formulaire AVEC
  // son auteur, sa licence et sa page source — la pré-saisie les récupérait, mais ils
  // étaient jetés au moment d'appliquer (audit du 25/09/2026, § 1.3.6).
  let photos = Array.isArray(next.photos) ? next.photos : [];
  for (const [targetField, rows] of byTarget) {
    const withUrl = rows.filter((r) => r.url);
    if (withUrl.length === 0) continue;
    if (overwriteFilled) photos = photos.filter((p) => p.kind !== targetField);
    for (const row of withUrl) {
      photos = addFormPhoto(
        photos,
        {
          kind: targetField,
          url: row.url,
          credit: row.credit,
          licence: row.licence,
          source: row.source,
          source_url: row.source_url,
        },
        'append',
      );
    }
    for (const row of rows) {
      if (row.source_url && !mergedSources.includes(row.source_url)) {
        mergedSources.push(row.source_url);
      }
    }
  }
  if (byTarget.size > 0) next.photos = photos;
  if (mergedSources.length > 0) {
    next.sources = mergedSources.join('\n');
  }
  return next;
}
