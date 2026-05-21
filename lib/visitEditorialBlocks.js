function normalizeBlockId(value, fallbackPrefix, index) {
  const raw = String(value || '').trim();
  if (raw && raw.length <= 64) return raw;
  return `${fallbackPrefix}-${index + 1}`;
}

function normalizeHeadingLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(2, Math.trunc(n)));
}

function normalizeImageMediaIds(value) {
  const base = Array.isArray(value) ? value : [];
  const ids = [];
  for (const item of base) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.trunc(n);
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= 2) break;
  }
  return ids;
}

function normalizeImageLayout(value, count) {
  const v = String(value || '').trim();
  if (count >= 2) return v === 'single' ? 'single' : 'duo';
  return 'single';
}

function normalizeImageSize(value) {
  const v = String(value || '').trim();
  if (v === 'sm' || v === 'lg') return v;
  return 'md';
}

function normalizeImageAlign(value) {
  const v = String(value || '').trim();
  if (v === 'left' || v === 'right') return v;
  return 'center';
}

function normalizeVisitEditorialBlocks(input) {
  if (!Array.isArray(input)) return [];
  const blocks = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').trim();
    if (type === 'paragraph') {
      const markdown = String(item.markdown || '').trim();
      if (!markdown) continue;
      blocks.push({
        id: normalizeBlockId(item.id, 'p', blocks.length),
        type: 'paragraph',
        markdown,
      });
      continue;
    }
    if (type === 'heading') {
      const text = String(item.text || '').trim();
      if (!text) continue;
      blocks.push({
        id: normalizeBlockId(item.id, 'h', blocks.length),
        type: 'heading',
        text,
        level: normalizeHeadingLevel(item.level),
      });
      continue;
    }
    if (type === 'image') {
      const media_ids = normalizeImageMediaIds(item.media_ids);
      if (media_ids.length === 0) continue;
      blocks.push({
        id: normalizeBlockId(item.id, 'img', blocks.length),
        type: 'image',
        media_ids,
        layout: normalizeImageLayout(item.layout, media_ids.length),
        size: normalizeImageSize(item.size),
        align: normalizeImageAlign(item.align),
        caption: String(item.caption || '').trim(),
      });
    }
  }
  return blocks;
}

function parseVisitEditorialBlocksInput(raw) {
  if (raw == null) return null;
  let input = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      input = JSON.parse(t);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(input)) return [];
  return normalizeVisitEditorialBlocks(input);
}

function parseVisitEditorialBlocksStored(raw) {
  return parseVisitEditorialBlocksInput(raw) || [];
}

function serializeVisitEditorialBlocks(blocks) {
  const normalized = normalizeVisitEditorialBlocks(blocks);
  if (normalized.length === 0) return null;
  return JSON.stringify(normalized);
}

/**
 * Ajoute un bloc image par photo visit_media non encore référencée dans les blocs stockés.
 * Permet d’éditer les photos « par défaut » comme les blocs ajoutés manuellement.
 */
function mergeDefaultVisitMediaImageBlocks(blocks, visitMedia) {
  const normalized = normalizeVisitEditorialBlocks(blocks);
  const usedIds = new Set();
  for (const block of normalized) {
    if (block.type !== 'image') continue;
    for (const id of block.media_ids) usedIds.add(id);
  }
  const mediaList = Array.isArray(visitMedia) ? visitMedia : [];
  const out = [...normalized];
  const existingImageCount = normalized.filter((b) => b.type === 'image').length;
  let added = 0;
  for (let i = 0; i < mediaList.length; i += 1) {
    const media = mediaList[i];
    const mid = Number(media?.id);
    if (!Number.isFinite(mid) || mid <= 0) continue;
    const mediaId = Math.trunc(mid);
    if (usedIds.has(mediaId)) continue;
    usedIds.add(mediaId);
    out.push({
      id: `default-img-${mediaId}`,
      type: 'image',
      media_ids: [mediaId],
      layout: 'single',
      size: existingImageCount + added === 0 ? 'lg' : 'md',
      align: 'center',
      caption: String(media?.caption || '').trim(),
    });
    added += 1;
  }
  return out;
}

function resolveVisitEditorialBlocksForContent({ bodyJson, shortDescription, detailsTitle, detailsText, visitMedia }) {
  const trimmedBody = bodyJson == null ? '' : String(bodyJson).trim();
  const fromStored = parseVisitEditorialBlocksStored(bodyJson);
  if (!trimmedBody) {
    return buildLegacyVisitEditorialBlocks({
      shortDescription,
      detailsTitle,
      detailsText,
      visitMedia,
    });
  }
  const hasImageBlock = fromStored.some((b) => b.type === 'image');
  if (!hasImageBlock) {
    return mergeDefaultVisitMediaImageBlocks(fromStored, visitMedia);
  }
  return fromStored;
}

function buildLegacyVisitEditorialBlocks({ shortDescription, detailsTitle, detailsText, visitMedia }) {
  const out = [];
  const shortText = String(shortDescription || '').trim();
  if (shortText) {
    out.push({ id: 'legacy-short', type: 'paragraph', markdown: shortText });
  }
  const mediaList = Array.isArray(visitMedia) ? visitMedia : [];
  for (let i = 0; i < mediaList.length; i += 1) {
    const media = mediaList[i];
    const mid = Number(media?.id);
    if (!Number.isFinite(mid) || mid <= 0) continue;
    out.push({
      id: `legacy-img-${i + 1}`,
      type: 'image',
      media_ids: [Math.trunc(mid)],
      layout: 'single',
      size: i === 0 ? 'lg' : 'md',
      align: 'center',
      caption: String(media?.caption || '').trim(),
    });
  }
  const detailsTitleClean = String(detailsTitle || '').trim();
  const detailsTextClean = String(detailsText || '').trim();
  if (detailsTextClean) {
    if (detailsTitleClean) {
      out.push({
        id: 'legacy-details-title',
        type: 'heading',
        level: 3,
        text: detailsTitleClean,
      });
    }
    out.push({
      id: 'legacy-details',
      type: 'paragraph',
      markdown: detailsTextClean,
    });
  }
  return out;
}

module.exports = {
  normalizeVisitEditorialBlocks,
  parseVisitEditorialBlocksInput,
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
  mergeDefaultVisitMediaImageBlocks,
  resolveVisitEditorialBlocksForContent,
  buildLegacyVisitEditorialBlocks,
};

