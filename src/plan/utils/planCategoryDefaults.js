/**
 * Empreinte stable des catégories cochées d'office (réglage établissement).
 * Sert à détecter un changement admin et à écraser la mémoire appareil du Plan.
 *
 * @param {Iterable<string|number>|null|undefined} ids
 * @returns {string}
 */
export function fingerprintCategoryDefaults(ids) {
  return JSON.stringify(
    [...(ids || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .sort(),
  );
}
