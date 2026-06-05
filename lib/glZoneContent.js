'use strict';

const { parseNarrationImageUrl } = require('./glJournalPresent');

const MAX_POPOVER_MARKDOWN_LEN = 20000;
const MAX_POPOVER_IMAGES = 10;
const MAX_IMAGE_CAPTION_LEN = 300;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizePopoverMarkdown(value) {
  if (value == null) return null;
  const s = String(value);
  if (s.trim().length === 0) return null;
  if (s.length > MAX_POPOVER_MARKDOWN_LEN) {
    return { error: `Texte popover trop long (max ${MAX_POPOVER_MARKDOWN_LEN} caractères)` };
  }
  return s;
}

function parsePopoverImagesInput(value) {
  if (value == null) return { images: null, hasImages: false };
  if (!Array.isArray(value)) {
    return { error: 'popoverImages doit être un tableau' };
  }
  if (value.length === 0) {
    return { images: null, hasImages: true };
  }
  if (value.length > MAX_POPOVER_IMAGES) {
    return { error: `Trop d'images (max ${MAX_POPOVER_IMAGES})` };
  }
  const out = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') {
      return { error: 'Image popover invalide' };
    }
    let url;
    try {
      url = parseNarrationImageUrl(item.url ?? item.imageUrl ?? item.image_url);
    } catch (err) {
      return { error: err.message || 'URL image invalide' };
    }
    if (!url) {
      return { error: 'URL image requise' };
    }
    const captionRaw = item.caption != null ? String(item.caption).trim() : '';
    if (captionRaw.length > MAX_IMAGE_CAPTION_LEN) {
      return { error: `Légende image trop longue (max ${MAX_IMAGE_CAPTION_LEN})` };
    }
    const sortOrder = Number.isFinite(Number(item.sortOrder ?? item.sort_order))
      ? Math.floor(Number(item.sortOrder ?? item.sort_order))
      : i;
    out.push({ url, caption: captionRaw || null, sortOrder });
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.url.localeCompare(b.url));
  return { images: out, hasImages: true };
}

function parseZonePopoverInput(body) {
  const hasMarkdown = Object.prototype.hasOwnProperty.call(body || {}, 'popoverMarkdown')
    || Object.prototype.hasOwnProperty.call(body || {}, 'popover_markdown');
  const hasImages = Object.prototype.hasOwnProperty.call(body || {}, 'popoverImages')
    || Object.prototype.hasOwnProperty.call(body || {}, 'popover_images');

  let popoverMarkdown;
  if (hasMarkdown) {
    const raw = body.popoverMarkdown ?? body.popover_markdown;
    const parsed = normalizePopoverMarkdown(raw);
    if (parsed && typeof parsed === 'object' && parsed.error) return parsed;
    popoverMarkdown = parsed;
  }

  let popoverImages;
  if (hasImages) {
    const raw = body.popoverImages ?? body.popover_images;
    const parsed = parsePopoverImagesInput(raw);
    if (parsed.error) return parsed;
    popoverImages = parsed.images;
  }

  return {
    hasPopoverMarkdown: hasMarkdown,
    popoverMarkdown,
    hasPopoverImages: hasImages,
    popoverImages,
  };
}

function parsePopoverImagesRow(row) {
  if (!row?.popover_images_json) return [];
  try {
    const parsed = JSON.parse(String(row.popover_images_json));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        url: String(item?.url || '').trim(),
        caption: item?.caption != null ? String(item.caption).trim() || null : null,
        sortOrder: Number.isFinite(Number(item?.sortOrder ?? item?.sort_order))
          ? Number(item.sortOrder ?? item.sort_order)
          : index,
      }))
      .filter((item) => item.url.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (_) {
    return [];
  }
}

function zoneHasPopoverContent(rowOrZone) {
  const markdown = normalizeOptionalString(
    rowOrZone?.popover_markdown ?? rowOrZone?.popoverMarkdown
  );
  if (markdown) return true;
  const images = Array.isArray(rowOrZone?.popoverImages)
    ? rowOrZone.popoverImages
    : parsePopoverImagesRow(rowOrZone);
  return images.length > 0;
}

function serializeZonePopoverRow(row) {
  const popoverMarkdown = row?.popover_markdown ?? null;
  const popoverImages = parsePopoverImagesRow(row);
  return {
    popover_markdown: popoverMarkdown,
    popoverMarkdown,
    popover_images: popoverImages,
    popoverImages,
  };
}

module.exports = {
  MAX_POPOVER_IMAGES,
  normalizeOptionalString,
  normalizePopoverMarkdown,
  parsePopoverImagesInput,
  parseZonePopoverInput,
  parsePopoverImagesRow,
  zoneHasPopoverContent,
  serializeZonePopoverRow,
};
