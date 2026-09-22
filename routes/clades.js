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
const {
  indexClades,
  ancestorChain,
  wouldCreateCycle,
  buildNestedActivityTree,
  gradePlantPlacement,
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

async function loadAllClades() {
  return queryAll(
    `SELECT id, parent_id, name, shared_attribute, description, sort_order
       FROM clades
      ORDER BY sort_order ASC, name ASC`,
  );
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
  asyncHandler(async (_req, res) => {
    const items = await loadAllClades();
    return res.json({ items });
  }),
);

/**
 * POST /api/clades/activity/subtree — plus petit arbre contenant les espèces choisies.
 * Corps : `{ plantIds: number[] }` OU `{ mapId: string, count: number }` (tirage aléatoire).
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
      const sampled = await queryAll(
        `SELECT p.id, p.name, p.emoji, p.clade_id
           FROM plants p
           INNER JOIN map_species ms ON ms.plant_id = p.id AND ms.map_id = ?
          WHERE p.clade_id IS NOT NULL
          ORDER BY RAND()
          LIMIT ?`,
        [mapId, count],
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
    const byId = indexClades(items);
    const tree = buildNestedActivityTree(
      byId,
      plants,
      plants.map((p) => p.clade_id),
    );
    if (!tree) {
      return res.status(400).json({ error: 'Impossible de construire le sous-arbre' });
    }

    const allowedIds = collectTreeNodeIds(tree);
    return res.json({
      tree,
      plants: plants.map((p) => ({
        id: Number(p.id),
        name: p.name,
        emoji: p.emoji || null,
        clade_id: String(p.clade_id),
      })),
      cladeOptions: items
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
 * Corps : `{ placements: [{ plantId, cladeId }] }`
 */
router.post(
  '/activity/check',
  asyncHandler(async (req, res) => {
    const placements = Array.isArray(req.body?.placements) ? req.body.placements : null;
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
    const results = placements.map((p) => {
      const plantId = Number(p.plantId ?? p.plant_id);
      const placed = p.cladeId ?? p.clade_id ?? null;
      const plant = byPlant.get(plantId);
      return {
        ...gradePlantPlacement(plantId, plant?.clade_id, placed),
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

/** GET /api/clades/:id/path — fil « Êtres vivants › … » pour une fiche. */
router.get(
  '/:id/path',
  asyncHandler(async (req, res) => {
    const id = normalizeCladeId(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant de groupe invalide' });
    const items = await loadAllClades();
    const byId = indexClades(items);
    if (!byId.has(id)) return res.status(404).json({ error: 'Groupe introuvable' });
    const path = ancestorChain(byId, id).map((n) => ({
      id: n.id,
      name: n.name,
      shared_attribute: n.shared_attribute,
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
    const row = await queryOne(
      `SELECT id, parent_id, name, shared_attribute, description, sort_order FROM clades WHERE id = ?`,
      [payload.id],
    );
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
    const row = await queryOne(
      `SELECT id, parent_id, name, shared_attribute, description, sort_order FROM clades WHERE id = ?`,
      [id],
    );
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
