/**
 * Filtres et arborescence pour l'admin des groupes
 * (onglet Profils & utilisateurs → Groupes).
 */

export const GROUP_KINDS = ['class', 'team', 'unit', 'club'];

/**
 * Filtre la liste plate des groupes.
 * @param {object[]} groups
 * @param {{
 *   query?: string,
 *   kind?: string|null,
 *   hideInactive?: boolean,
 * }} filters
 */
export function filterGroupsList(groups = [], filters = {}) {
  const query = String(filters.query || '')
    .trim()
    .toLowerCase();
  const kind = String(filters.kind || '')
    .trim()
    .toLowerCase();
  const hideInactive = filters.hideInactive !== false;

  return (Array.isArray(groups) ? groups : []).filter((g) => {
    if (hideInactive && Number(g?.is_active) === 0) return false;
    if (kind && String(g?.kind || '').toLowerCase() !== kind) return false;
    if (query) {
      const hay = `${g?.name || ''} ${g?.slug || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

/**
 * Construit une forêt parent → enfants à partir d'une liste filtrée.
 * Les nœuds orphelins (parent hors liste filtrée) remontent à la racine pour rester visibles.
 * @param {object[]} groups liste déjà filtrée
 * @returns {Array<object & { children: object[] }>}
 */
export function buildGroupForest(groups = []) {
  const byId = new Map();
  for (const g of groups) {
    const id = String(g?.id ?? '');
    if (!id) continue;
    byId.set(id, { ...g, children: [] });
  }
  const roots = [];
  for (const node of byId.values()) {
    const parentId =
      node.parent_group_id != null && String(node.parent_group_id).trim() !== ''
        ? String(node.parent_group_id)
        : '';
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes) => {
    nodes.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }),
    );
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

/**
 * Filtre membres / non-membres pour l'éditeur de membres.
 * @param {object[]} users
 * @param {{
 *   query?: string,
 *   membershipFilter?: 'all'|'members'|'non_members',
 *   memberOrManagerIds?: Set<string>|string[],
 * }} opts
 */
export function filterGroupMemberCandidates(users = [], opts = {}) {
  const query = String(opts.query || '')
    .trim()
    .toLowerCase();
  const membershipFilter = opts.membershipFilter || 'all';
  const memberSet =
    opts.memberOrManagerIds instanceof Set
      ? opts.memberOrManagerIds
      : new Set((opts.memberOrManagerIds || []).map(String));

  return (Array.isArray(users) ? users : []).filter((u) => {
    const uid = String(u?.id ?? '');
    const isMember = memberSet.has(uid);
    if (membershipFilter === 'members' && !isMember) return false;
    if (membershipFilter === 'non_members' && isMember) return false;
    if (query) {
      const hay = String(u?.display_name || '').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}
