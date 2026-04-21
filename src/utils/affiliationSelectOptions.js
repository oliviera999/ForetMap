/**
 * Options du sélecteur « Mon espace » : n3 / foret / both + une entrée par carte supplémentaire.
 * @param {Array<{ id?: string, label?: string }>} maps
 * @returns {{ value: string, label: string }[]}
 */
export function buildAffiliationSelectOptions(maps = []) {
  const opts = [
    { value: 'both', label: 'N3 + Forêt comestible' },
    { value: 'n3', label: 'N3 uniquement' },
    { value: 'foret', label: 'Forêt comestible uniquement' },
  ];
  const covered = new Set(['n3', 'foret', 'both']);
  const extra = (Array.isArray(maps) ? maps : [])
    .filter((m) => m?.id && !covered.has(m.id))
    .map((m) => ({
      value: m.id,
      label: `${String(m.label || m.id).trim()} uniquement`,
    }));
  return [...opts, ...extra];
}
