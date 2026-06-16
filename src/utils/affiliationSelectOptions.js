/**
 * Options du sélecteur « Mon espace » : n3 / foret / both + une entrée par carte supplémentaire.
 * @param {Array<{ id?: string, label?: string }>} maps
 * @returns {{ value: string, label: string }[]}
 */
export function buildAffiliationSelectOptions(maps = []) {
  const list = Array.isArray(maps) ? maps : [];
  const activeCount = list.filter((map) => map?.is_active !== false).length;
  const totalCount = list.length;
  const effectiveCount = activeCount > 0 ? activeCount : totalCount;
  const bothLabel =
    effectiveCount > 1 ? `Tous les espaces (${effectiveCount})` : 'Tous les espaces';
  const opts = [
    { value: 'both', label: bothLabel },
    { value: 'n3', label: 'N3 uniquement' },
    { value: 'foret', label: 'Forêt comestible uniquement' },
  ];
  const covered = new Set(['n3', 'foret', 'both']);
  const extra = list
    .filter((m) => m?.id && !covered.has(m.id))
    .map((m) => ({
      value: m.id,
      label: `${String(m.label || m.id).trim()} uniquement`,
    }));
  return [...opts, ...extra];
}
