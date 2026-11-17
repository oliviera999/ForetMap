'use strict';

/**
 * Clés d'identification dichotomiques (migration 275).
 * Lecture publique des clés publiées ; édition sous `id_keys.manage`.
 */

const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { loadKeyBundle, parseToolSet } = require('../lib/idKeyBundle');
const {
  requirePermission,
  hasPermission,
  parseBearerToken,
  hydrateOptionalAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const asyncHandler = require('../lib/asyncHandler');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { QUESTION_NIVEAU_ENUM } = require('../lib/shared/pedagoEnums');
const { requirePedagoModuleOrManager } = require('../lib/pedagoModuleGate');
const {
  validateLeadOutcome,
  findManipulationInvitation,
  hasCoupletCycle,
  assertLeadWellFormed,
} = require('../lib/idKeys');
const { ID_KEY_TOOL_ENUM } = require('../lib/shared/pedagoEnums');
const { resolveLeadOutcome } = require('../lib/shared/idKeyLeadCore');

const router = express.Router();
const manageKeys = requirePermission('id_keys.manage');

// Module éteint (`ui.modules.id_keys_enabled`) : fermé aux élèves, ouvert à `id_keys.manage`
// (`lib/pedagoModuleGate.js`). Lecture élève (fermée) : GET `/` et GET `/:idOrSlug`. Gestion
// (ouverte au gestionnaire) : ces deux lectures, brouillons compris, et toutes les écritures.
router.use(requirePedagoModuleOrManager('id_keys', 'Clés d’identification désactivées'));

async function tryResolveAuth(req) {
  try {
    const token = parseBearerToken(req);
    if (!token) return null;
    const claims = verifyJwtToken(token, JWT_SECRET);
    return await hydrateOptionalAuthFromTokenClaims(claims);
  } catch {
    return null;
  }
}
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,118}$/i;
/** Niveau d'une clé (`id_keys.niveau`) : référentiel partagé, sans l'université. */
const NIVEAUX = new Set(QUESTION_NIVEAU_ENUM.values);

function normalizeSlug(raw) {
  const s = normalizeOptionalString(raw);
  if (!s || !SLUG_RE.test(s)) return null;
  return s.toLowerCase();
}

function normalizeNiveau(raw) {
  const s = normalizeOptionalString(raw);
  return NIVEAUX.has(s) ? s : null;
}

function validateKeyGraph(bundle) {
  const coupletIds = new Set(bundle.couplets.map((c) => Number(c.id)));
  for (const couplet of bundle.couplets) {
    if (!couplet.leads || couplet.leads.length < 2) {
      return `Le couplet ${couplet.number} doit avoir au moins deux propositions`;
    }
    for (const lead of couplet.leads) {
      const err = assertLeadWellFormed(lead, coupletIds, { keyId: bundle.id });
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

    const auth = await tryResolveAuth(req);
    const forManager = hasPermission(auth, 'id_keys.manage');
    if (!byId.is_published && !forManager) {
      return res.status(404).json({ error: 'Clé introuvable' });
    }
    // Un renvoi « Pour aller plus loin » vers une clé non publiée est masqué aux élèves.
    const bundle = await loadKeyBundle(byId.id, { includeUnpublished: true, forManager });
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
    const bundle = await loadKeyBundle(result.insertId, {
      includeUnpublished: true,
      forManager: true,
    });
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
    let toolRequired = current.tool_required ?? null;
    if (req.body?.tool_required !== undefined || req.body?.toolRequired !== undefined) {
      const rawTools = req.body?.tool_required ?? req.body?.toolRequired;
      const list = Array.isArray(rawTools) ? rawTools : String(rawTools || '').split(',');
      const unknown = list
        .map((t) => String(t).trim())
        .filter((t) => t && !ID_KEY_TOOL_ENUM.values.includes(t));
      if (unknown.length) {
        return res.status(400).json({ error: `Matériel inconnu : ${unknown.join(', ')}` });
      }
      const tools = parseToolSet(list);
      toolRequired = tools.length ? tools.join(',') : null;
    }
    const safetyNote =
      req.body?.safety_note === undefined && req.body?.safetyNote === undefined
        ? (current.safety_note ?? null)
        : normalizeOptionalString(req.body?.safety_note ?? req.body?.safetyNote) || null;
    let isPublished = current.is_published;
    if (req.body?.is_published !== undefined || req.body?.isPublished !== undefined) {
      isPublished = Boolean(req.body?.is_published ?? req.body?.isPublished);
    }

    if (isPublished) {
      const bundle = await loadKeyBundle(id, { includeUnpublished: true, forManager: true });
      const graphErr = validateKeyGraph(bundle);
      if (graphErr) return res.status(400).json({ error: graphErr });
    }

    await execute(
      `UPDATE id_keys
          SET title = ?, description = ?, map_id = ?, scope_label = ?, niveau = ?,
              tool_required = ?, safety_note = ?, is_published = ?
        WHERE id = ?`,
      [
        title,
        description,
        mapId,
        scopeLabel,
        niveau,
        toolRequired,
        safetyNote,
        isPublished ? 1 : 0,
        id,
      ],
    );
    const bundle = await loadKeyBundle(id, { includeUnpublished: true, forManager: true });
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

/** Champs d'issue d'une proposition (migration 366). */
const OUTCOME_FIELD_ALIASES = [
  ['outcome'],
  ['clade_id', 'cladeId'],
  ['result_label', 'resultLabel'],
  ['next_key_id', 'nextKeyId'],
  ['group_plant_ids', 'groupPlantIds', 'group_plants'],
];

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

/** La proposition reçue précise-t-elle elle-même son issue groupe / clade / clé suivante ? */
function carriesOutcomeFields(raw) {
  return OUTCOME_FIELD_ALIASES.some((aliases) => aliases.some((k) => hasOwn(raw, k)));
}

/**
 * PUT /api/id-keys/:id/couplets/:coupletId/leads — remplace les propositions d'un couplet.
 * Corps : `{ leads: [{ id?, statement, hint?, image_url?, outcome?, next_couplet_id?, plant_id?,
 * clade_id?, result_label?, group_plant_ids?, next_key_id?, sort_order? }] }`.
 * Une proposition qui porte l'`id` d'une proposition existante du couplet sans préciser ses
 * champs d'issue (outcome, clade_id, result_label, group_plant_ids, next_key_id) les garde :
 * un ancien client ou l'outil MCP ne fait ainsi plus perdre groupes, clades et renvois.
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

    // Propositions actuelles du couplet, pour conserver les issues non renvoyées.
    const before = await loadKeyBundle(keyId, { includeUnpublished: true, forManager: true });
    const existingLeads = new Map(
      (before.couplets.find((c) => Number(c.id) === coupletId)?.leads || []).map((l) => [
        Number(l.id),
        l,
      ]),
    );

    const normalized = [];
    for (let i = 0; i < leadsIn.length; i += 1) {
      const raw = leadsIn[i] || {};
      const statement = normalizeOptionalString(raw.statement);
      const manip = findManipulationInvitation(statement);
      if (manip) return res.status(400).json({ error: manip });

      const previous = raw.id != null ? existingLeads.get(Number(raw.id)) : null;
      const merged = { ...raw };
      // Aide sous la proposition : conservée si le client ne l'envoie pas (outil MCP, ancien
      // client) — elle était effacée à chaque réécriture du couplet avant la migration 366.
      const hint =
        raw.hint === undefined ? previous?.hint || null : normalizeOptionalString(raw.hint) || null;
      if (previous && !carriesOutcomeFields(raw)) {
        // Issue lisible dans ce que le client envoie (couplet suivant ou espèce) ?
        const sentOutcome = resolveLeadOutcome({ ...raw, outcome: null });
        if (sentOutcome == null) {
          // Ni couplet ni espèce : c'est une feuille groupe / clade, on la garde entière.
          merged.outcome = previous.outcome;
          merged.clade_id = previous.clade_id;
          merged.result_label = previous.result_label;
          merged.group_plant_ids = previous.group_plant_ids;
          merged.next_key_id = previous.next_key_id;
        } else if (sentOutcome === 'espece') {
          merged.next_key_id = previous.next_key_id;
        }
      }
      const outcome = validateLeadOutcome(merged, { keyId });
      if (!outcome.ok) return res.status(400).json({ error: outcome.error });
      const f = outcome.fields;

      if (f.next_couplet_id != null) {
        if (!coupletIds.has(f.next_couplet_id)) {
          return res
            .status(400)
            .json({ error: 'Le couplet suivant doit appartenir à la même clé' });
        }
        if (f.next_couplet_id === coupletId) {
          return res
            .status(400)
            .json({ error: 'Une proposition ne peut pas renvoyer au même couplet' });
        }
      }
      if (f.plant_id != null) {
        const p = await queryOne('SELECT id FROM plants WHERE id = ?', [f.plant_id]);
        if (!p) return res.status(400).json({ error: `Espèce introuvable : ${f.plant_id}` });
      }
      for (const gid of f.group_plant_ids) {
        const p = await queryOne('SELECT id FROM plants WHERE id = ?', [gid]);
        if (!p) return res.status(400).json({ error: `Espèce introuvable : ${gid}` });
      }
      if (f.clade_id) {
        const c = await queryOne('SELECT id FROM clades WHERE id = ?', [f.clade_id]);
        if (!c) return res.status(400).json({ error: `Grand groupe introuvable : ${f.clade_id}` });
      }
      if (f.next_key_id != null) {
        const k = await queryOne('SELECT id FROM id_keys WHERE id = ?', [f.next_key_id]);
        if (!k) return res.status(400).json({ error: `Clé introuvable : ${f.next_key_id}` });
      }
      normalized.push({
        statement,
        hint,
        image_url: normalizeOptionalString(raw.image_url ?? raw.imageUrl) || null,
        ...f,
        sort_order: Number.isFinite(Number(raw.sort_order ?? i))
          ? Math.trunc(Number(raw.sort_order ?? i))
          : i,
      });
    }

    // Simuler le graphe pour détecter un cycle avant d'écrire
    const simulated = before.couplets.map((c) =>
      Number(c.id) === coupletId ? { ...c, leads: normalized } : c,
    );
    if (hasCoupletCycle(simulated)) {
      return res.status(400).json({ error: 'Ces propositions créeraient un cycle dans la clé' });
    }

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM id_key_leads WHERE couplet_id = ?', [coupletId]);
      for (const lead of normalized) {
        const inserted = await tx.execute(
          `INSERT INTO id_key_leads
             (couplet_id, sort_order, statement, hint, image_url, outcome, next_couplet_id,
              plant_id, clade_id, result_label, next_key_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            coupletId,
            lead.sort_order,
            lead.statement,
            lead.hint,
            lead.image_url,
            lead.outcome,
            lead.next_couplet_id,
            lead.plant_id,
            lead.clade_id,
            lead.result_label,
            lead.next_key_id,
          ],
        );
        const leadId = inserted?.insertId;
        for (let j = 0; j < lead.group_plant_ids.length; j += 1) {
          await tx.execute(
            `INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order) VALUES (?, ?, ?)`,
            [leadId, lead.group_plant_ids[j], j],
          );
        }
      }
    });

    const updated = await loadKeyBundle(keyId, { includeUnpublished: true, forManager: true });
    const coupletOut = updated.couplets.find((c) => Number(c.id) === coupletId);
    return res.json(coupletOut);
  }),
);

module.exports = router;
