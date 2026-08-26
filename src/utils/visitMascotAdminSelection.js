/**
 * Logique pure du panneau admin « Mascottes de visite » (`VisitMascotSettingsPanel`).
 *
 * Ce module portait la mécanique de la liste blanche `ui.visit.mascot.allowed_ids` — cocher,
 * décocher, matérialiser la liste au premier décochage. Cette liste a été supprimée (étape 3 de
 * la fusion catalogue / packs) : elle se figeait sur les mascottes existant le jour où on la
 * posait, rendant invisible toute mascotte ajoutée ensuite. « Proposée aux visiteurs » est
 * maintenant l'état de publication de la mascotte, réglé au studio.
 *
 * Ne reste ici que ce qui sert encore : lire le registre, et repérer un identifiant réglé qui
 * n'y figure plus.
 */

/** Ids du registre (mascottes proposées aux visiteurs), dans l'ordre d'affichage. */
export function registryMascotIds(registry) {
  return (Array.isArray(registry) ? registry : [])
    .map((entry) => String(entry?.id || '').trim())
    .filter(Boolean);
}

/**
 * Ids cités par les réglages mais absents du registre — en pratique, une mascotte par défaut
 * qui a été retirée de la visite ou supprimée. Les visiteurs retombent alors sur la mascotte
 * livrée par défaut, ce que le panneau signale plutôt que de le laisser deviner.
 *
 * @param {string[]} registryIds ids proposés aux visiteurs.
 * @param {string[]} citedIds ids cités par un réglage (hors défaut).
 * @param {string} defaultId mascotte par défaut réglée.
 */
export function findOrphanMascotIds(registryIds, citedIds, defaultId) {
  const known = new Set((Array.isArray(registryIds) ? registryIds : []).map((v) => String(v)));
  const cited = [...(Array.isArray(citedIds) ? citedIds : []), String(defaultId || '').trim()];
  return [...new Set(cited.filter((id) => id && !known.has(id)))];
}
