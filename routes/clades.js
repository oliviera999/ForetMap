'use strict';

/**
 * Classification en groupes emboîtés (migration 274).
 *
 * Lecture publique (comme le catalogue biodiversité) : fil de classification sur une fiche,
 * activité « Groupes emboîtés ». Écriture sous `plants.manage` : CRUD de l'arbre, avec
 * interdiction des cycles.
 */

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { mapPresenceSubquery } = require('../lib/biodiv/presenceService');
const {
  indexClades,
  ancestorChain,
  wouldCreateCycle,
  buildNestedActivityTree,
  gradePlantPlacement,
  isCollegeTreeProfile,
  collapseForProfile,
  collapsedCladeIdFor,
} = require('../lib/clades');

const router = express.Router();
const manageClades = requirePermission('plants.manage');

const CLADE_ID_RE = /^[a-z0-9_]{1,64}$/i;

function normalizeCladeId(raw) {
  const s = normalizeOptionalString(raw);
  if (!s || !CLADE_ID_RE.test(s)) return null;
  return s.toLowerCase();
}

function normalizeCladePayload(body) {
  const id = normalizeCladeId(body?.id);
  const name = normalizeOptionalString(body?.name);
  const sharedAttribute = normalizeOptionalString(body?.shared_attribute ?? body?.sharedAttribute);
  const description = normalizeOptionalString(body?.description) || null;
  const parentRaw = body?.parent_id ?? body?.parentId;
  const parentId = parentRaw == null || parentRaw === '' ? null : normalizeCladeId(parentRaw);
  const sortOrder = Number.isFinite(Number(body?.sort_order ?? body?.sortOrder))
    ? Math.trunc(Number(body.sort_order ?? body.sortOrder))
    : 0;
  return { id, name, sharedAttribute, description, parentId, sortOrder };
}

/**
 * Colonnes lues d'une boîte. `label_simple`, `attribute_simple` et `visible_college` (socle
 * collège, migration `college_socle`) sont exposées en lecture seule.
 */
const CLADE_READ_COLUMNS =
  'id, parent_id, name, label_simple, shared_attribute, attribute_simple, description, sort_order, visible_college';

async function loadAllClades() {
  return queryAll(
    `SELECT ${CLADE_READ_COLUMNS}
       FROM clades
      ORDER BY sort_order ASC, name ASC`,
  );
}

/**
 * Profil d'arbre demandé (`?profile=college` ou `profile` dans le corps) : arbre réduit aux
 * groupes d'usage (flux C4 du chantier collège). Absent ou autre valeur → arbre complet
 * (comportement historique). Le client décide d'après la brique `nested_groups_full_tree`.
 */
function readTreeProfile(req) {
  const raw = req?.query?.profile ?? req?.body?.profile;
  if (raw == null || Array.isArray(raw) || typeof raw === 'object') return null;
  return isCollegeTreeProfile(raw) ? 'college' : null;
}

function collectTreeNodeIds(node, acc = new Set()) {
  if (!node?.id) return acc;
  acc.add(String(node.id));
  for (const child of node.children || []) collectTreeNodeIds(child, acc);
  return acc;
}

/** GET /api/clades — arbre plat ordonné (lecture publique). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await loadAllClades();
    const profile = readTreeProfile(req);
    if (!profile) return res.json({ items });
    const reduced = collapseForProfile(items, profile);
    return res.json({ items: reduced.items, collapsed: reduced.collapsed });
  }),
);

/**
 * Sous-arbre de l'activité. Au collège (`profile = 'college'`), l'arbre est réduit aux boîtes
 * visibles et chaque fiche remonte à sa boîte visible la plus proche ; repli sur l'arbre
 * complet si aucune boîte n'est marquée, si une fiche n'a aucune boîte visible ou si les
 * boîtes visibles n'ont pas d'ancêtre commun.
 * @returns {{ tree: object, treeItems: object[], placedPlants: object[], collapsed: boolean }|null}
 */
function buildActivityTree(items, plants, profile) {
  const full = () => {
    const tree = buildNestedActivityTree(
      indexClades(items),
      plants,
      plants.map((p) => p.clade_id),
    );
    return tree ? { tree, treeItems: items, placedPlants: plants, collapsed: false } : null;
  };
  if (!profile) return full();
  const reduced = collapseForProfile(items, profile);
  if (!reduced.collapsed) return full();
  const placedPlants = plants.map((p) => ({
    ...p,
    clade_id: collapsedCladeIdFor(reduced, p.clade_id),
  }));
  if (placedPlants.some((p) => !p.clade_id)) return full();
  const tree = buildNestedActivityTree(
    indexClades(reduced.items),
    placedPlants,
    placedPlants.map((p) => p.clade_id),
  );
  if (!tree) return full();
  return { tree, treeItems: reduced.items, placedPlants, collapsed: true };
}

/**
 * POST /api/clades/activity/subtree — plus petit arbre contenant les espèces choisies.
 * Corps : `{ plantIds: number[] }` OU `{ mapId: string, count: number }` (tirage aléatoire
 * parmi les espèces présentes sur la carte et classées dans l'arbre) ; `profile: 'college'`
 * facultatif (arbre réduit aux groupes d'usage).
 * Lecture publique (activité élève). Déclaré avant `/:id` pour éviter tout conflit.
 */
router.post(
  '/activity/subtree',
  asyncHandler(async (req, res) => {
    const mapId = normalizeOptionalString(req.body?.mapId ?? req.body?.map_id);
    let plantIds = Array.isArray(req.body?.plantIds)
      ? req.body.plantIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
      : Array.isArray(req.body?.plant_ids)
        ? req.body.plant_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
        : [];

    if (plantIds.length === 0 && mapId) {
      const countRaw = Number(req.body?.count ?? 6);
      const count = Math.min(20, Math.max(2, Number.isFinite(countRaw) ? Math.trunc(countRaw) : 6));
      // Vivier : espèces présentes sur la carte selon la définition commune (registre,
      // zones ou repères — `lib/biodiv/presenceService.js`), et classées dans l'arbre.
      // Avant la décision Q10, seul le registre comptait : 27 espèces sur la forêt au lieu
      // de 75 sur la base de référence.
      const presence = mapPresenceSubquery(mapId);
      const sampled = await queryAll(
        `SELECT p.id, p.name, p.emoji, p.clade_id
           FROM plants p
          WHERE p.clade_id IS NOT NULL
            AND p.id IN ${presence.sql}
          ORDER BY RAND()
          LIMIT ?`,
        [...presence.params, count],
      );
      plantIds = sampled.map((r) => Number(r.id));
      if (plantIds.length < 2) {
        return res.status(400).json({
          error: 'Pas assez d’espèces classées sur cette carte (minimum 2)',
        });
      }
    }

    plantIds = [...new Set(plantIds)];
    if (plantIds.length < 2) {
      return res.status(400).json({ error: 'Choisir au moins deux espèces' });
    }
    if (plantIds.length > 30) {
      return res.status(400).json({ error: 'Maximum 30 espèces par activité' });
    }

    const placeholders = plantIds.map(() => '?').join(', ');
    const plants = await queryAll(
      `SELECT id, name, emoji, clade_id FROM plants WHERE id IN (${placeholders})`,
      plantIds,
    );
    if (plants.length !== plantIds.length) {
      return res.status(400).json({ error: 'Une ou plusieurs espèces sont introuvables' });
    }
    const withoutClade = plants.filter((p) => !p.clade_id);
    if (withoutClade.length > 0) {
      return res.status(400).json({
        error: `Espèces sans groupe : ${withoutClade.map((p) => p.name).join(', ')}`,
      });
    }

    const items = await loadAllClades();
    const built = buildActivityTree(items, plants, readTreeProfile(req));
    if (!built) {
      return res.status(400).json({ error: 'Impossible de construire le sous-arbre' });
    }
    const { tree, treeItems, placedPlants, collapsed } = built;

    const allowedIds = collectTreeNodeIds(tree);
    return res.json({
      tree,
      collapsed,
      plants: placedPlants.map((p) => ({
        id: Number(p.id),
        name: p.name,
        emoji: p.emoji || null,
        clade_id: String(p.clade_id),
      })),
      // Options de placement : les boîtes du sous-arbre seulement (au collège, les boîtes
      // visibles, libellés simples).
      cladeOptions: treeItems
        .filter((c) => allowedIds.has(String(c.id)))
        .map((c) => ({
          id: c.id,
          name: c.name,
          shared_attribute: c.shared_attribute,
        })),
    });
  }),
);

/**
 * POST /api/clades/activity/check — correction automatique des placements élèves.
 * Corps : `{ placements: [{ plantId, cladeId }], profile?: 'college' }`. Au collège, la boîte
 * attendue est la boîte visible la plus proche du groupe de la fiche (celle que proposait
 * l'activité réduite).
 */
router.post(
  '/activity/check',
  asyncHandler(async (req, res) => {
    // Entrées qui ne sont pas des objets (`null`, nombre, tableau…) écartées : `p.plantId` sur
    // `null` levait un TypeError → 500 sur cette route publique (audit du 19/11/2026, P8).
    const placements = Array.isArray(req.body?.placements)
      ? req.body.placements.filter((p) => p && typeof p === 'object' && !Array.isArray(p))
      : null;
    if (!placements || placements.length === 0) {
      return res.status(400).json({ error: 'placements requis' });
    }
    const plantIds = placements
      .map((p) => Number(p.plantId ?? p.plant_id))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (plantIds.length === 0) {
      return res.status(400).json({ error: 'placements invalides' });
    }
    const placeholders = plantIds.map(() => '?').join(', ');
    const plants = await queryAll(
      `SELECT id, name, clade_id FROM plants WHERE id IN (${placeholders})`,
      plantIds,
    );
    const byPlant = new Map(plants.map((p) => [Number(p.id), p]));
    const profile = readTreeProfile(req);
    const reduced = profile ? collapseForProfile(await loadAllClades(), profile) : null;
    const expectedFor = (plant) => {
      if (!plant?.clade_id) return null;
      if (!reduced?.collapsed) return plant.clade_id;
      // Fiche sans boîte visible : l'activité est retombée sur l'arbre complet.
      return collapsedCladeIdFor(reduced, plant.clade_id) || plant.clade_id;
    };
    const results = placements.map((p) => {
      const plantId = Number(p.plantId ?? p.plant_id);
      const placed = p.cladeId ?? p.clade_id ?? null;
      const plant = byPlant.get(plantId);
      return {
        ...gradePlantPlacement(plantId, expectedFor(plant), placed),
        name: plant?.name || null,
      };
    });
    const correctCount = results.filter((r) => r.correct).length;
    return res.json({
      results,
      correctCount,
      total: results.length,
      allCorrect: correctCount === results.length,
    });
  }),
);

/**
 * GET /api/clades/:id/path — fil « Êtres vivants › … » pour une fiche. `?profile=college` :
 * fil de l'arbre réduit (boîtes visibles, libellés simples) depuis la boîte visible la plus
 * proche ; `path: []` si aucune boîte visible ne contient le groupe.
 */
router.get(
  '/:id/path',
  asyncHandler(async (req, res) => {
    const id = normalizeCladeId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant de groupe invalide' });
    const items = await loadAllClades();
    const byId = indexClades(items);
    if (!byId.has(id)) return res.status(404).json({ error: 'Groupe introuvable' });
    const profile = readTreeProfile(req);
    if (profile) {
      const reduced = collapseForProfile(items, profile);
      if (reduced.collapsed) {
        const target = collapsedCladeIdFor(reduced, id);
        const reducedById = indexClades(reduced.items);
        const path = target
          ? ancestorChain(reducedById, target).map((n) => ({
              id: n.id,
              name: n.name,
              shared_attribute: n.shared_attribute,
              full_name: n.full_name,
              full_shared_attribute: n.full_shared_attribute,
              visible_college: 1,
            }))
          : [];
        return res.json({ path, collapsed: true });
      }
    }
    const path = ancestorChain(byId, id).map((n) => ({
      id: n.id,
      name: n.name,
      shared_attribute: n.shared_attribute,
      label_simple: n.label_simple ?? null,
      attribute_simple: n.attribute_simple ?? null,
      visible_college: Number(n.visible_college) === 1 ? 1 : 0,
    }));
    return res.json({ path });
  }),
);

/** POST /api/clades — créer un groupe (`plants.manage`). */
router.post(
  '/',
  manageClades,
  asyncHandler(async (req, res) => {
    const payload = normalizeCladePayload(req.body || {});
    if (!payload.id) return res.status(400).json({ error: 'Identifiant de groupe invalide' });
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    if (!payload.sharedAttribute) {
      return res.status(400).json({ error: 'Attribut partagé requis' });
    }
    if (payload.parentId) {
      const parent = await queryOne('SELECT id FROM clades WHERE id = ?', [payload.parentId]);
      if (!parent) return res.status(400).json({ error: 'Groupe parent introuvable' });
    }
    const existing = await queryOne('SELECT id FROM clades WHERE id = ?', [payload.id]);
    if (existing) return res.status(409).json({ error: 'Cet identifiant existe déjà' });

    await execute(
      `INSERT INTO clades (id, parent_id, name, shared_attribute, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        payload.id,
        payload.parentId,
        payload.name,
        payload.sharedAttribute,
        payload.description,
        payload.sortOrder,
      ],
    );
    const row = await queryOne(`SELECT ${CLADE_READ_COLUMNS} FROM clades WHERE id = ?`, [
      payload.id,
    ]);
    return res.status(201).json(row);
  }),
);

/** PUT /api/clades/:id — modifier / déplacer (`plants.manage`), refuse les cycles. */
router.put(
  '/:id',
  manageClades,
  asyncHandler(async (req, res) => {
    const id = normalizeCladeId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant de groupe invalide' });
    const current = await queryOne('SELECT * FROM clades WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Groupe introuvable' });

    const name = normalizeOptionalString(req.body?.name) || current.name;
    const sharedAttribute =
      normalizeOptionalString(req.body?.shared_attribute ?? req.body?.sharedAttribute) ||
      current.shared_attribute;
    const description =
      req.body?.description === undefined
        ? current.description
        : normalizeOptionalString(req.body.description) || null;
    const parentSpecified =
      Object.prototype.hasOwnProperty.call(req.body || {}, 'parent_id') ||
      Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId');
    let parentId = current.parent_id;
    if (parentSpecified) {
      const parentRaw = req.body?.parent_id ?? req.body?.parentId;
      parentId = parentRaw == null || parentRaw === '' ? null : normalizeCladeId(parentRaw);
      if (parentRaw != null && parentRaw !== '' && !parentId) {
        return res.status(400).json({ error: 'Groupe parent invalide' });
      }
    }
    const sortOrder = Number.isFinite(Number(req.body?.sort_order ?? req.body?.sortOrder))
      ? Math.trunc(Number(req.body.sort_order ?? req.body.sortOrder))
      : current.sort_order;

    if (parentId === id) {
      return res.status(400).json({ error: 'Un groupe ne peut pas être son propre parent' });
    }
    if (parentId) {
      const parent = await queryOne('SELECT id FROM clades WHERE id = ?', [parentId]);
      if (!parent) return res.status(400).json({ error: 'Groupe parent introuvable' });
    }

    const items = await loadAllClades();
    const byId = indexClades(items);
    // Simuler le nouveau parent pour la détection de cycle
    const simulated = new Map(byId);
    simulated.set(id, { ...byId.get(id), parent_id: parentId });
    if (wouldCreateCycle(simulated, id, parentId)) {
      return res.status(400).json({ error: 'Ce déplacement créerait un cycle dans l’arbre' });
    }

    await execute(
      `UPDATE clades
          SET parent_id = ?, name = ?, shared_attribute = ?, description = ?, sort_order = ?
        WHERE id = ?`,
      [parentId, name, sharedAttribute, description, sortOrder, id],
    );
    const row = await queryOne(`SELECT ${CLADE_READ_COLUMNS} FROM clades WHERE id = ?`, [id]);
    return res.json(row);
  }),
);

/** DELETE /api/clades/:id — suppression (`plants.manage`) ; RESTRICT si enfants. */
router.delete(
  '/:id',
  manageClades,
  asyncHandler(async (req, res) => {
    const id = normalizeCladeId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant de groupe invalide' });
    const current = await queryOne('SELECT id FROM clades WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Groupe introuvable' });
    const child = await queryOne('SELECT id FROM clades WHERE parent_id = ? LIMIT 1', [id]);
    if (child) {
      return res.status(409).json({
        error: 'Ce groupe a des sous-groupes : déplacez-les ou supprimez-les d’abord',
      });
    }
    await execute('DELETE FROM clades WHERE id = ?', [id]);
    return res.json({ ok: true });
  }),
);

module.exports = router;
