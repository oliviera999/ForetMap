'use strict';

/**
 * Clés d'identification dichotomiques (migration 275).
 * Lecture publique des clés publiées ; édition sous `id_keys.manage`.
 */

const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const {
  requirePermission,
  hasPermission,
  parseBearerToken,
  hydrateAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const asyncHandler = require('../lib/asyncHandler');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const {
  validateLeadOutcome,
  findManipulationInvitation,
  hasCoupletCycle,
  assertLeadWellFormed,
} = require('../lib/idKeys');

const router = express.Router();
const manageKeys = requirePermission('id_keys.manage');

async function tryResolveAuth(req) {
  try {
    const token = parseBearerToken(req);
    if (!token) return null;
    const claims = verifyJwtToken(token, JWT_SECRET);
    return await hydrateAuthFromTokenClaims(claims);
  } catch {
    return null;
  }
}
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,118}$/i;
const NIVEAUX = new Set(['college', 'lycee']);

function normalizeSlug(raw) {
  const s = normalizeOptionalString(raw);
  if (!s || !SLUG_RE.test(s)) return null;
  return s.toLowerCase();
}

function normalizeNiveau(raw) {
  const s = normalizeOptionalString(raw);
  return NIVEAUX.has(s) ? s : null;
}

async function loadKeyBundle(keyId, { includeUnpublished = false } = {}) {
  const key = await queryOne('SELECT * FROM id_keys WHERE id = ?', [keyId]);
  if (!key) return null;
  if (!includeUnpublished && !key.is_published) return null;
  const couplets = await queryAll(
    `SELECT id, key_id, number FROM id_key_couplets WHERE key_id = ? ORDER BY number ASC`,
    [keyId],
  );
  const coupletIds = couplets.map((c) => Number(c.id));
  let leads = [];
  if (coupletIds.length > 0) {
    const ph = coupletIds.map(() => '?').join(', ');
    leads = await queryAll(
      `SELECT l.*, p.name AS plant_name, p.emoji AS plant_emoji
         FROM id_key_leads l
         LEFT JOIN plants p ON p.id = l.plant_id
        WHERE l.couplet_id IN (${ph})
        ORDER BY l.couplet_id ASC, l.sort_order ASC, l.id ASC`,
      coupletIds,
    );
  }
  const leadsByCouplet = new Map();
  for (const lead of leads) {
    const cid = Number(lead.couplet_id);
    if (!leadsByCouplet.has(cid)) leadsByCouplet.set(cid, []);
    leadsByCouplet.get(cid).push({
      id: Number(lead.id),
      couplet_id: cid,
      sort_order: Number(lead.sort_order) || 0,
      statement: lead.statement,
      image_url: lead.image_url || null,
      next_couplet_id: lead.next_couplet_id != null ? Number(lead.next_couplet_id) : null,
      plant_id: lead.plant_id != null ? Number(lead.plant_id) : null,
      plant_name: lead.plant_name || null,
      plant_emoji: lead.plant_emoji || null,
    });
  }
  return {
    id: Number(key.id),
    slug: key.slug,
    title: key.title,
    description: key.description || null,
    map_id: key.map_id || null,
    scope_label: key.scope_label || null,
    niveau: key.niveau,
    is_published: Boolean(key.is_published),
    created_by: key.created_by || null,
    created_at: key.created_at,
    updated_at: key.updated_at,
    couplets: couplets.map((c) => ({
      id: Number(c.id),
      key_id: Number(c.key_id),
      number: Number(c.number),
      leads: leadsByCouplet.get(Number(c.id)) || [],
    })),
  };
}

function validateKeyGraph(bundle) {
  const coupletIds = new Set(bundle.couplets.map((c) => Number(c.id)));
  for (const couplet of bundle.couplets) {
    if (!couplet.leads || couplet.leads.length < 2) {
      return `Le couplet ${couplet.number} doit avoir au moins deux propositions`;
    }
    for (const lead of couplet.leads) {
      const err = assertLeadWellFormed(lead, coupletIds);
      if (err) return `Couplet ${couplet.number} : ${err}`;
    }
  }
  if (hasCoupletCycle(bundle.couplets)) {
    return 'La clé contient un cycle entre couplets';
  }
  return null;
}

/** GET /api/id-keys — publiées ; `?all=1` + `id_keys.manage` pour inclure les brouillons. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const wantAll = String(req.query?.all || '') === '1';
    let includeDrafts = false;
    if (wantAll) {
      const auth = await tryResolveAuth(req);
      includeDrafts = hasPermission(auth, 'id_keys.manage');
    }
    const rows = includeDrafts
      ? await queryAll(
          `SELECT id, slug, title, description, map_id, scope_label, niveau, is_published, updated_at
             FROM id_keys ORDER BY title ASC`,
        )
      : await queryAll(
          `SELECT id, slug, title, description, map_id, scope_label, niveau, is_published, updated_at
             FROM id_keys WHERE is_published = 1 ORDER BY title ASC`,
        );
    return res.json({
      items: rows.map((r) => ({
        ...r,
        id: Number(r.id),
        is_published: Boolean(r.is_published),
      })),
    });
  }),
);

/** GET /api/id-keys/:idOrSlug — détail ; brouillon seulement avec `id_keys.manage`. */
router.get(
  '/:idOrSlug',
  asyncHandler(async (req, res) => {
    const raw = normalizeOptionalString(req.params?.idOrSlug);
    if (!raw) return res.status(400).json({ error: 'Identifiant invalide' });
    const byId = /^\d+$/.test(raw)
      ? await queryOne('SELECT id, is_published FROM id_keys WHERE id = ?', [Number(raw)])
      : await queryOne('SELECT id, is_published FROM id_keys WHERE slug = ?', [raw.toLowerCase()]);
    if (!byId) return res.status(404).json({ error: 'Clé introuvable' });

    if (!byId.is_published) {
      const auth = await tryResolveAuth(req);
      if (!hasPermission(auth, 'id_keys.manage')) {
        return res.status(404).json({ error: 'Clé introuvable' });
      }
    }
    const bundle = await loadKeyBundle(byId.id, { includeUnpublished: true });
    if (!bundle) return res.status(404).json({ error: 'Clé introuvable' });
    return res.json(bundle);
  }),
);

/** POST /api/id-keys — créer une clé vide. */
router.post(
  '/',
  manageKeys,
  asyncHandler(async (req, res) => {
    const slug = normalizeSlug(req.body?.slug);
    const title = normalizeOptionalString(req.body?.title);
    const description = normalizeOptionalString(req.body?.description) || null;
    const mapId = normalizeOptionalString(req.body?.map_id ?? req.body?.mapId) || null;
    const scopeLabel =
      normalizeOptionalString(req.body?.scope_label ?? req.body?.scopeLabel) || null;
    const niveau = normalizeNiveau(req.body?.niveau) || 'college';
    if (!slug) return res.status(400).json({ error: 'Slug invalide' });
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (mapId) {
      const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
      if (!map) return res.status(400).json({ error: 'Carte introuvable' });
    }
    const existing = await queryOne('SELECT id FROM id_keys WHERE slug = ?', [slug]);
    if (existing) return res.status(409).json({ error: 'Ce slug existe déjà' });

    const result = await execute(
      `INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [slug, title, description, mapId, scopeLabel, niveau, req.auth?.userId || null],
    );
    // Premier couplet de départ
    await execute(`INSERT INTO id_key_couplets (key_id, number) VALUES (?, 1)`, [result.insertId]);
    const bundle = await loadKeyBundle(result.insertId, { includeUnpublished: true });
    return res.status(201).json(bundle);
  }),
);

/** PUT /api/id-keys/:id — métadonnées + publication. */
router.put(
  '/:id',
  manageKeys,
  asyncHandler(async (req, res) => {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const current = await queryOne('SELECT * FROM id_keys WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Clé introuvable' });

    const title = normalizeOptionalString(req.body?.title) || current.title;
    const description =
      req.body?.description === undefined
        ? current.description
        : normalizeOptionalString(req.body.description) || null;
    const mapSpecified =
      Object.prototype.hasOwnProperty.call(req.body || {}, 'map_id') ||
      Object.prototype.hasOwnProperty.call(req.body || {}, 'mapId');
    let mapId = current.map_id;
    if (mapSpecified) {
      mapId = normalizeOptionalString(req.body?.map_id ?? req.body?.mapId) || null;
      if (mapId) {
        const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
        if (!map) return res.status(400).json({ error: 'Carte introuvable' });
      }
    }
    const scopeLabel =
      req.body?.scope_label === undefined && req.body?.scopeLabel === undefined
        ? current.scope_label
        : normalizeOptionalString(req.body?.scope_label ?? req.body?.scopeLabel) || null;
    const niveau = normalizeNiveau(req.body?.niveau) || current.niveau;
    let isPublished = current.is_published;
    if (req.body?.is_published !== undefined || req.body?.isPublished !== undefined) {
      isPublished = Boolean(req.body?.is_published ?? req.body?.isPublished);
    }

    if (isPublished) {
      const bundle = await loadKeyBundle(id, { includeUnpublished: true });
      const graphErr = validateKeyGraph(bundle);
      if (graphErr) return res.status(400).json({ error: graphErr });
    }

    await execute(
      `UPDATE id_keys
          SET title = ?, description = ?, map_id = ?, scope_label = ?, niveau = ?, is_published = ?
        WHERE id = ?`,
      [title, description, mapId, scopeLabel, niveau, isPublished ? 1 : 0, id],
    );
    const bundle = await loadKeyBundle(id, { includeUnpublished: true });
    return res.json(bundle);
  }),
);

/** DELETE /api/id-keys/:id */
router.delete(
  '/:id',
  manageKeys,
  asyncHandler(async (req, res) => {
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const current = await queryOne('SELECT id FROM id_keys WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Clé introuvable' });
    await execute('DELETE FROM id_keys WHERE id = ?', [id]);
    return res.json({ ok: true });
  }),
);

/** POST /api/id-keys/:id/couplets — ajouter un couplet. */
router.post(
  '/:id/couplets',
  manageKeys,
  asyncHandler(async (req, res) => {
    const keyId = Number(req.params?.id);
    if (!Number.isInteger(keyId) || keyId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const key = await queryOne('SELECT id FROM id_keys WHERE id = ?', [keyId]);
    if (!key) return res.status(404).json({ error: 'Clé introuvable' });
    const maxRow = await queryOne(
      'SELECT COALESCE(MAX(number), 0) AS m FROM id_key_couplets WHERE key_id = ?',
      [keyId],
    );
    const number =
      Number(req.body?.number) > 0 ? Math.trunc(Number(req.body.number)) : Number(maxRow.m) + 1;
    try {
      const result = await execute(`INSERT INTO id_key_couplets (key_id, number) VALUES (?, ?)`, [
        keyId,
        number,
      ]);
      return res.status(201).json({ id: result.insertId, key_id: keyId, number, leads: [] });
    } catch (err) {
      if (err?.errno === 1062) {
        return res.status(409).json({ error: 'Ce numéro de couplet existe déjà' });
      }
      throw err;
    }
  }),
);

/** DELETE /api/id-keys/:id/couplets/:coupletId */
router.delete(
  '/:id/couplets/:coupletId',
  manageKeys,
  asyncHandler(async (req, res) => {
    const keyId = Number(req.params?.id);
    const coupletId = Number(req.params?.coupletId);
    const couplet = await queryOne(
      'SELECT id, number FROM id_key_couplets WHERE id = ? AND key_id = ?',
      [coupletId, keyId],
    );
    if (!couplet) return res.status(404).json({ error: 'Couplet introuvable' });
    if (Number(couplet.number) === 1) {
      const count = await queryOne('SELECT COUNT(*) AS c FROM id_key_couplets WHERE key_id = ?', [
        keyId,
      ]);
      if (Number(count.c) <= 1) {
        return res
          .status(409)
          .json({ error: 'La clé doit conserver au moins le couplet de départ' });
      }
    }
    await execute('DELETE FROM id_key_couplets WHERE id = ?', [coupletId]);
    return res.json({ ok: true });
  }),
);

/**
 * PUT /api/id-keys/:id/couplets/:coupletId/leads — remplace les propositions d'un couplet.
 * Corps : `{ leads: [{ statement, image_url?, next_couplet_id?, plant_id?, sort_order? }] }`
 */
router.put(
  '/:id/couplets/:coupletId/leads',
  manageKeys,
  asyncHandler(async (req, res) => {
    const keyId = Number(req.params?.id);
    const coupletId = Number(req.params?.coupletId);
    const couplet = await queryOne('SELECT id FROM id_key_couplets WHERE id = ? AND key_id = ?', [
      coupletId,
      keyId,
    ]);
    if (!couplet) return res.status(404).json({ error: 'Couplet introuvable' });

    const leadsIn = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!leadsIn || leadsIn.length < 2) {
      return res.status(400).json({ error: 'Au moins deux propositions sont requises' });
    }

    const allCouplets = await queryAll('SELECT id FROM id_key_couplets WHERE key_id = ?', [keyId]);
    const coupletIds = new Set(allCouplets.map((c) => Number(c.id)));

    const normalized = [];
    for (let i = 0; i < leadsIn.length; i += 1) {
      const raw = leadsIn[i] || {};
      const statement = normalizeOptionalString(raw.statement);
      const manip = findManipulationInvitation(statement);
      if (manip) return res.status(400).json({ error: manip });
      const next =
        raw.next_couplet_id != null && raw.next_couplet_id !== ''
          ? Number(raw.next_couplet_id)
          : raw.nextCoupletId != null && raw.nextCoupletId !== ''
            ? Number(raw.nextCoupletId)
            : null;
      const plant =
        raw.plant_id != null && raw.plant_id !== ''
          ? Number(raw.plant_id)
          : raw.plantId != null && raw.plantId !== ''
            ? Number(raw.plantId)
            : null;
      const outcome = validateLeadOutcome({ nextCoupletId: next, plantId: plant });
      if (!outcome.ok) return res.status(400).json({ error: outcome.error });
      if (next != null) {
        if (!coupletIds.has(next)) {
          return res
            .status(400)
            .json({ error: 'Le couplet suivant doit appartenir à la même clé' });
        }
        if (next === coupletId) {
          return res
            .status(400)
            .json({ error: 'Une proposition ne peut pas renvoyer au même couplet' });
        }
      }
      if (plant != null) {
        const p = await queryOne('SELECT id FROM plants WHERE id = ?', [plant]);
        if (!p) return res.status(400).json({ error: `Espèce introuvable : ${plant}` });
      }
      normalized.push({
        statement,
        image_url: normalizeOptionalString(raw.image_url ?? raw.imageUrl) || null,
        next_couplet_id: next,
        plant_id: plant,
        sort_order: Number.isFinite(Number(raw.sort_order ?? i))
          ? Math.trunc(Number(raw.sort_order ?? i))
          : i,
      });
    }

    // Simuler le graphe pour détecter un cycle avant d'écrire
    const bundle = await loadKeyBundle(keyId, { includeUnpublished: true });
    const simulated = bundle.couplets.map((c) =>
      Number(c.id) === coupletId ? { ...c, leads: normalized } : c,
    );
    if (hasCoupletCycle(simulated)) {
      return res.status(400).json({ error: 'Ces propositions créeraient un cycle dans la clé' });
    }

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM id_key_leads WHERE couplet_id = ?', [coupletId]);
      for (const lead of normalized) {
        await tx.execute(
          `INSERT INTO id_key_leads
             (couplet_id, sort_order, statement, image_url, next_couplet_id, plant_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            coupletId,
            lead.sort_order,
            lead.statement,
            lead.image_url,
            lead.next_couplet_id,
            lead.plant_id,
          ],
        );
      }
    });

    const updated = await loadKeyBundle(keyId, { includeUnpublished: true });
    const coupletOut = updated.couplets.find((c) => Number(c.id) === coupletId);
    return res.json(coupletOut);
  }),
);

module.exports = router;
