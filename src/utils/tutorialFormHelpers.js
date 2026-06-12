/**
 * Helpers purs du formulaire de tutoriel — extraits de `tutorials-views.jsx` (O6).
 *
 * Bascule d'un lieu coché (zones/repères, ids dédupliqués en chaînes), refiltrage des lieux
 * après changement de carte, hydratation du formulaire depuis le détail API et construction
 * du payload de sauvegarde. Transformations non-mutantes ; logique testable.
 */

/** Ids d'une liste, normalisés en chaînes trimées, vides retirés, dédupliqués. */
function normalizedIdList(list) {
  return [...new Set((list || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

/**
 * Bascule `rawId` dans `form[field]` (`zone_ids` ou `marker_ids`) : ajoute si absent, retire si
 * présent ; la liste courante est dédupliquée en chaînes. Id vide → `form` inchangé (même référence).
 */
export function toggleTutorialFormLocation(form, field, rawId) {
  const id = String(rawId || '').trim();
  if (!id) return form;
  const cur = [...new Set((form[field] || []).map(String))];
  const has = cur.includes(id);
  return { ...form, [field]: has ? cur.filter((x) => x !== id) : [...cur, id] };
}

/**
 * Applique un changement de carte au formulaire : `map_id` mis à jour, `zone_ids`/`marker_ids`
 * réduits aux lieux existants sur la nouvelle carte (tous conservés si `nextMapId` vide).
 */
export function applyTutorialFormMapChange(form, nextMapId, zones = [], markers = []) {
  return {
    ...form,
    map_id: nextMapId,
    zone_ids: (form.zone_ids || []).filter((zid) => {
      const z = zones.find((zz) => String(zz.id) === String(zid));
      return z && (!nextMapId || z.map_id === nextMapId);
    }),
    marker_ids: (form.marker_ids || []).filter((mid) => {
      const mk = markers.find((mm) => String(mm.id) === String(mid));
      return mk && (!nextMapId || mk.map_id === nextMapId);
    }),
  };
}

/**
 * Formulaire d'édition depuis le détail API d'un tutoriel : champs textuels avec défauts,
 * ids de lieux normalisés, carte inférée depuis la 1re zone/repère lié(e) (repli `activeMapId`).
 */
export function tutorialFormFromDetail(detail, activeMapId) {
  const inferMap =
    (detail.zones_linked && detail.zones_linked[0]?.map_id)
    || (detail.markers_linked && detail.markers_linked[0]?.map_id)
    || activeMapId
    || '';
  return {
    id: detail.id,
    title: detail.title || '',
    summary: detail.summary || '',
    type: detail.type || 'html',
    html_content: detail.html_content || '',
    source_url: detail.source_url || '',
    source_file_path: detail.source_file_path || '',
    sort_order: detail.sort_order || 0,
    is_active: detail.is_active !== false,
    map_id: inferMap,
    zone_ids: (detail.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean),
    marker_ids: (detail.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean),
  };
}

/**
 * Payload de sauvegarde (POST/PUT `/api/tutorials`) : titre trimé, contenu HTML ou URL selon le
 * type (l'autre passe à `null`), ordre numérique, ids de lieux normalisés/dédupliqués.
 */
export function buildTutorialSavePayload(form) {
  return {
    title: form.title.trim(),
    summary: form.summary || '',
    type: form.type,
    html_content: form.type === 'html' ? (form.html_content || null) : null,
    source_url: form.type === 'link' ? (form.source_url || null) : null,
    source_file_path: form.source_file_path || null,
    sort_order: Number(form.sort_order) || 0,
    is_active: !!form.is_active,
    zone_ids: normalizedIdList(form.zone_ids),
    marker_ids: normalizedIdList(form.marker_ids),
  };
}
