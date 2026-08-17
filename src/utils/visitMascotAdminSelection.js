/**
 * Logique pure du panneau admin « Mascottes de visite » (`VisitMascotSettingsPanel`).
 *
 * Modèle : `allowedIds` **vide = aucune restriction** (toutes les mascottes du registre sont
 * proposées, y compris celles ajoutées plus tard). Dès que l'admin décoche une mascotte, la
 * liste est matérialisée à partir du registre courant.
 */

/** Ids du registre (catalogue livré + packs publiés), dans l'ordre d'affichage. */
export function registryMascotIds(registry) {
  return (Array.isArray(registry) ? registry : [])
    .map((entry) => String(entry?.id || '').trim())
    .filter(Boolean);
}

/** Une mascotte est-elle proposée aux visiteurs ? (liste vide = toutes) */
export function isMascotProposed(allowedIds, id) {
  const list = Array.isArray(allowedIds) ? allowedIds : [];
  return list.length === 0 || list.includes(String(id || '').trim());
}

/**
 * Coche / décoche une mascotte.
 * - Depuis « toutes proposées », décocher matérialise la liste complète moins cette mascotte.
 * - Décocher la dernière mascotte reviendrait à n'en proposer aucune : on revient à « toutes ».
 */
export function toggleProposedMascotId(allowedIds, registryIds, id) {
  const target = String(id || '').trim();
  if (!target) return Array.isArray(allowedIds) ? allowedIds : [];
  const current = Array.isArray(allowedIds) ? allowedIds : [];
  const known = (Array.isArray(registryIds) ? registryIds : []).map((v) => String(v || '').trim());
  const base = current.length === 0 ? known.filter(Boolean) : current;
  if (base.includes(target)) {
    const next = base.filter((entry) => entry !== target);
    return next.length === 0 ? [] : next;
  }
  return [...base, target];
}

/**
 * Choix de la mascotte par défaut : elle est **toujours** proposée (même invariant que
 * `normalizeVisitMascotSettingsFlat` côté serveur).
 */
export function chooseDefaultMascotId(allowedIds, id) {
  const target = String(id || '').trim();
  const current = Array.isArray(allowedIds) ? allowedIds : [];
  if (!target || current.length === 0 || current.includes(target)) {
    return { defaultId: target, allowedIds: current };
  }
  return { defaultId: target, allowedIds: [...current, target] };
}

/** Ids cités par les réglages mais absents du registre (pack dépublié, mascotte retirée…). */
export function findOrphanMascotIds(registryIds, allowedIds, defaultId) {
  const known = new Set((Array.isArray(registryIds) ? registryIds : []).map((v) => String(v)));
  const cited = [...(Array.isArray(allowedIds) ? allowedIds : []), String(defaultId || '').trim()];
  return [...new Set(cited.filter((id) => id && !known.has(id)))];
}
