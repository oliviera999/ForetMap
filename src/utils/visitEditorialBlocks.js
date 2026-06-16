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
    if (detailsTitle)
      out.push({ id: 'legacy-heading', type: 'heading', level: 3, text: detailsTitle });
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
  const trimmedBody =
    selected?.visit_body_json == null ? '' : String(selected.visit_body_json).trim();
  if (!trimmedBody) {
    return buildLegacyEditorialBlocks(selected, sortedVisitMedia);
  }
  const hasImageBlock = fromApi.some((b) => b.type === 'image');
  if (!hasImageBlock) {
    return mergeDefaultVisitMediaImageBlocks(fromApi, sortedVisitMedia);
  }
  return fromApi;
}

/** Parse le JSON des blocs éditoriaux de visite (zone/repère) en blocs normalisés pour l'éditeur. */
export function parseVisitEditorialBlocksFromJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((block) => block && typeof block === 'object' && typeof block.type === 'string')
      .map((block, index) => ({
        id: String(block.id || `${block.type}-${index + 1}`),
        type: String(block.type || '').trim(),
        media_ids: Array.isArray(block.media_ids)
          ? block.media_ids
              .map((id) => Number(id))
              .filter((id, idx, arr) => Number.isFinite(id) && id > 0 && arr.indexOf(id) === idx)
              .slice(0, 2)
          : [],
        layout: block.layout === 'single' ? 'single' : 'duo',
        size: block.size === 'sm' || block.size === 'lg' ? block.size : 'md',
        align: block.align === 'left' || block.align === 'right' ? block.align : 'center',
        caption: String(block.caption || '').trim(),
        markdown: String(block.markdown || ''),
        text: String(block.text || ''),
        level: Number.isFinite(Number(block.level)) ? Number(block.level) : 3,
      }));
  } catch (_) {
    return [];
  }
}

/**
 * Fabrique un nouveau bloc éditorial vierge pour le constructeur de l'éditeur.
 * L'`id` est injecté par l'appelant (le générateur `Date.now()/Math.random` reste
 * dans le composant) pour garder cette fonction pure et testable.
 */
export function buildNewEditorialBlock(type, id) {
  if (type === 'heading') {
    return { id, type: 'heading', level: 3, text: 'Intertitre' };
  }
  if (type === 'image') {
    return {
      id,
      type: 'image',
      media_ids: [],
      layout: 'single',
      size: 'md',
      align: 'center',
      caption: '',
    };
  }
  return { id, type: 'paragraph', markdown: '' };
}

/** Applique un patch partiel au bloc d'`id` donné (les autres blocs inchangés). */
export function updateEditorialBlockById(blocks, id, patch) {
  return blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
}

/**
 * Déplace le bloc d'`id` donné de `delta` positions, borné à [0, length-1].
 * No-op (retourne le tableau d'origine) si l'`id` est introuvable ou la position inchangée.
 */
export function moveEditorialBlockById(blocks, id, delta) {
  const from = blocks.findIndex((b) => b.id === id);
  if (from < 0) return blocks;
  const to = Math.max(0, Math.min(blocks.length - 1, from + delta));
  if (to === from) return blocks;
  const next = [...blocks];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

/** Retire le bloc d'`id` donné. */
export function removeEditorialBlockById(blocks, id) {
  return blocks.filter((b) => b.id !== id);
}

export function normalizeVisitEditorialBlocksForSave(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b && typeof b === 'object' && typeof b.type === 'string')
    .map((b) => {
      if (b.type === 'image') {
        return {
          id: String(b.id || ''),
          type: 'image',
          media_ids: (Array.isArray(b.media_ids) ? b.media_ids : [])
            .map((id) => Number(id))
            .filter((id, idx, arr) => Number.isFinite(id) && id > 0 && arr.indexOf(id) === idx)
            .slice(0, 2),
          layout: b.layout === 'single' ? 'single' : 'duo',
          size: b.size === 'sm' || b.size === 'lg' ? b.size : 'md',
          align: b.align === 'left' || b.align === 'right' ? b.align : 'center',
          caption: String(b.caption || '').trim(),
        };
      }
      if (b.type === 'heading') {
        return {
          id: String(b.id || ''),
          type: 'heading',
          text: String(b.text || '').trim(),
          level: Number.isFinite(Number(b.level)) ? Number(b.level) : 3,
        };
      }
      return {
        id: String(b.id || ''),
        type: 'paragraph',
        markdown: String(b.markdown || ''),
      };
    })
    .filter(
      (b) =>
        (b.type === 'image' && b.media_ids.length > 0) ||
        (b.type === 'heading' && b.text) ||
        (b.type === 'paragraph' && String(b.markdown || '').trim()),
    );
}
