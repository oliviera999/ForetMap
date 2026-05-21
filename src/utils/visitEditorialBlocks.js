/**
 * Blocs éditoriaux visite (zones / repères) — logique partagée avec lib/visitEditorialBlocks.js.
 */

export function normalizeEditorialBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const out = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const type = String(block.type || '').trim();
    if (type === 'paragraph') {
      const markdown = String(block.markdown || '').trim();
      if (!markdown) continue;
      out.push({
        id: String(block.id || `p-${out.length + 1}`),
        type: 'paragraph',
        markdown,
      });
      continue;
    }
    if (type === 'heading') {
      const text = String(block.text || '').trim();
      if (!text) continue;
      out.push({
        id: String(block.id || `h-${out.length + 1}`),
        type: 'heading',
        text,
        level: Math.min(4, Math.max(2, Number(block.level) || 3)),
      });
      continue;
    }
    if (type === 'image') {
      const media_ids = (Array.isArray(block.media_ids) ? block.media_ids : [])
        .map((id) => Number(id))
        .filter((id, idx, arr) => Number.isFinite(id) && id > 0 && arr.indexOf(id) === idx)
        .slice(0, 2);
      if (!media_ids.length) continue;
      out.push({
        id: String(block.id || `img-${out.length + 1}`),
        type: 'image',
        media_ids,
        layout: media_ids.length > 1 ? (block.layout === 'single' ? 'single' : 'duo') : 'single',
        size: block.size === 'sm' || block.size === 'lg' ? block.size : 'md',
        align: block.align === 'left' || block.align === 'right' ? block.align : 'center',
        caption: String(block.caption || '').trim(),
      });
    }
  }
  return out;
}

export function buildLegacyEditorialBlocks(selected, selectedVisitMedia) {
  const out = [];
  const shortDescription = String(selected?.visit_short_description || '').trim();
  if (shortDescription) {
    out.push({ id: 'legacy-short', type: 'paragraph', markdown: shortDescription });
  }
  for (let i = 0; i < selectedVisitMedia.length; i += 1) {
    const media = selectedVisitMedia[i];
    const mediaId = Number(media?.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) continue;
    out.push({
      id: `legacy-image-${i + 1}`,
      type: 'image',
      media_ids: [mediaId],
      layout: 'single',
      size: i === 0 ? 'lg' : 'md',
      align: 'center',
      caption: String(media?.caption || '').trim(),
    });
  }
  const detailsTitle = String(selected?.visit_details_title || '').trim();
  const detailsText = String(selected?.visit_details_text || '').trim();
  if (detailsText) {
    if (detailsTitle) out.push({ id: 'legacy-heading', type: 'heading', level: 3, text: detailsTitle });
    out.push({ id: 'legacy-details', type: 'paragraph', markdown: detailsText });
  }
  return out;
}

export function mergeDefaultVisitMediaImageBlocks(blocks, visitMedia) {
  const normalized = normalizeEditorialBlocks(blocks);
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

/** Blocs pour l’éditeur visite : legacy complet ou fusion des photos visit_media absentes des blocs image. */
export function resolveEditorialBlocksForEditor(visitEditorialBlocks, selected, sortedVisitMedia) {
  const fromApi = normalizeEditorialBlocks(visitEditorialBlocks || []);
  const trimmedBody = selected?.visit_body_json == null ? '' : String(selected.visit_body_json).trim();
  if (!trimmedBody) {
    return buildLegacyEditorialBlocks(selected, sortedVisitMedia);
  }
  const hasImageBlock = fromApi.some((b) => b.type === 'image');
  if (!hasImageBlock) {
    return mergeDefaultVisitMediaImageBlocks(fromApi, sortedVisitMedia);
  }
  return fromApi;
}
