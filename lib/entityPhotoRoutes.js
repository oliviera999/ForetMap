'use strict';

/**
 * Fabrique des 5 routes « galerie photos » d'une entité de carte (zone ou repère) :
 * GET liste, PUT reorder, GET :pid/data, POST ajout, DELETE suppression.
 *
 * Extraction à comportement STRICTEMENT identique des blocs dupliqués de
 * routes/zones.js et routes/map.js (audit : ~250 lignes dupliquées, mêmes flux,
 * seuls varient table, colonne FK, permission, messages, préfixe d'upload,
 * sérialiseur et clés d'événement temps réel).
 */

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('./asyncHandler');
const { emitGardenChanged } = require('./realtime');
const { saveBase64ToDisk, getAbsolutePath } = require('./uploads');
const {
  generateMapPhotoThumbFromMainRelativePath,
  deleteMapPhotoMainAndThumb,
} = require('./imageThumb');
const { sendFilePublicImageOptions } = require('./httpImageCache');
const { z, validate } = require('./validate');

// O7 — reorder : remplace la garde manuelle
// `const raw = req.body?.photo_ids ?? req.body?.ordered_ids; if (!Array.isArray(raw)) -> 400`.
// Le refine est au niveau racine (path vide) pour que `formatZodError` renvoie exactement le
// message d'origine (sans préfixe de chemin) et tolère un corps null/undefined comme l'opérateur
// `?.` d'origine. Le corps n'est PAS transformé : le handler continue de lire/coercer lui-même
// `req.body?.photo_ids ?? req.body?.ordered_ids` (coercition permissive des éléments inchangée),
// puis applique les vérifications métier restantes (longueur, appartenance, doublons).
const reorderPhotosBodySchema = z
  .object({ photo_ids: z.unknown().optional(), ordered_ids: z.unknown().optional() })
  .passthrough()
  .refine((body) => Array.isArray(body && (body.photo_ids ?? body.ordered_ids)), {
    message: 'Liste photo_ids (ou ordered_ids) requise',
  });

// O7 — ajout : remplace la garde manuelle `if (!image_data) -> 400 'Image requise'`.
// Le refine est au niveau racine pour que `formatZodError` renvoie 'Image requise' tel quel et
// tolère un corps null/undefined (déstructuration `const { image_data } = req.body` exigeait déjà
// un corps objet). Le corps n'est PAS transformé : le handler continue de lire `req.body`
// (image_data + caption) sans changement.
const addPhotoBodySchema = z
  .object({ image_data: z.unknown().optional() })
  .passthrough()
  .refine((body) => !!(body && body.image_data), { message: 'Image requise' });

/**
 * Enregistre les routes photos sur `router`.
 *
 * @param {import('express').Router} router
 * @param {object} cfg
 * @param {string} cfg.basePath           Préfixe de montage ('' pour zones, '/markers' pour repères).
 * @param {string} cfg.permission         Permission RBAC des mutations (`zones.manage` / `map.manage_markers`).
 * @param {string} cfg.entityTable        Table de l'entité (`zones` / `map_markers`).
 * @param {string} cfg.entityNotFound     Message 404 entité (`Zone introuvable` / `Repère introuvable`).
 * @param {string} cfg.photoTable         Table des photos (`zone_photos` / `marker_photos`).
 * @param {string} cfg.fkColumn           Colonne FK vers l'entité (`zone_id` / `marker_id`).
 * @param {string} cfg.reorderAllMessage  Message 400 « liste exhaustive » (libellé zone/repère conservé).
 * @param {string} cfg.uploadDirPrefix    Dossier uploads (`zones` / `markers`).
 * @param {(row: object, entityId: string) => object} cfg.serializeRow
 * @param {(imagePath: string, entityId: string, photoId: string) => string|null} cfg.redirectPublicDataUrl
 * @param {string} cfg.emitKey            Clé d'identifiant dans l'événement temps réel (`zoneId` / `markerId`).
 * @param {{ reorder: string, add: string, delete: string }} cfg.emitReasons
 */
function registerEntityPhotoRoutes(router, cfg) {
  const {
    basePath,
    permission,
    entityTable,
    entityNotFound,
    photoTable,
    fkColumn,
    reorderAllMessage,
    uploadDirPrefix,
    serializeRow,
    redirectPublicDataUrl,
    emitKey,
    emitReasons,
  } = cfg;

  router.get(
    `${basePath}/:id/photos`,
    asyncHandler(async (req, res) => {
      const entityId = String(req.params.id || '').trim();
      const photos = await queryAll(
        `SELECT id, ${fkColumn}, caption, sort_order, uploaded_at, image_path FROM ${photoTable} WHERE ${fkColumn}=? ORDER BY sort_order ASC, id ASC`,
        [entityId],
      );
      res.json(photos.map((p) => serializeRow(p, entityId)));
    }),
  );

  router.put(
    `${basePath}/:id/photos/reorder`,
    requirePermission(permission),
    validate({ body: reorderPhotosBodySchema }),
    asyncHandler(async (req, res) => {
      const entityId = String(req.params.id || '').trim();
      const entity = await queryOne(`SELECT id, map_id FROM ${entityTable} WHERE id = ?`, [
        entityId,
      ]);
      if (!entity) return res.status(404).json({ error: entityNotFound });
      const raw = req.body?.photo_ids ?? req.body?.ordered_ids;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ error: 'Liste photo_ids (ou ordered_ids) requise' });
      }
      const photoIds = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      const rows = await queryAll(`SELECT id FROM ${photoTable} WHERE ${fkColumn} = ?`, [entityId]);
      const existing = rows.map((r) => r.id);
      if (photoIds.length !== existing.length || existing.length === 0) {
        return res.status(400).json({ error: reorderAllMessage });
      }
      const set = new Set(existing);
      for (const id of photoIds) {
        if (!set.has(id)) return res.status(400).json({ error: 'Identifiant de photo invalide' });
      }
      if (new Set(photoIds).size !== photoIds.length) {
        return res.status(400).json({ error: 'photo_ids en double' });
      }
      await withTransaction(async (tx) => {
        for (let i = 0; i < photoIds.length; i += 1) {
          await tx.execute(
            `UPDATE ${photoTable} SET sort_order = ? WHERE id = ? AND ${fkColumn} = ?`,
            [i, photoIds[i], entityId],
          );
        }
      });
      emitGardenChanged({ reason: emitReasons.reorder, [emitKey]: entityId, mapId: entity.map_id });
      res.json({ ok: true });
    }),
  );

  router.get(
    `${basePath}/:id/photos/:pid/data`,
    requireAuth,
    asyncHandler(async (req, res) => {
      const entityId = String(req.params.id || '').trim();
      const p = await queryOne(
        `SELECT image_path FROM ${photoTable} WHERE id=? AND ${fkColumn}=?`,
        [req.params.pid, entityId],
      );
      if (!p) return res.status(404).json({ error: 'Photo introuvable' });
      if (p.image_path) {
        const redirectTo = redirectPublicDataUrl(p.image_path, entityId, req.params.pid);
        if (redirectTo) return res.redirect(302, redirectTo);
        const absolutePath = getAbsolutePath(p.image_path);
        return res.sendFile(absolutePath, sendFilePublicImageOptions(), (err) => {
          if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
        });
      }
      return res.status(404).json({ error: 'Aucune image' });
    }),
  );

  router.post(
    `${basePath}/:id/photos`,
    requirePermission(permission),
    validate({ body: addPhotoBodySchema }),
    asyncHandler(async (req, res) => {
      let photoId = null;
      const entity = await queryOne(`SELECT * FROM ${entityTable} WHERE id=?`, [req.params.id]);
      if (!entity) return res.status(404).json({ error: entityNotFound });
      const { image_data, caption } = req.body;
      if (!image_data) return res.status(400).json({ error: 'Image requise' });
      const nextSortRow = await queryOne(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${photoTable} WHERE ${fkColumn} = ?`,
        [req.params.id],
      );
      const sortOrder = Number(nextSortRow?.n) >= 0 ? Number(nextSortRow.n) : 0;
      const result = await execute(
        `INSERT INTO ${photoTable} (${fkColumn}, image_path, caption, sort_order, uploaded_at) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, null, caption || '', sortOrder, new Date().toISOString()],
      );
      photoId = result.insertId;
      const relativePath = `${uploadDirPrefix}/${req.params.id}/${photoId}.jpg`;
      try {
        saveBase64ToDisk(relativePath, image_data);
      } catch (fileErr) {
        await execute(`DELETE FROM ${photoTable} WHERE id = ?`, [photoId]);
        throw fileErr;
      }
      await execute(`UPDATE ${photoTable} SET image_path = ? WHERE id = ?`, [
        relativePath,
        photoId,
      ]);
      await generateMapPhotoThumbFromMainRelativePath(relativePath);
      const photo = await queryOne(
        `SELECT id, ${fkColumn}, caption, sort_order, uploaded_at, image_path FROM ${photoTable} WHERE id=?`,
        [photoId],
      );
      emitGardenChanged({
        reason: emitReasons.add,
        [emitKey]: req.params.id,
        mapId: entity.map_id,
      });
      res.status(201).json(serializeRow(photo, req.params.id));
    }),
  );

  router.delete(
    `${basePath}/:id/photos/:pid`,
    requirePermission(permission),
    asyncHandler(async (req, res) => {
      const entity = await queryOne(`SELECT map_id FROM ${entityTable} WHERE id = ?`, [
        req.params.id,
      ]);
      const p = await queryOne(
        `SELECT image_path FROM ${photoTable} WHERE id=? AND ${fkColumn}=?`,
        [req.params.pid, req.params.id],
      );
      if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
      await execute(`DELETE FROM ${photoTable} WHERE id=? AND ${fkColumn}=?`, [
        req.params.pid,
        req.params.id,
      ]);
      emitGardenChanged({
        reason: emitReasons.delete,
        [emitKey]: req.params.id,
        mapId: entity?.map_id || null,
      });
      res.json({ success: true });
    }),
  );
}

module.exports = {
  registerEntityPhotoRoutes,
  // Exportés pour les tests no-DB du contrat de validation O7 (réexportés par
  // routes/zones.js et routes/map.js sous leurs anciens noms).
  reorderPhotosBodySchema,
  addPhotoBodySchema,
};
