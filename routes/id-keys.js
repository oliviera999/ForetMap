'use strict';

/**
 * Clés d'identification dichotomiques (migration 275).
 * Lecture publique des clés publiées ; édition sous `id_keys.manage`.
 * Une proposition garde son identifiant d'une écriture à l'autre (mise à jour en place) ;
 * une clé porte ses tutoriels « avant de commencer » (`id_key_tutorials`).
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
const { QUESTION_NIVEAU_ENUM, ID_KEY_TOOL_ENUM } = require('../lib/shared/pedagoEnums');
const { requirePedagoModuleOrManager } = require('../lib/pedagoModuleGate');
const {
  validateLeadOutcome,
  findManipulationInvitation,
  hasCoupletCycle,
  assertLeadWellFormed,
  mergeLeadInput,
} = require('../lib/idKeys');

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

/** Longueurs des colonnes `id_key_leads.image_credit` / `image_licence`. */
const IMAGE_CREDIT_MAX = 255;
const IMAGE_LICENCE_MAX = 64;
/** Plafond de tutoriels « avant de commencer » par clé. */
const KEY_TUTORIALS_MAX = 12;

/** Valeur du corps sous son nom SQL ou son alias camelCase ; `undefined` si absente. */
function bodyValue(body, snake, camel) {
  if (body?.[snake] !== undefined) return body[snake];
  return body?.[camel];
}

/**
 * Liste ordonnée d'identifiants de tutoriels (`tutorial_ids`), dédoublonnée et vérifiée.
 * @returns {Promise<{ ids: number[] } | { error: string }>}
 */
async function resolveTutorialIds(raw) {
  if (!Array.isArray(raw)) return { error: 'tutorial_ids doit être une liste d’identifiants' };
  const ids = [];
  for (const value of raw) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) return { error: `Tutoriel invalide : ${value}` };
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > KEY_TUTORIALS_MAX) {
    return { error: `Au plus ${KEY_TUTORIALS_MAX} tutoriels par clé` };
  }
  for (const id of ids) {
    const t = await queryOne('SELECT id FROM tutorials WHERE id = ?', [id]);
    if (!t) return { error: `Tutoriel introuvable : ${id}` };
  }
  return { ids };
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

/**
 * GET /api/id-keys — publiées ; `?all=1` + `id_keys.manage` pour inclure les brouillons ;
 * `?tutorial_id=N` : seulement les clés qui proposent ce tutoriel « avant de commencer ».
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const wantAll = String(req.query?.all || '') === '1';
    let includeDrafts = false;
    if (wantAll) {
      const auth = await tryResolveAuth(req);
      includeDrafts = hasPermission(auth, 'id_keys.manage');
    }
    const where = [];
    const params = [];
    if (!includeDrafts) where.push('k.is_published = 1');
    const rawTutorial = normalizeOptionalString(req.query?.tutorial_id);
    if (rawTutorial) {
      const tutorialId = Number(rawTutorial);
      if (!Number.isInteger(tutorialId) || tutorialId <= 0) {
        return res.status(400).json({ error: 'Tutoriel invalide' });
      }
      where.push(
        'EXISTS (SELECT 1 FROM id_key_tutorials kt WHERE kt.key_id = k.id AND kt.tutorial_id = ?)',
      );
      params.push(tutorialId);
    }
    const rows = await queryAll(
      `SELECT k.id, k.slug, k.title, k.description, k.map_id, k.scope_label, k.niveau,
              k.is_published, k.updated_at
         FROM id_keys k
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY k.title ASC`,
      params,
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
    const allowsMultiplePaths = Boolean(
      bodyValue(req.body, 'allows_multiple_paths', 'allowsMultiplePaths'),
    );
    if (!slug) return res.status(400).json({ error: 'Slug invalide' });
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (mapId) {
      const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
      if (!map) return res.status(400).json({ error: 'Carte introuvable' });
    }
    const existing = await queryOne('SELECT id FROM id_keys WHERE slug = ?', [slug]);
    if (existing) return res.status(409).json({ error: 'Ce slug existe déjà' });

    const result = await execute(
      `INSERT INTO id_keys
         (slug, title, description, map_id, scope_label, niveau, allows_multiple_paths,
          is_published, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        slug,
        title,
        description,
        mapId,
        scopeLabel,
        niveau,
        allowsMultiplePaths ? 1 : 0,
        req.auth?.userId || null,
      ],
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

/**
 * PUT /api/id-keys/:id — métadonnées, publication, chemins multiples voulus
 * (`allows_multiple_paths`) et tutoriels « avant de commencer » (`tutorial_ids`, liste
 * complète et ordonnée ; absente : liens inchangés).
 */
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
    const rawMultiple = bodyValue(req.body, 'allows_multiple_paths', 'allowsMultiplePaths');
    const allowsMultiplePaths =
      rawMultiple === undefined ? Boolean(current.allows_multiple_paths) : Boolean(rawMultiple);
    const rawTutorials = bodyValue(req.body, 'tutorial_ids', 'tutorialIds');
    let tutorialIds = null;
    if (rawTutorials !== undefined) {
      const resolved = await resolveTutorialIds(rawTutorials);
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      tutorialIds = resolved.ids;
    }

    if (isPublished) {
      const bundle = await loadKeyBundle(id, { includeUnpublished: true, forManager: true });
      const graphErr = validateKeyGraph(bundle);
      if (graphErr) return res.status(400).json({ error: graphErr });
    }

    await withTransaction(async (tx) => {
      await tx.execute(
        `UPDATE id_keys
            SET title = ?, description = ?, map_id = ?, scope_label = ?, niveau = ?,
                tool_required = ?, safety_note = ?, allows_multiple_paths = ?, is_published = ?
          WHERE id = ?`,
        [
          title,
          description,
          mapId,
          scopeLabel,
          niveau,
          toolRequired,
          safetyNote,
          allowsMultiplePaths ? 1 : 0,
          isPublished ? 1 : 0,
          id,
        ],
      );
      if (tutorialIds) {
        // Lignes de jointure sans identité propre : la liste reçue remplace la précédente.
        await tx.execute('DELETE FROM id_key_tutorials WHERE key_id = ?', [id]);
        for (let i = 0; i < tutorialIds.length; i += 1) {
          await tx.execute(
            'INSERT INTO id_key_tutorials (key_id, tutorial_id, sort_order) VALUES (?, ?, ?)',
            [id, tutorialIds[i], i],
          );
        }
      }
    });
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
    // Clé publiée : la FK `next_couplet_id … ON DELETE SET NULL` laisserait des propositions
    // sans issue devant les élèves, et `validateKeyGraph` ne tourne qu'à la publication
    // (audit du 19/11/2026, P9). On refuse donc la suppression d'un couplet encore visé par
    // une proposition d'un autre couplet, et celle du couplet de départ (n° 1).
    const key = await queryOne('SELECT is_published FROM id_keys WHERE id = ?', [keyId]);
    if (key?.is_published) {
      if (Number(couplet.number) === 1) {
        return res.status(409).json({
          error: 'Le couplet de départ d’une clé publiée ne peut pas être supprimé',
        });
      }
      const referrers = await queryAll(
        `SELECT DISTINCT c.number
           FROM id_key_leads l
           JOIN id_key_couplets c ON c.id = l.couplet_id
          WHERE l.next_couplet_id = ? AND l.couplet_id <> ?
          ORDER BY c.number ASC`,
        [coupletId, coupletId],
      );
      if (referrers.length) {
        const numbers = referrers.map((r) => r.number).join(', ');
        return res.status(409).json({
          error: `Couplet encore visé par une proposition (couplet ${numbers}) : redirige-la d’abord`,
          referencedBy: referrers.map((r) => Number(r.number)),
        });
      }
    }
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
 * PUT /api/id-keys/:id/couplets/:coupletId/leads — propositions d'un couplet (liste complète).
 * Corps : `{ leads: [{ id?, statement?, hint?, image_url?, image_credit?, image_licence?,
 * outcome?, next_couplet_id?, plant_id?, clade_id?, result_label?, group_plant_ids?,
 * next_key_id?, sort_order? }] }`.
 *
 * - une proposition renvoyée avec son `id` est **mise à jour en place** : elle garde son
 *   identifiant ; un champ absent n'efface rien (`mergeLeadInput`, `lib/idKeys.js`) ;
 * - une proposition sans `id` est créée ;
 * - une proposition du couplet absente de la liste est supprimée.
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

    const before = await loadKeyBundle(keyId, { includeUnpublished: true, forManager: true });
    const coupletIds = new Set(before.couplets.map((c) => Number(c.id)));
    const existingLeads = new Map(
      (before.couplets.find((c) => Number(c.id) === coupletId)?.leads || []).map((l) => [
        Number(l.id),
        l,
      ]),
    );

    const normalized = [];
    const keptIds = new Set();
    for (let i = 0; i < leadsIn.length; i += 1) {
      const raw = leadsIn[i] || {};
      let previous = null;
      if (raw.id != null) {
        const leadId = Number(raw.id);
        previous = existingLeads.get(leadId) || null;
        if (!previous) {
          return res.status(400).json({
            error: `Proposition ${raw.id} introuvable dans ce couplet : omettre « id » pour en créer une`,
          });
        }
        if (keptIds.has(leadId)) {
          return res.status(400).json({ error: `Proposition ${raw.id} envoyée deux fois` });
        }
        keptIds.add(leadId);
      }
      const merged = mergeLeadInput(raw, previous);
      const statement = normalizeOptionalString(merged.statement);
      const manip = findManipulationInvitation(statement);
      if (manip) return res.status(400).json({ error: manip });

      const imageUrl = normalizeOptionalString(merged.image_url);
      // Le crédit suit l'image : sans image, ni crédit ni licence.
      const imageCredit = imageUrl ? normalizeOptionalString(merged.image_credit) : null;
      const imageLicence = imageUrl ? normalizeOptionalString(merged.image_licence) : null;
      if (imageCredit && imageCredit.length > IMAGE_CREDIT_MAX) {
        return res
          .status(400)
          .json({ error: `Crédit de l’image trop long (${IMAGE_CREDIT_MAX} caractères au plus)` });
      }
      if (imageLicence && imageLicence.length > IMAGE_LICENCE_MAX) {
        return res.status(400).json({
          error: `Licence de l’image trop longue (${IMAGE_LICENCE_MAX} caractères au plus)`,
        });
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
      for (const plantId of [f.plant_id, ...f.group_plant_ids]) {
        if (plantId == null) continue;
        const p = await queryOne('SELECT id FROM plants WHERE id = ?', [plantId]);
        if (!p) return res.status(400).json({ error: `Espèce introuvable : ${plantId}` });
      }
      if (f.clade_id) {
        const c = await queryOne('SELECT id FROM clades WHERE id = ?', [f.clade_id]);
        if (!c) return res.status(400).json({ error: `Grand groupe introuvable : ${f.clade_id}` });
      }
      if (f.next_key_id != null) {
        const k = await queryOne('SELECT id FROM id_keys WHERE id = ?', [f.next_key_id]);
        if (!k) return res.status(400).json({ error: `Clé introuvable : ${f.next_key_id}` });
      }
      const sortOrder = Number(raw.sort_order ?? i);
      normalized.push({
        id: previous ? Number(previous.id) : null,
        statement,
        hint: normalizeOptionalString(merged.hint),
        image_url: imageUrl,
        image_credit: imageCredit,
        image_licence: imageLicence,
        ...f,
        sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : i,
      });
    }

    // Simuler le graphe pour détecter un cycle avant d'écrire
    const simulated = before.couplets.map((c) =>
      Number(c.id) === coupletId ? { ...c, leads: normalized } : c,
    );
    if (hasCoupletCycle(simulated)) {
      return res.status(400).json({ error: 'Ces propositions créeraient un cycle dans la clé' });
    }

    const removedIds = [...existingLeads.keys()].filter((leadId) => !keptIds.has(leadId));
    await withTransaction(async (tx) => {
      for (const leadId of removedIds) {
        await tx.execute('DELETE FROM id_key_leads WHERE id = ? AND couplet_id = ?', [
          leadId,
          coupletId,
        ]);
      }
      for (const lead of normalized) {
        const values = [
          lead.sort_order,
          lead.statement,
          lead.hint,
          lead.image_url,
          lead.image_credit,
          lead.image_licence,
          lead.outcome,
          lead.next_couplet_id,
          lead.plant_id,
          lead.clade_id,
          lead.result_label,
          lead.next_key_id,
        ];
        let leadId = lead.id;
        if (leadId) {
          // Une seule instruction : la contrainte `chk_idkey_lead_outcome` est évaluée sur la
          // ligne finale, jamais sur un état intermédiaire.
          await tx.execute(
            `UPDATE id_key_leads
                SET sort_order = ?, statement = ?, hint = ?, image_url = ?, image_credit = ?,
                    image_licence = ?, outcome = ?, next_couplet_id = ?, plant_id = ?,
                    clade_id = ?, result_label = ?, next_key_id = ?
              WHERE id = ? AND couplet_id = ?`,
            [...values, leadId, coupletId],
          );
          await tx.execute('DELETE FROM id_key_lead_plants WHERE lead_id = ?', [leadId]);
        } else {
          const inserted = await tx.execute(
            `INSERT INTO id_key_leads
               (couplet_id, sort_order, statement, hint, image_url, image_credit, image_licence,
                outcome, next_couplet_id, plant_id, clade_id, result_label, next_key_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [coupletId, ...values],
          );
          leadId = inserted?.insertId;
        }
        // Espèces candidates : lignes de jointure sans identité propre, réécrites.
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
