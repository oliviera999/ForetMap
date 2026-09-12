'use strict';

/**
 * Carnet utilisateur ForetMap — miroir du carnet personnel GL (`lib/glPlayerJournal.js`),
 * isolé (tables `user_journal_*`, pas de `gl_*`).
 */

const { queryOne, queryAll, execute } = require('../database');
const { getSettingValue } = require('./settings');
const {
  normalizeResourceType,
  normalizeResourceRef,
  FORETMAP_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');

const JOURNAL_ASSET_PREFIX = 'user-journal';
const EMBED_TYPES = new Set(['plant', 'glossary', 'tutorial', 'module_stub']);
const MODULE_STUB_REFS = new Set(['plants', 'glossary', 'tutorials', 'foodweb', 'visit', 'quiz']);
const IMPORT_TYPES = new Set(FORETMAP_RESOURCE_TYPES);
const MAX_TITLE_LENGTH = 255;

const MODULE_STUB_TITLES = {
  plants: 'Biodiversité',
  glossary: 'Glossaire',
  tutorials: 'Tutoriels',
  foodweb: 'Réseau trophique',
  visit: 'Visite',
  quiz: 'Quiz',
};

/** Accepte les encarts neutres et l’ancien format GL (compat markdown partagé). */
const EMBED_TAG_RE = /<aside\b[^>]*class="[^"]*(?:journal-embed|gl-journal-embed)[^"]*"[^>]*>/gi;

let observationMigrationPromise = null;

function parseEmbedAttrs(tagHtml) {
  const typeMatch =
    tagHtml.match(/data-embed-type=["']([^"']+)["']/i) ||
    tagHtml.match(/data-gl-embed-type=["']([^"']+)["']/i);
  const refMatch =
    tagHtml.match(/data-ref=["']([^"']+)["']/i) || tagHtml.match(/data-gl-ref=["']([^"']+)["']/i);
  const type = typeMatch ? String(typeMatch[1]).trim().toLowerCase() : '';
  const ref = refMatch ? String(refMatch[1]).trim() : '';
  return { type, ref };
}

function extractJournalEmbeds(bodyMarkdown) {
  const text = String(bodyMarkdown || '');
  const embeds = [];
  let match;
  const re = new RegExp(EMBED_TAG_RE.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    const attrs = parseEmbedAttrs(match[0]);
    if (attrs.type && attrs.ref) embeds.push(attrs);
  }
  return embeds;
}

function countJournalChars(bodyMarkdown) {
  return [...String(bodyMarkdown || '')].length;
}

function normalizeArticleTitle(rawTitle) {
  const s = rawTitle == null ? '' : String(rawTitle).trim();
  if (!s) return null;
  return [...s].slice(0, MAX_TITLE_LENGTH).join('');
}

function userJournalUploadPrefix(userId) {
  return `${JOURNAL_ASSET_PREFIX}/${String(userId)}`;
}

function isAllowedJournalImageUrl(url, userId) {
  const s = String(url || '').trim();
  const prefix = `/uploads/${userJournalUploadPrefix(userId)}/`;
  if (s.startsWith(prefix) && !s.includes('..')) return true;
  // Chemins legacy observations/… migrés sans copie disque
  if (s.startsWith('/uploads/observations/') && !s.includes('..')) return true;
  return false;
}

function stripDisallowedImageUrls(bodyMarkdown, userId) {
  const text = String(bodyMarkdown || '');
  return text
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : '';
      if (isAllowedJournalImageUrl(src, userId)) return tag;
      return '';
    })
    .replace(/!\[[^\]]*]\([^)]+\)/g, (mdImg) => {
      const urlMatch = mdImg.match(/\(([^)]+)\)/);
      const url = urlMatch ? urlMatch[1].trim() : '';
      if (isAllowedJournalImageUrl(url, userId)) return mdImg;
      return '';
    });
}

async function getUserJournalLimits() {
  const maxCharsRaw = Number(await getSettingValue('observations.journal_max_chars', 0));
  const maxAssetsRaw = Number(await getSettingValue('observations.journal_max_assets', 0));
  return {
    maxChars: Number.isFinite(maxCharsRaw) && maxCharsRaw > 0 ? maxCharsRaw : 0,
    maxAssets: Number.isFinite(maxAssetsRaw) && maxAssetsRaw > 0 ? maxAssetsRaw : 0,
  };
}

async function countArticleAssets(articleId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS n FROM user_journal_article_assets WHERE article_id = ?',
    [Number(articleId)],
  );
  return Number(row?.n) || 0;
}

async function validateJournalEmbeds(embeds) {
  for (const embed of embeds) {
    if (!EMBED_TYPES.has(embed.type)) {
      return { error: `Type d’encart inconnu : ${embed.type}` };
    }
    if (embed.type === 'module_stub') {
      if (!MODULE_STUB_REFS.has(embed.ref)) {
        return { error: `Référence module inconnue : ${embed.ref}` };
      }
      continue;
    }
    if (embed.type === 'plant') {
      const plantId = Number(embed.ref);
      if (!Number.isFinite(plantId) || plantId <= 0) {
        return { error: 'Identifiant d’espèce invalide' };
      }
      const row = await queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [plantId]);
      if (!row) return { error: `Espèce introuvable : ${embed.ref}` };
      continue;
    }
    if (embed.type === 'glossary') {
      const row = await queryOne(
        "SELECT glossary_code FROM glossary_terms WHERE glossary_code = ? AND statut = 'actif' LIMIT 1",
        [embed.ref],
      );
      if (!row) return { error: `Terme glossaire introuvable : ${embed.ref}` };
      continue;
    }
    if (embed.type === 'tutorial') {
      const tutorialId = Number(embed.ref);
      if (!Number.isFinite(tutorialId) || tutorialId <= 0) {
        return { error: 'Identifiant de tutoriel invalide' };
      }
      const row = await queryOne(
        'SELECT id FROM tutorials WHERE id = ? AND is_active = 1 LIMIT 1',
        [tutorialId],
      );
      if (!row) return { error: `Tutoriel introuvable : ${embed.ref}` };
    }
  }
  return { ok: true };
}

async function resolveJournalEmbedTitles(embeds) {
  const out = {};
  const wanted = { plant: new Set(), glossary: new Set(), tutorial: new Set() };
  for (const e of Array.isArray(embeds) ? embeds : []) {
    const type = String(e?.type || '')
      .trim()
      .toLowerCase();
    const ref = String(e?.ref || '').trim();
    if (!EMBED_TYPES.has(type) || !ref) continue;
    if (type === 'module_stub') {
      if (MODULE_STUB_REFS.has(ref)) out[`module_stub|${ref}`] = MODULE_STUB_TITLES[ref] || ref;
      continue;
    }
    if (wanted[type]) wanted[type].add(ref);
  }

  const plantIds = [...wanted.plant]
    .map((r) => Number(r))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (plantIds.length) {
    const placeholders = plantIds.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT id, name FROM plants WHERE id IN (${placeholders})`,
      plantIds,
    );
    for (const r of rows) {
      if (r.name != null && String(r.name).trim()) out[`plant|${r.id}`] = String(r.name);
    }
  }

  const glossaryCodes = [...wanted.glossary];
  if (glossaryCodes.length) {
    const placeholders = glossaryCodes.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT glossary_code AS k, terme AS t FROM glossary_terms
        WHERE glossary_code IN (${placeholders})`,
      glossaryCodes,
    );
    for (const r of rows) {
      if (r.t != null && String(r.t).trim()) out[`glossary|${r.k}`] = String(r.t);
    }
  }

  const tutorialIds = [...wanted.tutorial]
    .map((r) => Number(r))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (tutorialIds.length) {
    const placeholders = tutorialIds.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT id, title FROM tutorials WHERE id IN (${placeholders})`,
      tutorialIds,
    );
    for (const r of rows) {
      if (r.title != null && String(r.title).trim()) out[`tutorial|${r.id}`] = String(r.title);
    }
  }

  return out;
}

async function validateArticleBody(bodyMarkdown, userId) {
  const limits = await getUserJournalLimits();
  const cleaned = stripDisallowedImageUrls(bodyMarkdown, userId);
  const charCount = countJournalChars(cleaned);
  if (limits.maxChars > 0 && charCount > limits.maxChars) {
    return { error: `Texte trop long (${charCount} / ${limits.maxChars} caractères)` };
  }
  const embeds = extractJournalEmbeds(cleaned);
  const embedCheck = await validateJournalEmbeds(embeds);
  if (embedCheck.error) return embedCheck;
  return { ok: true, bodyMarkdown: cleaned, charCount, limits };
}

function mapAsset(a) {
  const path = String(a.asset_path || '');
  const isLegacyObs = path.startsWith('observations/');
  return {
    id: Number(a.id),
    url: isLegacyObs ? `/api/user-journal/assets/${Number(a.id)}/file` : `/uploads/${a.asset_path}`,
    mimeType: a.mime_type || null,
    byteSize: Number(a.byte_size) || 0,
    createdAt: a.created_at,
  };
}

function serializeArticle(row, assets, zoneName = null) {
  const bodyMarkdown = row?.body_markdown != null ? String(row.body_markdown) : '';
  return {
    id: Number(row.id),
    title: row?.title != null ? String(row.title) : '',
    bodyMarkdown,
    zoneId: row?.zone_id != null ? String(row.zone_id) : null,
    zoneName: zoneName || row?.zone_name || null,
    pinned: !!row?.pinned,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    usage: {
      charCount: countJournalChars(bodyMarkdown),
      assetCount: assets.length,
    },
    assets: assets.map(mapAsset),
  };
}

async function getArticleAssets(articleId) {
  return queryAll(
    `SELECT id, asset_path, mime_type, byte_size, created_at
       FROM user_journal_article_assets
      WHERE article_id = ?
      ORDER BY id ASC`,
    [Number(articleId)],
  );
}

async function getArticleOwned(articleId, userId) {
  return queryOne(
    `SELECT id, user_id, title, body_markdown, zone_id, pinned, created_at, updated_at
       FROM user_journal_articles
      WHERE id = ? AND user_id = ? LIMIT 1`,
    [Number(articleId), String(userId)],
  );
}

async function getArticleDto(articleId) {
  const row = await queryOne(
    `SELECT a.id, a.title, a.body_markdown, a.zone_id, a.pinned, a.created_at, a.updated_at,
            z.name AS zone_name
       FROM user_journal_articles a
       LEFT JOIN zones z ON z.id = a.zone_id
      WHERE a.id = ? LIMIT 1`,
    [Number(articleId)],
  );
  if (!row) return null;
  const assets = await getArticleAssets(Number(articleId));
  return serializeArticle(row, assets, row.zone_name);
}

async function getArticlesForUser(userId) {
  const uid = String(userId);
  await migrateObservationLogsOnce();
  const limits = await getUserJournalLimits();
  const rows = await queryAll(
    `SELECT a.id, a.title, a.body_markdown, a.zone_id, a.pinned, a.created_at, a.updated_at,
            z.name AS zone_name
       FROM user_journal_articles a
       LEFT JOIN zones z ON z.id = a.zone_id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC, a.id DESC`,
    [uid],
  );
  const assetsByArticle = new Map();
  if (rows.length) {
    const ids = rows.map((r) => Number(r.id));
    const assets = await queryAll(
      `SELECT id, article_id, asset_path, mime_type, byte_size, created_at
         FROM user_journal_article_assets
        WHERE article_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY id ASC`,
      ids,
    );
    for (const a of assets) {
      const key = Number(a.article_id);
      if (!assetsByArticle.has(key)) assetsByArticle.set(key, []);
      assetsByArticle.get(key).push(a);
    }
  }
  return {
    userId: uid,
    limits: { maxChars: limits.maxChars, maxAssets: limits.maxAssets },
    articles: rows.map((r) =>
      serializeArticle(r, assetsByArticle.get(Number(r.id)) || [], r.zone_name),
    ),
  };
}

async function resolveResourceTitle(resourceType, resourceRef) {
  const type = normalizeResourceType(resourceType, FORETMAP_RESOURCE_TYPES);
  const ref = normalizeResourceRef(resourceRef);
  if (!type || !ref) return null;
  if (type === 'plant') {
    const row = await queryOne('SELECT name FROM plants WHERE id = ? LIMIT 1', [Number(ref)]);
    return row?.name ? String(row.name) : null;
  }
  if (type === 'glossary') {
    const row = await queryOne('SELECT terme FROM glossary_terms WHERE glossary_code = ? LIMIT 1', [
      ref,
    ]);
    return row?.terme ? String(row.terme) : null;
  }
  if (type === 'tutorial') {
    const row = await queryOne('SELECT title FROM tutorials WHERE id = ? LIMIT 1', [Number(ref)]);
    return row?.title ? String(row.title) : null;
  }
  return null;
}

async function resourceExists(resourceType, resourceRef) {
  const type = normalizeResourceType(resourceType, FORETMAP_RESOURCE_TYPES);
  const ref = normalizeResourceRef(resourceRef);
  if (!type || !ref) return false;
  if (type === 'plant') {
    const row = await queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [Number(ref)]);
    return !!row;
  }
  if (type === 'glossary') {
    const row = await queryOne(
      "SELECT glossary_code FROM glossary_terms WHERE glossary_code = ? AND statut = 'actif' LIMIT 1",
      [ref],
    );
    return !!row;
  }
  if (type === 'tutorial') {
    const row = await queryOne('SELECT id FROM tutorials WHERE id = ? AND is_active = 1 LIMIT 1', [
      Number(ref),
    ]);
    return !!row;
  }
  return false;
}

/**
 * Ressource « apprise / découverte » selon les tables FM existantes :
 * plant → user_plant_observation_events ; glossary → learning_acknowledgements ;
 * tutorial → user_tutorial_reads.
 */
async function hasLearnedResource(userId, resourceType, resourceRef) {
  const type = normalizeResourceType(resourceType, FORETMAP_RESOURCE_TYPES);
  const ref = normalizeResourceRef(resourceRef);
  const uid = String(userId);
  if (!type || !ref || !uid) return false;
  if (type === 'plant') {
    const row = await queryOne(
      `SELECT 1 AS ok FROM user_plant_observation_events
        WHERE user_id = ? AND plant_id = ? LIMIT 1`,
      [uid, Number(ref)],
    );
    return !!row;
  }
  if (type === 'glossary') {
    const row = await queryOne(
      `SELECT 1 AS ok FROM learning_acknowledgements
        WHERE user_id = ? AND target_type = 'glossary' AND target_code = ? LIMIT 1`,
      [uid, ref],
    );
    return !!row;
  }
  if (type === 'tutorial') {
    const row = await queryOne(
      `SELECT 1 AS ok FROM user_tutorial_reads
        WHERE user_id = ? AND tutorial_id = ? LIMIT 1`,
      [uid, Number(ref)],
    );
    return !!row;
  }
  return false;
}

async function getUserJournalImports(userId) {
  await migrateObservationLogsOnce();
  const rows = await queryAll(
    `SELECT id, resource_type, resource_ref, title, pinned, created_at
       FROM user_journal_imports
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC`,
    [String(userId)],
  );
  const fresh = await Promise.all(
    rows.map((r) => resolveResourceTitle(r.resource_type, r.resource_ref).catch(() => null)),
  );
  return rows.map((r, i) => {
    const current = fresh[i] != null ? String(fresh[i]).trim() : '';
    const stored = r.title != null ? String(r.title) : '';
    return {
      id: Number(r.id),
      resourceType: r.resource_type,
      resourceRef: r.resource_ref,
      title: current || stored,
      pinned: !!r.pinned,
      createdAt: r.created_at,
    };
  });
}

async function getUserJournalImportRefs(userId) {
  const rows = await queryAll(
    `SELECT resource_type, resource_ref
       FROM user_journal_imports
      WHERE user_id = ?`,
    [String(userId)],
  );
  return rows.map((r) => ({
    resourceType: r.resource_type,
    resourceRef: String(r.resource_ref),
  }));
}

async function setArticlePinned(articleId, userId, pinned) {
  const result = await execute(
    'UPDATE user_journal_articles SET pinned = ? WHERE id = ? AND user_id = ?',
    [pinned ? 1 : 0, Number(articleId), String(userId)],
  );
  return Number(result?.affectedRows) || 0;
}

async function setImportPinned(importId, userId, pinned) {
  const result = await execute(
    'UPDATE user_journal_imports SET pinned = ? WHERE id = ? AND user_id = ?',
    [pinned ? 1 : 0, Number(importId), String(userId)],
  );
  return Number(result?.affectedRows) || 0;
}

async function migrateObservationLogsOnce() {
  if (observationMigrationPromise) return observationMigrationPromise;
  observationMigrationPromise = (async () => {
    try {
      const pending = await queryAll(
        `SELECT o.id, o.student_id, o.zone_id, o.content, o.image_path, o.created_at
           FROM observation_logs o
          WHERE NOT EXISTS (
            SELECT 1 FROM user_journal_observation_map m WHERE m.observation_id = o.id
          )
          ORDER BY o.id ASC
          LIMIT 500`,
      );
      for (const o of pending) {
        const result = await execute(
          `INSERT INTO user_journal_articles
             (user_id, title, body_markdown, zone_id, pinned, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 0, ?, ?)`,
          [
            o.student_id,
            o.content != null ? String(o.content) : '',
            o.zone_id || null,
            o.created_at || new Date(),
            o.created_at || new Date(),
          ],
        );
        const articleId = result.insertId;
        await execute(
          `INSERT INTO user_journal_observation_map (observation_id, article_id, created_at)
           VALUES (?, ?, NOW())`,
          [o.id, articleId],
        );
        if (o.image_path) {
          await execute(
            `INSERT INTO user_journal_article_assets
               (article_id, user_id, asset_path, mime_type, byte_size, created_at)
             VALUES (?, ?, ?, 'image/jpeg', 0, ?)`,
            [articleId, o.student_id, o.image_path, o.created_at || new Date()],
          );
        }
      }
      if (pending.length >= 500) {
        observationMigrationPromise = null;
      }
    } catch (err) {
      observationMigrationPromise = null;
      throw err;
    }
  })();
  return observationMigrationPromise;
}

function isImportableResourceType(type) {
  return IMPORT_TYPES.has(String(type || '').toLowerCase());
}

module.exports = {
  JOURNAL_ASSET_PREFIX,
  EMBED_TYPES,
  MODULE_STUB_REFS,
  MODULE_STUB_TITLES,
  IMPORT_TYPES,
  extractJournalEmbeds,
  countJournalChars,
  normalizeArticleTitle,
  userJournalUploadPrefix,
  isAllowedJournalImageUrl,
  stripDisallowedImageUrls,
  getUserJournalLimits,
  countArticleAssets,
  validateArticleBody,
  getArticleOwned,
  getArticleDto,
  getArticleAssets,
  getArticlesForUser,
  getUserJournalImports,
  getUserJournalImportRefs,
  setArticlePinned,
  setImportPinned,
  resolveJournalEmbedTitles,
  hasLearnedResource,
  resourceExists,
  resolveResourceTitle,
  isImportableResourceType,
  migrateObservationLogsOnce,
};
