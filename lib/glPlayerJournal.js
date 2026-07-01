'use strict';

const { queryOne, queryAll } = require('../database');
const { getGameplaySettings } = require('./glSettings');

const JOURNAL_ASSET_PREFIX = 'gl-player-journal';
const EMBED_TYPES = new Set(['spell', 'species', 'glossary', 'chapter', 'module_stub']);
const MODULE_STUB_REFS = new Set(['narrative']);
const MAX_TITLE_LENGTH = 255;

const EMBED_TAG_RE = /<aside\b[^>]*class="[^"]*gl-journal-embed[^"]*"[^>]*>/gi;

function parseEmbedAttrs(tagHtml) {
  const typeMatch = tagHtml.match(/data-gl-embed-type=["']([^"']+)["']/i);
  const refMatch = tagHtml.match(/data-gl-ref=["']([^"']+)["']/i);
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

function playerJournalUploadPrefix(playerId) {
  return `${JOURNAL_ASSET_PREFIX}/${Number(playerId)}`;
}

function isAllowedJournalImageUrl(url, playerId) {
  const s = String(url || '').trim();
  const prefix = `/uploads/${playerJournalUploadPrefix(playerId)}/`;
  return s.startsWith(prefix) && !s.includes('..');
}

function stripDisallowedImageUrls(bodyMarkdown, playerId) {
  const text = String(bodyMarkdown || '');
  return text
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : '';
      if (isAllowedJournalImageUrl(src, playerId)) return tag;
      return '';
    })
    .replace(/!\[[^\]]*]\([^)]+\)/g, (mdImg) => {
      const urlMatch = mdImg.match(/\(([^)]+)\)/);
      const url = urlMatch ? urlMatch[1].trim() : '';
      if (isAllowedJournalImageUrl(url, playerId)) return mdImg;
      return '';
    });
}

async function getPlayerJournalLimits() {
  const settings = await getGameplaySettings();
  // 0 = illimité (aucun plafond explicite). Les plafonds éventuels s'appliquent
  // par article (nombre de caractères / d'illustrations d'un même article).
  const maxChars = Number(settings.playerJournalMaxChars);
  const maxAssets = Number(settings.playerJournalMaxAssets);
  return {
    maxChars: Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 0,
    maxAssets: Number.isFinite(maxAssets) && maxAssets > 0 ? maxAssets : 0,
  };
}

async function countArticleAssets(articleId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS n FROM gl_player_journal_article_assets WHERE article_id = ?',
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
    if (embed.type === 'spell') {
      const row = await queryOne('SELECT spell_code FROM gl_spells WHERE spell_code = ? LIMIT 1', [
        embed.ref,
      ]);
      if (!row) return { error: `Sortilège introuvable : ${embed.ref}` };
      continue;
    }
    if (embed.type === 'species') {
      const row = await queryOne(
        'SELECT species_code FROM gl_species WHERE species_code = ? LIMIT 1',
        [embed.ref],
      );
      if (!row) return { error: `Espèce introuvable : ${embed.ref}` };
      continue;
    }
    if (embed.type === 'glossary') {
      const row = await queryOne(
        'SELECT glossary_code FROM gl_glossary_terms WHERE glossary_code = ? LIMIT 1',
        [embed.ref],
      );
      if (!row) return { error: `Terme glossaire introuvable : ${embed.ref}` };
      continue;
    }
    if (embed.type === 'chapter') {
      const chapterId = Number(embed.ref);
      if (!Number.isFinite(chapterId) || chapterId <= 0) {
        return { error: 'Identifiant de chapitre invalide' };
      }
      const row = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [chapterId]);
      if (!row) return { error: `Chapitre introuvable : ${embed.ref}` };
    }
  }
  return { ok: true };
}

// Résout le TITRE réel de chaque encart `gl-journal-embed` (batch par type), pour
// l'affichage hydraté (le corps markdown stocke seulement type + ref). Renvoie une map
// `type|ref` → titre. Les refs introuvables sont omises (fallback client sur type · ref).
async function resolveJournalEmbedTitles(embeds) {
  const out = {};
  const wanted = { spell: new Set(), species: new Set(), glossary: new Set(), chapter: new Set() };
  for (const e of Array.isArray(embeds) ? embeds : []) {
    const type = String(e?.type || '')
      .trim()
      .toLowerCase();
    const ref = String(e?.ref || '').trim();
    if (!EMBED_TYPES.has(type) || !ref) continue;
    if (type === 'module_stub') {
      if (MODULE_STUB_REFS.has(ref)) out[`module_stub|${ref}`] = 'Module narratif (à venir)';
      continue;
    }
    if (wanted[type]) wanted[type].add(ref);
  }

  const loaders = [
    ['spell', 'gl_spells', 'spell_code', 'nom'],
    ['species', 'gl_species', 'species_code', 'nom_commun'],
    ['glossary', 'gl_glossary_terms', 'glossary_code', 'terme'],
  ];
  for (const [type, table, keyCol, titleCol] of loaders) {
    const refs = [...wanted[type]];
    if (!refs.length) continue;
    const placeholders = refs.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT ${keyCol} AS k, ${titleCol} AS t FROM ${table} WHERE ${keyCol} IN (${placeholders})`,
      refs,
    );
    for (const r of rows) {
      if (r.t != null && String(r.t).trim()) out[`${type}|${r.k}`] = String(r.t);
    }
  }

  const chapterRefs = [...wanted.chapter]
    .map((r) => Number(r))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (chapterRefs.length) {
    const placeholders = chapterRefs.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT id, title FROM gl_chapters WHERE id IN (${placeholders})`,
      chapterRefs,
    );
    for (const r of rows) {
      if (r.title != null && String(r.title).trim()) out[`chapter|${r.id}`] = String(r.title);
    }
  }

  return out;
}

// Valide le corps markdown d'un article (plafond de caractères éventuel, encarts,
// URLs d'images restreintes au préfixe du joueur). Le corps peut être vide
// (article « média seul »).
async function validateArticleBody(bodyMarkdown, playerId) {
  const limits = await getPlayerJournalLimits();
  const cleaned = stripDisallowedImageUrls(bodyMarkdown, playerId);
  const charCount = countJournalChars(cleaned);
  // maxChars = 0 → illimité : aucun plafond de caractères n'est appliqué.
  if (limits.maxChars > 0 && charCount > limits.maxChars) {
    return { error: `Texte trop long (${charCount} / ${limits.maxChars} caractères)` };
  }
  const embeds = extractJournalEmbeds(cleaned);
  const embedCheck = await validateJournalEmbeds(embeds);
  if (embedCheck.error) return embedCheck;
  return { ok: true, bodyMarkdown: cleaned, charCount, limits };
}

function mapAsset(a) {
  return {
    id: Number(a.id),
    url: `/uploads/${a.asset_path}`,
    mimeType: a.mime_type || null,
    byteSize: Number(a.byte_size) || 0,
    createdAt: a.created_at,
  };
}

function serializeArticle(row, assets) {
  const bodyMarkdown = row?.body_markdown != null ? String(row.body_markdown) : '';
  return {
    id: Number(row.id),
    title: row?.title != null ? String(row.title) : '',
    bodyMarkdown,
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
       FROM gl_player_journal_article_assets
      WHERE article_id = ?
      ORDER BY id ASC`,
    [Number(articleId)],
  );
}

// Article possédé par un joueur (contrôle d'appartenance), sans les médias.
async function getArticleOwned(articleId, playerId) {
  return queryOne(
    `SELECT id, player_id, title, body_markdown, created_at, updated_at
       FROM gl_player_journal_articles
      WHERE id = ? AND player_id = ? LIMIT 1`,
    [Number(articleId), Number(playerId)],
  );
}

// DTO complet d'un article (avec médias), sans contrôle d'appartenance.
async function getArticleDto(articleId) {
  const row = await queryOne(
    `SELECT id, title, body_markdown, created_at, updated_at
       FROM gl_player_journal_articles WHERE id = ? LIMIT 1`,
    [Number(articleId)],
  );
  if (!row) return null;
  const assets = await getArticleAssets(Number(articleId));
  return serializeArticle(row, assets);
}

// Liste de tous les articles d'un joueur (du plus récent au plus ancien), médias inclus.
async function getArticlesForPlayer(playerId) {
  const pid = Number(playerId);
  const limits = await getPlayerJournalLimits();
  const rows = await queryAll(
    `SELECT id, title, body_markdown, created_at, updated_at
       FROM gl_player_journal_articles
      WHERE player_id = ?
      ORDER BY created_at DESC, id DESC`,
    [pid],
  );
  const assetsByArticle = new Map();
  if (rows.length) {
    const ids = rows.map((r) => Number(r.id));
    const assets = await queryAll(
      `SELECT id, article_id, asset_path, mime_type, byte_size, created_at
         FROM gl_player_journal_article_assets
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
    playerId: pid,
    limits: { maxChars: limits.maxChars, maxAssets: limits.maxAssets },
    articles: rows.map((r) => serializeArticle(r, assetsByArticle.get(Number(r.id)) || [])),
  };
}

async function canStaffAccessPlayer(staffAuth, targetPlayerId) {
  const player = await queryOne(
    'SELECT id, class_id FROM gl_players WHERE id = ? AND is_active = 1 LIMIT 1',
    [Number(targetPlayerId)],
  );
  if (!player) return false;
  if (String(staffAuth?.userType || '') === 'gl_admin') return true;
  return false;
}

// Éléments du site importés dans le carnet (ordre chronologique décroissant).
async function getPlayerJournalImports(playerId) {
  const rows = await queryAll(
    `SELECT id, resource_type, resource_ref, title, created_at
       FROM gl_player_journal_imports
      WHERE player_id = ?
      ORDER BY created_at DESC, id DESC`,
    [Number(playerId)],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    resourceType: r.resource_type,
    resourceRef: r.resource_ref,
    title: r.title != null ? String(r.title) : '',
    createdAt: r.created_at,
  }));
}

// Références légères des éléments déjà importés (type + ref uniquement), pour permettre
// à l'UI d'afficher « déjà dans mon journal » sans charger tout le carnet (articles, titres).
async function getPlayerJournalImportRefs(playerId) {
  const rows = await queryAll(
    `SELECT resource_type, resource_ref
       FROM gl_player_journal_imports
      WHERE player_id = ?`,
    [Number(playerId)],
  );
  return rows.map((r) => ({
    resourceType: r.resource_type,
    resourceRef: String(r.resource_ref),
  }));
}

// Le joueur a-t-il marqué cette ressource comme « apprise / lue / découverte » ?
async function hasLearnedResource(playerId, resourceType, resourceRef) {
  const row = await queryOne(
    `SELECT 1 AS ok FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ?
        AND target_type = ? AND target_code = ? LIMIT 1`,
    [String(Number(playerId)), String(resourceType), String(resourceRef)],
  );
  return !!row;
}

function buildJournalEmbedHtml(type, ref) {
  const safeType = String(type || '')
    .trim()
    .toLowerCase();
  const safeRef = String(ref || '')
    .trim()
    .replace(/"/g, '');
  return `<aside class="gl-journal-embed" data-gl-embed-type="${safeType}" data-gl-ref="${safeRef}"></aside>`;
}

module.exports = {
  JOURNAL_ASSET_PREFIX,
  EMBED_TYPES,
  extractJournalEmbeds,
  countJournalChars,
  normalizeArticleTitle,
  playerJournalUploadPrefix,
  isAllowedJournalImageUrl,
  stripDisallowedImageUrls,
  getPlayerJournalLimits,
  countArticleAssets,
  validateArticleBody,
  getArticleOwned,
  getArticleDto,
  getArticleAssets,
  getArticlesForPlayer,
  getPlayerJournalImports,
  getPlayerJournalImportRefs,
  resolveJournalEmbedTitles,
  hasLearnedResource,
  canStaffAccessPlayer,
  buildJournalEmbedHtml,
};
