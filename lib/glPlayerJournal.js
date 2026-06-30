'use strict';

const { queryOne, queryAll } = require('../database');
const { getGameplaySettings } = require('./glSettings');

const JOURNAL_ASSET_PREFIX = 'gl-player-journal';
const EMBED_TYPES = new Set(['spell', 'species', 'glossary', 'chapter', 'module_stub']);
const MODULE_STUB_REFS = new Set(['narrative']);

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
  // 0 = illimité (aucun plafond explicite). On normalise toute valeur invalide à 0.
  const maxChars = Number(settings.playerJournalMaxChars);
  const maxAssets = Number(settings.playerJournalMaxAssets);
  return {
    maxChars: Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 0,
    maxAssets: Number.isFinite(maxAssets) && maxAssets > 0 ? maxAssets : 0,
  };
}

async function countPlayerJournalAssets(playerId) {
  const row = await queryOne(
    'SELECT COUNT(*) AS n FROM gl_player_journal_assets WHERE player_id = ?',
    [Number(playerId)],
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

async function validateJournalBody(bodyMarkdown, playerId) {
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

async function getJournalForPlayer(playerId) {
  const pid = Number(playerId);
  const limits = await getPlayerJournalLimits();
  const row = await queryOne(
    'SELECT player_id, body_markdown, updated_at FROM gl_player_journals WHERE player_id = ? LIMIT 1',
    [pid],
  );
  const assets = await queryAll(
    `SELECT id, asset_path, mime_type, byte_size, created_at
       FROM gl_player_journal_assets
      WHERE player_id = ?
      ORDER BY id ASC`,
    [pid],
  );
  const assetCount = assets.length;
  const bodyMarkdown = row?.body_markdown != null ? String(row.body_markdown) : '';
  return {
    playerId: pid,
    bodyMarkdown,
    updatedAt: row?.updated_at || null,
    limits: {
      maxChars: limits.maxChars,
      maxAssets: limits.maxAssets,
    },
    usage: {
      charCount: countJournalChars(bodyMarkdown),
      assetCount,
    },
    assets: assets.map((a) => ({
      id: Number(a.id),
      url: `/uploads/${a.asset_path}`,
      mimeType: a.mime_type || null,
      byteSize: Number(a.byte_size) || 0,
      createdAt: a.created_at,
    })),
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
  playerJournalUploadPrefix,
  isAllowedJournalImageUrl,
  stripDisallowedImageUrls,
  getPlayerJournalLimits,
  countPlayerJournalAssets,
  validateJournalBody,
  getJournalForPlayer,
  canStaffAccessPlayer,
  buildJournalEmbedHtml,
};
