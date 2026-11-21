'use strict';

/**
 * Helpers purs pour l'arbre de classification pédagogique (`clades`).
 *
 * - Détection de cycles (un groupe ne peut pas devenir descendant de lui-même).
 * - Ancêtres / plus petit sous-arbre commun (activité « Groupes emboîtés »).
 * Aucune I/O : les appels SQL restent dans `routes/clades.js`.
 */

/**
 * Indexe une liste de clades par id.
 * @param {Array<{id:string,parent_id?:string|null}>} rows
 * @returns {Map<string, object>}
 */
function indexClades(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (!row || row.id == null) continue;
    byId.set(String(row.id), { ...row, id: String(row.id) });
  }
  return byId;
}

/**
 * Chaîne d'ancêtres depuis la racine jusqu'au nœud (inclus), ou [] si inconnu.
 * @param {Map<string, object>} byId
 * @param {string|null|undefined} cladeId
 * @returns {object[]}
 */
function ancestorChain(byId, cladeId) {
  if (cladeId == null || cladeId === '') return [];
  const chain = [];
  const seen = new Set();
  let current = String(cladeId);
  while (current) {
    if (seen.has(current)) break; // cycle résiduel en base : on s'arrête
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    chain.push(node);
    current = node.parent_id != null && node.parent_id !== '' ? String(node.parent_id) : null;
  }
  return chain.reverse();
}

/**
 * Libellé affiché d'une boîte au collège : `label_simple` s'il est renseigné, sinon `name`.
 * @param {{name?:string,label_simple?:string|null}|null|undefined} node
 * @returns {string}
 */
function cladeSimpleLabel(node) {
  if (!node) return '';
  const simple = typeof node.label_simple === 'string' ? node.label_simple.trim() : '';
  return simple || String(node.name || '');
}

/**
 * Groupe d'usage d'une fiche (socle collège, migration `college_socle`) : la boîte
 * `visible_college = 1` la plus proche en remontant depuis `cladeId` (incluse), ou `null` si
 * aucune boîte de la chaîne n'est marquée (repli : comportement actuel).
 * @param {Map<string, object>} byId
 * @param {string|null|undefined} cladeId
 * @returns {{id:string,label:string}|null}
 */
function usageGroupFor(byId, cladeId) {
  const chain = ancestorChain(byId, cladeId);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const node = chain[i];
    if (Number(node.visible_college) === 1) {
      return { id: node.id, label: cladeSimpleLabel(node) };
    }
  }
  return null;
}

/** Profil d'arbre demandé par le client : seul `'college'` réduit l'arbre. */
const COLLAPSE_PROFILE_COLLEGE = 'college';

/**
 * Vrai si le profil demande l'arbre réduit du collège. Accepte la chaîne `'college'` ou un
 * objet apprenant `{ etape: 'college' }`. La décision « réduire ou non » appartient au client,
 * qui lit la brique `nested_groups_full_tree` de la table de visibilité
 * (`src/shared/pedagoVisibilityCore.js`) et n'envoie `profile=college` que si elle est masquée.
 * @param {string|{etape?:string}|null|undefined} profile
 */
function isCollegeTreeProfile(profile) {
  const raw = profile && typeof profile === 'object' ? profile.etape : profile;
  return (
    String(raw || '')
      .trim()
      .toLowerCase() === COLLAPSE_PROFILE_COLLEGE
  );
}

/**
 * Arbre réduit aux groupes d'usage (chantier collège, flux C4).
 *
 * Au collège, seules les boîtes `visible_college = 1` restent ; une boîte visible prend pour
 * parent la boîte visible la plus proche en remontant (ou devient racine) ; une fiche rangée
 * dans une boîte retirée remonte à la boîte visible la plus proche (`cladeMap`). Libellé
 * affiché : `label_simple || name` ; attribut : `attribute_simple || shared_attribute` (les
 * valeurs savantes restent dans `full_name` / `full_shared_attribute`).
 *
 * Repli : profil autre que collège, ou **aucune** boîte marquée → arbre inchangé
 * (`collapsed: false`, `cladeMap` identité).
 *
 * Fonction pure : aucune I/O.
 *
 * @param {Array<object>} tree arbre plat (`GET /api/clades`, `{ id, parent_id, name, … }`)
 * @param {string|{etape?:string}|null|undefined} profile `'college'` pour l'arbre réduit
 * @returns {{ collapsed: boolean, items: object[], cladeMap: Map<string, string|null> }}
 */
function collapseForProfile(tree, profile) {
  const rows = Array.isArray(tree) ? tree.filter((r) => r && r.id != null) : [];
  const byId = indexClades(rows);
  const identity = () => {
    const cladeMap = new Map();
    for (const id of byId.keys()) cladeMap.set(id, id);
    return { collapsed: false, items: rows.map((r) => ({ ...r })), cladeMap };
  };
  if (!isCollegeTreeProfile(profile)) return identity();
  const isVisible = (node) => Boolean(node) && Number(node.visible_college) === 1;
  if (![...byId.values()].some(isVisible)) return identity();

  /** Boîte visible la plus proche en remontant depuis `id` (incluse), ou `null`. */
  const nearestVisible = (id) => {
    const chain = ancestorChain(byId, id);
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      if (isVisible(chain[i])) return chain[i].id;
    }
    return null;
  };

  const cladeMap = new Map();
  for (const id of byId.keys()) cladeMap.set(id, nearestVisible(id));

  const items = [];
  for (const row of rows) {
    const node = byId.get(String(row.id));
    if (!isVisible(node)) continue;
    const parentRaw =
      node.parent_id != null && node.parent_id !== '' ? String(node.parent_id) : null;
    const parentId = parentRaw ? nearestVisible(parentRaw) : null;
    const simpleAttr =
      typeof node.attribute_simple === 'string' ? node.attribute_simple.trim() : '';
    items.push({
      ...row,
      id: node.id,
      parent_id: parentId,
      name: cladeSimpleLabel(node),
      shared_attribute: simpleAttr || node.shared_attribute || '',
      full_name: node.name,
      full_shared_attribute: node.shared_attribute ?? null,
    });
  }
  return { collapsed: true, items, cladeMap };
}

/**
 * Boîte où ranger une fiche dans un arbre issu de `collapseForProfile` : la boîte visible la
 * plus proche de son `clade_id` (arbre réduit), son `clade_id` sinon. `null` si la fiche n'a
 * pas de groupe ou si aucune boîte visible ne la contient.
 * @param {{ cladeMap: Map<string, string|null> }} collapsedTree
 * @param {string|null|undefined} cladeId
 * @returns {string|null}
 */
function collapsedCladeIdFor(collapsedTree, cladeId) {
  if (cladeId == null || cladeId === '') return null;
  const key = String(cladeId);
  const map = collapsedTree?.cladeMap;
  if (!(map instanceof Map) || !map.has(key)) return null;
  return map.get(key);
}

/**
 * Vrai si `candidateParentId` est `nodeId` ou un de ses descendants
 * (placer le parent là créerait un cycle).
 * @param {Map<string, object>} byId
 * @param {string} nodeId
 * @param {string|null|undefined} candidateParentId
 */
function wouldCreateCycle(byId, nodeId, candidateParentId) {
  if (candidateParentId == null || candidateParentId === '') return false;
  const target = String(nodeId);
  let current = String(candidateParentId);
  const seen = new Set();
  while (current) {
    if (current === target) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    const node = byId.get(current);
    if (!node) return false;
    current = node.parent_id != null && node.parent_id !== '' ? String(node.parent_id) : null;
  }
  return false;
}

/**
 * Plus petit ancêtre commun (LCA) d'un ensemble de clades.
 * @param {Map<string, object>} byId
 * @param {string[]} cladeIds
 * @returns {object|null}
 */
function lowestCommonAncestor(byId, cladeIds) {
  const unique = [...new Set((cladeIds || []).map(String).filter(Boolean))];
  if (unique.length === 0) return null;
  const chains = unique.map((id) => ancestorChain(byId, id));
  if (chains.some((c) => c.length === 0)) return null;
  let lca = null;
  const minLen = Math.min(...chains.map((c) => c.length));
  for (let i = 0; i < minLen; i += 1) {
    const id = chains[0][i].id;
    if (chains.every((c) => c[i].id === id)) lca = chains[0][i];
    else break;
  }
  return lca;
}

/**
 * Ensemble des nœuds du plus petit sous-arbre contenant tous les clades donnés
 * (du LCA jusqu'à chaque feuille incluse, plus les nœuds intermédiaires).
 * @param {Map<string, object>} byId
 * @param {string[]} cladeIds
 * @returns {{ root: object|null, nodeIds: string[], nodes: object[] }}
 */
function smallestContainingSubtree(byId, cladeIds) {
  const unique = [...new Set((cladeIds || []).map(String).filter(Boolean))];
  const root = lowestCommonAncestor(byId, unique);
  if (!root) return { root: null, nodeIds: [], nodes: [] };
  const needed = new Set([root.id]);
  for (const id of unique) {
    const chain = ancestorChain(byId, id);
    const start = chain.findIndex((n) => n.id === root.id);
    if (start < 0) continue;
    for (let i = start; i < chain.length; i += 1) needed.add(chain[i].id);
  }
  const nodes = [...needed]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name, 'fr'),
    );
  return { root, nodeIds: [...needed], nodes };
}

/**
 * Construit un arbre emboîté pour l'activité : chaque nœud porte ses enfants clades
 * et les espèces directement rattachées à ce niveau (hors descendants plus précis).
 *
 * @param {Map<string, object>} byId
 * @param {Array<{id:number|string, name:string, emoji?:string, clade_id?:string|null}>} plants
 * @param {string[]} plantCladeIds — clade_id de chaque plante (aligné sur plants)
 * @returns {object|null} arbre racine ou null
 */
function buildNestedActivityTree(byId, plants, plantCladeIds) {
  const cladeIds = (plantCladeIds || []).filter(Boolean).map(String);
  const { root, nodeIds } = smallestContainingSubtree(byId, cladeIds);
  if (!root) return null;

  const allowed = new Set(nodeIds);
  const childrenOf = new Map();
  for (const id of allowed) {
    const node = byId.get(id);
    if (!node) continue;
    const pid = node.parent_id != null && node.parent_id !== '' ? String(node.parent_id) : null;
    if (pid && allowed.has(pid)) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(node);
    }
  }
  for (const list of childrenOf.values()) {
    list.sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name, 'fr'),
    );
  }

  /** Espèces dont le clade est exactement `cladeId` (pas un descendant). */
  const plantsAt = new Map();
  for (const plant of plants || []) {
    const cid = plant.clade_id != null && plant.clade_id !== '' ? String(plant.clade_id) : null;
    if (!cid || !allowed.has(cid)) continue;
    if (!plantsAt.has(cid)) plantsAt.set(cid, []);
    plantsAt.get(cid).push({
      id: Number(plant.id),
      name: plant.name,
      emoji: plant.emoji || null,
      clade_id: cid,
    });
  }

  function buildNode(node) {
    return {
      id: node.id,
      name: node.name,
      shared_attribute: node.shared_attribute,
      description: node.description || null,
      children: (childrenOf.get(node.id) || []).map(buildNode),
      plants: plantsAt.get(node.id) || [],
    };
  }

  return buildNode(root);
}

/**
 * Corrige un placement élève : le clade attendu est celui de la fiche ;
 * un ancêtre ou un descendant trop large/étroit est faux.
 * @returns {{ plantId: number, expectedCladeId: string|null, placedCladeId: string|null, correct: boolean }}
 */
function gradePlantPlacement(plantId, expectedCladeId, placedCladeId) {
  const expected =
    expectedCladeId != null && expectedCladeId !== '' ? String(expectedCladeId) : null;
  const placed = placedCladeId != null && placedCladeId !== '' ? String(placedCladeId) : null;
  return {
    plantId: Number(plantId),
    expectedCladeId: expected,
    placedCladeId: placed,
    correct: Boolean(expected && placed && expected === placed),
  };
}

module.exports = {
  indexClades,
  ancestorChain,
  cladeSimpleLabel,
  usageGroupFor,
  COLLAPSE_PROFILE_COLLEGE,
  isCollegeTreeProfile,
  collapseForProfile,
  collapsedCladeIdFor,
  wouldCreateCycle,
  lowestCommonAncestor,
  smallestContainingSubtree,
  buildNestedActivityTree,
  gradePlantPlacement,
};
