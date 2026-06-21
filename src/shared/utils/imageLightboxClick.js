/** @param {unknown} value */
function isHtmlImageElement(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    'tagName' in value &&
    String(value.tagName).toUpperCase() === 'IMG'
  );
}

/** @param {unknown} value */
function isDomElement(value) {
  return value != null && typeof value === 'object' && typeof value.closest === 'function';
}

/** Ancêtres interactifs ou décoratifs : pas d’ouverture lightbox au clic image. */
export const IMAGE_LIGHTBOX_EXCLUDE_ANCESTOR_SELECTORS = [
  '.fm-lightbox-overlay',
  '[data-no-lightbox]',
  '.map-view-canvas',
  '.gl-board-fit-layer',
  '.visit-map-mascot',
  '.img-upload-area',
  'button',
  'label',
];

/** Classes sur `<img>` exclues (logos, icônes de marque). */
export const IMAGE_LIGHTBOX_EXCLUDE_IMG_CLASS_RE =
  /\b(gl-brand-logo|gl-auth-logo|visit-map-mascot-sprite-preload)\b/;

/**
 * @param {Element | null | undefined} img
 * @returns {boolean}
 */
export function isImageLightboxExcluded(img) {
  if (!isHtmlImageElement(img)) return true;
  if (img.hasAttribute('data-no-lightbox')) return true;
  const className = String(img.className || '');
  if (IMAGE_LIGHTBOX_EXCLUDE_IMG_CLASS_RE.test(className)) return true;
  for (const selector of IMAGE_LIGHTBOX_EXCLUDE_ANCESTOR_SELECTORS) {
    if (img.closest(selector)) return true;
  }
  return false;
}

/**
 * @param {HTMLImageElement} img
 * @returns {string}
 */
export function resolveImageLightboxSrc(img) {
  const dataSrc = img.dataset.lightboxSrc || img.getAttribute('data-lightbox-src');
  if (dataSrc) return String(dataSrc).trim();
  return String(img.currentSrc || img.src || '').trim();
}

/**
 * @param {HTMLImageElement} img
 * @returns {string}
 */
export function resolveImageLightboxCaption(img) {
  const explicit = img.dataset.lightboxCaption || img.getAttribute('data-lightbox-caption');
  if (explicit) return String(explicit).trim();
  const figcaption = img.closest('figure')?.querySelector('figcaption');
  if (figcaption) return String(figcaption.textContent || '').trim();
  return String(img.alt || img.title || '').trim();
}

/**
 * @param {Element | null | undefined} img
 * @returns {boolean}
 */
export function shouldOpenImageLightbox(img) {
  if (!isHtmlImageElement(img)) return false;
  if (isImageLightboxExcluded(img)) return false;
  if (!resolveImageLightboxSrc(img)) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (w > 0 && h > 0 && w <= 16 && h <= 16) return false;
  return true;
}

/**
 * @param {MouseEvent} event
 * @param {(payload: { src: string, caption: string }) => void} openLightbox
 * @returns {boolean} true si la lightbox a été ouverte
 */
export function handleImageLightboxClick(event, openLightbox) {
  const target = event.target;
  if (!isDomElement(target)) return false;
  const img = target.closest('img');
  if (!img || !shouldOpenImageLightbox(img)) return false;
  event.preventDefault();
  event.stopPropagation();
  openLightbox({
    src: resolveImageLightboxSrc(img),
    caption: resolveImageLightboxCaption(img),
  });
  return true;
}
