'use strict';

/**
 * Parcours de carte (`/api/map-routes`, lot 8 du plan de convergence —
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * Un parcours est une liste ordonnée de lieux : « les cinq endroits à voir », « le tour des
 * nouveaux professeurs ». Aucune validation, aucune progression enregistrée côté serveur —
 * la position dans le parcours vit sur l'appareil.
 *
 * Lecture **publique** (les parcours publiés, filtrés par surface) ; écriture réservée à
 * `zones.manage`, comme les lieux qu'ils enchaînent. L'export PDF imprime la liste des étapes
 * et un **QR code** vers le lien profond, à afficher à l'accueil.
 */

const express = require('express');
const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');
// `qrcode` (MIT, https://github.com/soldair/node-qrcode) : générateur de QR code sans service
// tiers — l'affiche d'un établissement ne doit dépendre d'aucune API externe.
const QRCode = require('qrcode');

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { getSettingValue } = require('../lib/settings');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { logAudit } = require('../lib/auditLog');
const { readSurfaceQuery, normalizeSurfaceInput } = require('../lib/locationSurfaces');
const { requirePlanAccess } = require('../lib/planAccess');
const {
  ROUTE_AUDIENCE_MAX,
  ROUTE_TITLE_MAX,
  attachStepsToRoutes,
  normalizeRouteDescription,
  normalizeRouteSteps,
  resolveRouteBaseUrl,
  routeDeepLink,
  serializeRouteRow,
  serializeSurfaceSet,
  slugifyRouteTitle,
} = require('../lib/mapRoutes');

const router = express.Router();

const ROUTE_SELECT = `SELECT id, map_id, slug, title, description, audience, surfaces,
  is_published, sort_order
  FROM map_routes`;

const ROUTE_ORDER = ' ORDER BY sort_order ASC, title ASC';

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

/** Charge les parcours (avec leurs étapes) répondant à une clause SQL déjà paramétrée. */
async function loadRoutes(where, params) {
  const rows = await queryAll(
    `${ROUTE_SELECT}${where ? ` WHERE ${where}` : ''}${ROUTE_ORDER}`,
    params,
  );
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const stepRows = await queryAll(
    `SELECT route_id, position, target_type, target_id, step_title, step_text
       FROM map_route_steps
      WHERE route_id IN (${placeholders})
      ORDER BY route_id, position`,
    ids,
  );
  return attachStepsToRoutes(rows.map(serializeRouteRow), stepRows);
}

/** Remplace les étapes d'un parcours (une transaction : jamais de parcours à moitié réécrit). */
async function replaceSteps(routeId, steps) {
  await withTransaction(async (tx) => {
    await tx.execute('DELETE FROM map_route_steps WHERE route_id = ?', [routeId]);
    for (const step of steps) {
      await tx.execute(
        `INSERT INTO map_route_steps (route_id, position, target_type, target_id, step_title, step_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [routeId, step.position, step.target_type, step.target_id, step.step_title, step.step_text],
      );
    }
  });
}

/**
 * Les étapes visent-elles des lieux **réels de cette carte** ?
 *
 * Le couple `target_type` / `target_id` est polymorphe : aucune contrainte de clé étrangère ne
 * peut le tenir. Sans ce contrôle, l'API acceptait (201) un parcours de soixante étapes
 * pointant vers des identifiants inventés ou vers les lieux d'une autre carte — un parcours
 * qui s'affiche vide, sans que personne ait été prévenu
 * (`docs/AUDIT_PARCOURS_2026-09.md` §2.7). L'éditeur s'en garde déjà, mais il n'est pas la
 * seule porte.
 *
 * @param {string} mapId carte du parcours.
 * @param {Array<{ target_type: string, target_id: string }>} steps étapes déjà normalisées.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function checkStepTargets(mapId, steps) {
  if (!steps || steps.length === 0) return { ok: true };
  const idsOf = (type) => [
    ...new Set(steps.filter((s) => s.target_type === type).map((s) => s.target_id)),
  ];
  const zoneIds = idsOf('zone');
  const markerIds = idsOf('marker');
  const [zones, markers] = await Promise.all([
    zoneIds.length
      ? queryAll(
          `SELECT id FROM zones WHERE map_id = ? AND id IN (${zoneIds.map(() => '?').join(',')})`,
          [mapId, ...zoneIds],
        )
      : [],
    markerIds.length
      ? queryAll(
          `SELECT id FROM map_markers WHERE map_id = ? AND id IN (${markerIds.map(() => '?').join(',')})`,
          [mapId, ...markerIds],
        )
      : [],
  ]);
  const known = new Set([
    ...zones.map((row) => `zone:${row.id}`),
    ...markers.map((row) => `marker:${row.id}`),
  ]);
  for (const [index, step] of steps.entries()) {
    if (known.has(`${step.target_type}:${step.target_id}`)) continue;
    return {
      ok: false,
      error: `Étape ${index + 1} : ce lieu n’existe pas sur cette carte`,
    };
  }
  return { ok: true };
}

/**
 * Catalogue **public** : parcours publiés, filtrables par carte et par surface.
 *
 * Derrière la **garde d'accès du plan** (`lib/planAccess.js`) : quand un établissement ferme
 * son plan par un code, les parcours se ferment avec lui. Sans cette garde, la liste des
 * parcours — titres, publics visés, descriptions, textes d'étapes — restait lisible sans
 * laissez-passer (`docs/AUDIT_PARCOURS_2026-09.md` §2.2).
 */
router.get(
  '/',
  requirePlanAccess,
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const surfaceQuery = readSurfaceQuery(req.query.surface);
    if (!surfaceQuery.ok) return res.status(400).json({ error: surfaceQuery.error });

    const where = ['is_published = 1'];
    const params = [];
    if (mapId) {
      where.push('map_id = ?');
      params.push(mapId);
    }
    if (surfaceQuery.value) {
      where.push('FIND_IN_SET(?, surfaces) > 0');
      params.push(surfaceQuery.value);
    }
    res.json(await loadRoutes(where.join(' AND '), params));
  }),
);

/** Vue de gestion : inclut les brouillons (permission `zones.manage`). */
router.get(
  '/manage',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    res.json(await loadRoutes(mapId ? 'map_id = ?' : '', mapId ? [mapId] : []));
  }),
);

/**
 * Détail **public** par identifiant ou par slug (le lien profond porte le slug).
 *
 * Ne sert que les parcours **publiés** : un brouillon n'existe que dans la vue de gestion,
 * c'est ce qu'annoncent l'écran de réglages et `docs/reference/`. Le repli d'origine
 * (« le publié, sinon le premier venu ») livrait le brouillon à un visiteur anonyme qui
 * devinait le slug — celui-ci dérive du titre (`docs/AUDIT_PARCOURS_2026-09.md` §2.1).
 *
 * `?map_id=` lève l'ambiguïté quand deux cartes portent le même slug : il n'est unique que
 * par carte.
 */
router.get(
  '/:idOrSlug',
  requirePlanAccess,
  asyncHandler(async (req, res) => {
    const key = String(req.params.idOrSlug || '').trim();
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    const where = ['is_published = 1', '(id = ? OR slug = ?)'];
    const params = [key, key];
    if (mapId) {
      where.push('map_id = ?');
      params.push(mapId);
    }
    const [route] = await loadRoutes(where.join(' AND '), params);
    if (!route) return res.status(404).json({ error: 'Parcours introuvable' });
    res.json(route);
  }),
);

async function slugTaken(mapId, slug, exceptId = null) {
  const row = await queryOne(
    `SELECT id FROM map_routes WHERE map_id = ? AND slug = ?${exceptId ? ' AND id <> ?' : ''} LIMIT 1`,
    exceptId ? [mapId, slug, exceptId] : [mapId, slug],
  );
  return !!row;
}

router.post(
  '/',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (title.length > ROUTE_TITLE_MAX) {
      return res.status(400).json({ error: `Titre trop long (${ROUTE_TITLE_MAX} maximum)` });
    }
    const mapId = String(req.body?.map_id || '').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const slug = slugifyRouteTitle(req.body?.slug || title);
    if (!slug) return res.status(400).json({ error: 'Slug invalide (lettres ou chiffres requis)' });
    if (await slugTaken(mapId, slug)) {
      return res.status(409).json({ error: 'Un parcours porte déjà ce slug sur cette carte' });
    }
    const surfaces = normalizeSurfaceInput(req.body?.surfaces);
    if (!surfaces.ok) return res.status(400).json({ error: surfaces.error });
    const steps = normalizeRouteSteps(req.body?.steps);
    if (!steps.ok) return res.status(400).json({ error: steps.error });
    const targets = await checkStepTargets(mapId, steps.value);
    if (!targets.ok) return res.status(400).json({ error: targets.error });
    const description = normalizeRouteDescription(req.body?.description);
    if (!description.ok) return res.status(400).json({ error: description.error });

    const sortOrderRaw = parseInt(req.body?.sort_order, 10);
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO map_routes
        (id, map_id, slug, title, description, audience, surfaces, is_published, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mapId,
        slug,
        title,
        description.value === undefined ? null : description.value,
        String(req.body?.audience || '')
          .trim()
          .slice(0, ROUTE_AUDIENCE_MAX),
        serializeSurfaceSet(surfaces.value === null ? ['plan'] : surfaces.value),
        req.body?.is_published ? 1 : 0,
        Number.isFinite(sortOrderRaw) ? sortOrderRaw : 100,
      ],
    );
    if (steps.value) await replaceSteps(id, steps.value);
    await logAudit('map_route_create', 'map_route', id, 'Parcours créé', {
      req,
      payload: { title, slug, map_id: mapId },
    });
    const [created] = await loadRoutes('id = ?', [id]);
    res.status(201).json(created);
  }),
);

/**
 * Modification. `map_id` n'est **pas** modifiable : un parcours reste sur la carte où il est
 * né, ses étapes ne pointent que vers les lieux de cette carte. Un `map_id` envoyé ici est
 * ignoré (documenté dans `docs/API.md`) ; pour déplacer un parcours, on le recrée.
 */
router.put(
  '/:id',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const current = await queryOne(`${ROUTE_SELECT} WHERE id = ? LIMIT 1`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Parcours introuvable' });

    const title =
      req.body?.title !== undefined ? String(req.body.title).trim() : String(current.title);
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (title.length > ROUTE_TITLE_MAX) {
      return res.status(400).json({ error: `Titre trop long (${ROUTE_TITLE_MAX} maximum)` });
    }
    const slug =
      req.body?.slug !== undefined ? slugifyRouteTitle(req.body.slug) : String(current.slug);
    if (!slug) return res.status(400).json({ error: 'Slug invalide (lettres ou chiffres requis)' });
    if (await slugTaken(current.map_id, slug, current.id)) {
      return res.status(409).json({ error: 'Un parcours porte déjà ce slug sur cette carte' });
    }
    const surfaces = normalizeSurfaceInput(req.body?.surfaces);
    if (!surfaces.ok) return res.status(400).json({ error: surfaces.error });
    const steps = normalizeRouteSteps(req.body?.steps);
    if (!steps.ok) return res.status(400).json({ error: steps.error });
    const targets = await checkStepTargets(String(current.map_id), steps.value);
    if (!targets.ok) return res.status(400).json({ error: targets.error });
    const description = normalizeRouteDescription(req.body?.description);
    if (!description.ok) return res.status(400).json({ error: description.error });
    const sortOrderRaw = parseInt(req.body?.sort_order, 10);

    await execute(
      `UPDATE map_routes
          SET slug = ?, title = ?, description = ?, audience = ?, surfaces = ?,
              is_published = ?, sort_order = ?
        WHERE id = ?`,
      [
        slug,
        title,
        description.value === undefined ? current.description : description.value,
        req.body?.audience !== undefined
          ? String(req.body.audience).trim().slice(0, ROUTE_AUDIENCE_MAX)
          : current.audience,
        serializeSurfaceSet(surfaces.value === null ? current.surfaces : surfaces.value),
        req.body?.is_published !== undefined
          ? req.body.is_published
            ? 1
            : 0
          : current.is_published,
        Number.isFinite(sortOrderRaw) ? sortOrderRaw : current.sort_order,
        current.id,
      ],
    );
    // `steps` omis = étapes conservées ; fourni = remplacement complet (l'éditeur envoie
    // toujours la liste entière après un glisser-déposer).
    if (steps.value) await replaceSteps(current.id, steps.value);
    await logAudit('map_route_update', 'map_route', current.id, 'Parcours modifié', {
      req,
      payload: { title, slug },
    });
    const [updated] = await loadRoutes('id = ?', [current.id]);
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const current = await queryOne('SELECT id, map_id, title FROM map_routes WHERE id = ?', [
      req.params.id,
    ]);
    if (!current) return res.status(404).json({ error: 'Parcours introuvable' });
    // Les étapes partent en cascade (contrainte de clé étrangère).
    await execute('DELETE FROM map_routes WHERE id = ?', [current.id]);
    await logAudit('map_route_delete', 'map_route', current.id, 'Parcours supprimé', {
      req,
      payload: { title: current.title },
    });
    res.json({ ok: true });
  }),
);

/** Libellé d'une étape : son titre propre, sinon le nom du lieu visé. */
async function resolveStepLabels(steps) {
  const zoneIds = steps.filter((s) => s.target_type === 'zone').map((s) => s.target_id);
  const markerIds = steps.filter((s) => s.target_type === 'marker').map((s) => s.target_id);
  const [zones, markers] = await Promise.all([
    zoneIds.length
      ? queryAll(`SELECT id, name FROM zones WHERE id IN (${zoneIds.map(() => '?').join(',')})`, [
          ...zoneIds,
        ])
      : [],
    markerIds.length
      ? queryAll(
          `SELECT id, label FROM map_markers WHERE id IN (${markerIds.map(() => '?').join(',')})`,
          [...markerIds],
        )
      : [],
  ]);
  const names = new Map();
  for (const zone of zones) names.set(`zone:${zone.id}`, String(zone.name || ''));
  for (const marker of markers) names.set(`marker:${marker.id}`, String(marker.label || ''));
  return steps.map((step) => ({
    ...step,
    place_name: names.get(`${step.target_type}:${step.target_id}`) || '',
  }));
}

/**
 * Export PDF d'un parcours : une page, la liste des étapes, et un **QR code** vers le lien
 * profond du plan. Pensé pour être imprimé et affiché à l'accueil — un visiteur scanne et
 * arrive directement sur le parcours, sans rien installer.
 */
router.get(
  '/:id/pdf',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const [route] = await loadRoutes('id = ?', [req.params.id]);
    if (!route) return res.status(404).json({ error: 'Parcours introuvable' });
    const steps = await resolveStepLabels(route.steps);

    // Le QR code doit mener au **plan**, pas à la console d'où l'export est lancé : on prend
    // d'abord `?base_url=`, puis le réglage `ui.plan.public_base_url`, et seulement en dernier
    // recours l'hôte de la requête.
    const baseUrl = resolveRouteBaseUrl({
      query: req.query.base_url,
      setting: await getSettingValue('ui.plan.public_base_url', ''),
      request: `${req.protocol}://${req.get('host')}`,
    });
    const link = routeDeepLink(baseUrl, route.slug);
    const qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 320 });
    // Une affiche part vivre hors de l'application : on garde trace de qui l'a tirée, et vers
    // quel lien, pour retrouver l'origine d'un QR code qui traîne à l'accueil.
    await logAudit('map_route_pdf_export', 'map_route', route.id, 'Affiche PDF exportée', {
      req,
      payload: { title: route.title, slug: route.slug, link },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="parcours-${route.slug || route.id}.pdf"`,
    );
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.pipe(res);

    doc.fontSize(22).text(route.title, { align: 'left' });
    if (route.audience) doc.moveDown(0.2).fontSize(12).fillColor('#4f5f55').text(route.audience);
    if (route.description)
      doc.moveDown(0.4).fontSize(11).fillColor('#1f2a22').text(route.description);

    doc.moveDown(1).fillColor('#1f2a22').fontSize(14).text('Étapes');
    doc.moveDown(0.3);
    steps.forEach((step, index) => {
      const heading = step.step_title || step.place_name || `Étape ${index + 1}`;
      doc.fontSize(12).text(`${index + 1}. ${heading}`);
      if (step.place_name && step.step_title && step.place_name !== step.step_title) {
        doc.fontSize(10).fillColor('#4f5f55').text(`    ${step.place_name}`);
      }
      if (step.step_text) doc.fontSize(10).fillColor('#4f5f55').text(`    ${step.step_text}`);
      doc.fillColor('#1f2a22').moveDown(0.3);
    });
    if (steps.length === 0) {
      doc.fontSize(11).fillColor('#4f5f55').text('Ce parcours n’a pas encore d’étape.');
    }

    doc.moveDown(1).fillColor('#1f2a22').fontSize(12).text('Ouvrir ce parcours sur un téléphone :');
    doc.fontSize(10).fillColor('#2d6a4f').text(link);
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    doc.image(qrBuffer, { width: 160 });
    doc.end();
  }),
);

module.exports = router;
