const express = require('express');
const { queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGlModulesSettings } = require('../../lib/glSettings');
const { buildPublicIntroPayload, getIntroConfigFromDb } = require('../../lib/glIntro');
const { buildPublicGlHelpPayload, getGlHelpConfigFromDb } = require('../../lib/glHelp');
const {
  buildPublicNarratorPayload,
  getHelpNarratorFromDb,
  loadDefaultNarratorConfig,
} = require('../../lib/helpNarrator');
const { getGlTourRegistryFromDb, saveGlTourRegistryToDb } = require('../../lib/glTourContent');
const { tourRegistrySchema } = require('../../lib/shared/tourOverridesCore');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');

/** GET /api/gl/content/intro — config publique (textes + URLs média résolues). */
router.get(
  '/intro',
  asyncHandler(async (req, res) => {
    const modules = await getGlModulesSettings();
    if (modules.introEnabled !== true) {
      return res.json({ enabled: false });
    }
    const config = await getIntroConfigFromDb();
    if (config.enabled === false) {
      return res.json({ enabled: false });
    }
    return res.json(buildPublicIntroPayload(config));
  }),
);

/** GET /api/gl/content/help — textes d'aide contextuelle GL (public, auth GL standard). */
router.get(
  '/help',
  requireGlPermission('gl.read'),
  asyncHandler(async (_req, res) => {
    const config = await getGlHelpConfigFromDb();
    return res.json(buildPublicGlHelpPayload(config));
  }),
);

/**
 * GET /api/gl/content/narrator — configuration publique du narrateur OLU.
 *
 * **Réglage partagé ForetMap + GL**, en révision de l'arbitrage §8.2 de
 * `docs/MASCOT_NARRATEUR_OLU.md` qui prévoyait une configuration GL distincte : OLU est
 * un seul personnage, ses portraits n'ont été téléversés qu'une fois (côté ForetMap,
 * réglage `content.help.narrator`), et deux jeux d'assets finiraient par diverger.
 *
 * L'isolement runtime reste entier : la lecture passe par `/api/gl/*` — jamais un appel
 * client vers `/api/settings/*` — aucun jeton ne traverse, et la route est en **lecture
 * seule**. L'édition demeure au studio ForetMap (`PUT /api/settings/admin/help-narrator`,
 * permission `admin.settings.write`), unique point d'écriture du réglage.
 *
 * Route publique, comme `/intro` : la charge utile ne contient qu'un nom de locuteur et
 * des URLs de médias déjà servis en clair sous `/uploads`, et le portrait doit pouvoir
 * s'afficher avant toute connexion GL.
 */
router.get(
  '/narrator',
  asyncHandler(async (_req, res) => {
    try {
      const config = await getHelpNarratorFromDb();
      return res.json(buildPublicNarratorPayload(config));
    } catch (_) {
      // « Jamais d'écran vide » (§9.4) : une lecture en échec renvoie les défauts plutôt
      // qu'une erreur — l'aide et les feuillets GL restent affichables, silhouette comprise.
      return res.json(buildPublicNarratorPayload(loadDefaultNarratorConfig()));
    }
  }),
);

/**
 * GET /api/gl/content/tours — surcharges éditoriales des visites guidées GL.
 *
 * Lecture ouverte à tout joueur : le client applique ces textes par-dessus le corpus
 * versionné, il lui faut donc les connaître. Ne circulent que des champs de texte —
 * la structure des parcours (cibles, placements) reste en code (§7.1).
 */
router.get(
  '/tours',
  requireGlPermission('gl.read'),
  asyncHandler(async (_req, res) => {
    const registry = await getGlTourRegistryFromDb();
    return res.json({ registry });
  }),
);

/**
 * PUT /api/gl/content/tours — réécriture des bulles par un MJ.
 *
 * Sous `gl.content.manage`, la permission éditoriale du produit : réécrire une bulle est
 * un geste de contenu, pas de configuration. Un registre vide efface toute
 * personnalisation et rend le corpus versionné.
 */
router.put(
  '/tours',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const parsed = tourRegistrySchema.safeParse(req.body?.registry ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Registre de visites guidées invalide' });
    }
    const registry = await saveGlTourRegistryToDb(parsed.data, req.glAuth?.userId ?? null);
    return res.json({ registry });
  }),
);

router.get(
  '/:slug',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Slug invalide' });
    const row = await queryOne(
      `SELECT slug, title, body_markdown, updated_at
       FROM gl_content_pages
      WHERE slug = ?
      LIMIT 1`,
      [slug],
    );
    if (!row) return res.status(404).json({ error: 'Contenu introuvable' });
    return res.json({
      slug: row.slug,
      title: row.title,
      bodyMarkdown: row.body_markdown || '',
      updatedAt: row.updated_at || null,
    });
  }),
);

router.put(
  '/:slug',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Slug invalide' });
    const title = normalizeOptionalString(req.body?.title);
    const bodyMarkdown = String(req.body?.bodyMarkdown || '');
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    await execute(
      `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body_markdown = VALUES(body_markdown),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
      [slug, title, bodyMarkdown, req.glAuth.userId],
    );
    const row = await queryOne(
      'SELECT slug, title, body_markdown, updated_at FROM gl_content_pages WHERE slug = ? LIMIT 1',
      [slug],
    );
    return res.json({
      slug: row.slug,
      title: row.title,
      bodyMarkdown: row.body_markdown || '',
      updatedAt: row.updated_at || null,
    });
  }),
);

module.exports = router;
