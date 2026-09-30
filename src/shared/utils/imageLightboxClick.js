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

/** Lien dont la cible est elle-même une image : la lightbox remplace la navigation. */
const IMAGE_HREF_RE = /(\.(jpe?g|png|webp|gif|avif)(\?.*)?$)|^\/?uploads\/|\/uploads\//i;

/**
 * @param {Element} img
 * @returns {HTMLAnchorElement | null} lien englobant qui mène ailleurs qu'à une image
 */
function closestNonImageLink(img) {
  const link = img.closest('a[href]');
  if (!link) return null;
  const href = String(link.getAttribute('href') || '');
  return IMAGE_HREF_RE.test(href) ? null : link;
}

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
  if (closestNonImageLink(img)) return true;
  return false;
}

/**
 * @param {HTMLImageElement} img
 * @returns {string}
 */
export function resolveImageLightboxSrc(img) {
  const dataSrc = img.dataset.lightboxSrc || img.getAttribute('data-lightbox-src');
  if (dataSrc) return String(dataSrc).trim();
  const link = img.closest('a[href]');
  if (link) {
    const href = String(link.getAttribute('href') || '').trim();
    if (IMAGE_HREF_RE.test(href)) return href;
  }
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

function isTinyImage(img) {
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  return w > 0 && h > 0 && w <= 16 && h <= 16;
}

/**
 * @param {Element | null | undefined} img
 * @returns {boolean}
 */
export function shouldOpenImageLightbox(img) {
  if (!isHtmlImageElement(img)) return false;
  if (isImageLightboxExcluded(img)) return false;
  if (!resolveImageLightboxSrc(img)) return false;
  if (isTinyImage(img)) return false;
  return true;
}

/**
 * Galerie implicite : les images agrandissables du plus proche `[data-lightbox-gallery]`.
 * @param {HTMLImageElement} img
 * @returns {{ gallery: { src: string, caption: string }[] | null, index: number }}
 */
export function resolveImageLightboxGallery(img) {
  const container = img.closest('[data-lightbox-gallery]');
  if (!container) return { gallery: null, index: 0 };
  const imgs = [...container.querySelectorAll('img')].filter(
    (candidate) => candidate === img || shouldOpenImageLightbox(candidate),
  );
  if (imgs.length < 2) return { gallery: null, index: 0 };
  return {
    gallery: imgs.map((candidate) => ({
      src: resolveImageLightboxSrc(candidate),
      caption: resolveImageLightboxCaption(candidate),
    })),
    index: Math.max(0, imgs.indexOf(img)),
  };
}

function buildPayload(img) {
  const { gallery, index } = resolveImageLightboxGallery(img);
  return {
    src: resolveImageLightboxSrc(img),
    caption: resolveImageLightboxCaption(img),
    gallery,
    index,
  };
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
  openLightbox(buildPayload(img));
  return true;
}

/**
 * Entrée / Espace sur une image rendue focalisable par {@link decorateLightboxImage}.
 * @param {KeyboardEvent} event
 * @param {(payload: object) => void} openLightbox
 */
export function handleImageLightboxKeyDown(event, openLightbox) {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  const target = event.target;
  if (!isHtmlImageElement(target) || !target.hasAttribute('data-lightbox-focusable')) return false;
  if (!shouldOpenImageLightbox(target)) return false;
  event.preventDefault();
  openLightbox(buildPayload(target));
  return true;
}

/**
 * Image déclarée décorative (`alt=""` exact, `aria-hidden="true"` ou rôle `presentation` /
 * `none`) : lui donner un rôle bouton et un nom accessible créerait un conflit de rôle
 * (règle axe `presentation-role-conflict`). Elle reste agrandissable à la souris.
 * @param {Element} img
 * @returns {boolean}
 */
export function isDecorativeImage(img) {
  if (!isHtmlImageElement(img)) return false;
  if (img.getAttribute('alt') === '') return true;
  if (String(img.getAttribute('aria-hidden') || '').toLowerCase() === 'true') return true;
  const role = String(img.getAttribute('role') || '')
    .trim()
    .toLowerCase();
  return role === 'presentation' || role === 'none';
}

/**
 * Rend une image agrandissable atteignable au clavier (WCAG 2.1.1) : `tabindex`, rôle
 * bouton et nom « Agrandir… ». Sans effet sur une image déjà focalisable, exclue ou
 * décorative (cf. {@link isDecorativeImage}).
 * @param {HTMLImageElement} img
 */
export function decorateLightboxImage(img) {
  if (!isHtmlImageElement(img)) return;
  if (img.hasAttribute('data-lightbox-focusable')) return;
  if (img.hasAttribute('tabindex')) return;
  if (isImageLightboxExcluded(img) || isTinyImage(img)) return;
  if (isDecorativeImage(img)) return;
  const alt = String(img.getAttribute('alt') || '').trim();
  img.setAttribute('data-lightbox-focusable', '');
  img.setAttribute('tabindex', '0');
  img.setAttribute('role', 'button');
  img.setAttribute('aria-label', alt ? `Agrandir l’image : ${alt}` : 'Agrandir l’image');
}

/** @param {ParentNode} root */
export function decorateLightboxImagesIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  if (isHtmlImageElement(root)) decorateLightboxImage(root);
  for (const img of root.querySelectorAll('img:not([data-lightbox-focusable])')) {
    decorateLightboxImage(img);
  }
}
