/**
 * Résolution markdown GL pour l’aperçu WYSIWYG admin (legacy `gl-*`, `scene:N`).
 * Conserve une map resolved → original pour round-trip via `data-gl-md-src`.
 */
import { resolveLegacyGlMediaUrl } from './glLegacyMediaUrl.js';

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const SCENE_REF_RE = /!\[([^\]]*)\]\(\s*(scene:\d+)\s*\)/gi;
const HTML_IMG_RE = /<img\b[^>]*>/gi;
// `(?<![\w-])` : ne pas lire `data-gl-md-src="…"` comme l'attribut `src`.
const HTML_SRC_ATTR_RE = /(?<![\w-])src=(['"])\s*([^'"]*?)\s*\1/i;
const HTML_ALT_ATTR_RE = /(?<![\w-])alt=(['"])([^'"]*)\1/i;
const HTML_FRAME_ATTR_RE = /\bdata-gl-frame=(?:'([^']*)'|"([^"]*)")/i;

/** Classe du substitut d'une image dont la référence n'est pas (encore) résolue. */
export const GL_UNRESOLVED_IMAGE_CLASS = 'gl-rich-editor-unresolved-image';

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} markdown
 * @param {{ scenes?: Array<{ url?: string, caption?: string|null }>, resolveLegacyUrl?: (stableKey: string) => string|null, withSceneRefs?: boolean }} [options]
 * @returns {{ displayMarkdown: string, originalSrcByResolved: Map<string, string> }}
 */
export function resolveGlMarkdownForEditorDisplay(markdown, options = {}) {
  const raw = String(markdown ?? '');
  const originalSrcByResolved = new Map();
  if (!raw) return { displayMarkdown: raw, originalSrcByResolved };

  const { scenes = [], resolveLegacyUrl = null, withSceneRefs = false } = options;
  let displayMarkdown = raw;

  if (typeof resolveLegacyUrl === 'function') {
    displayMarkdown = displayMarkdown.replace(MD_IMAGE_RE, (match, alt, href) => {
      const trimmed = String(href || '').trim();
      if (trimmed.startsWith('scene:')) return match;
      const resolved = resolveLegacyGlMediaUrl(trimmed, resolveLegacyUrl);
      if (resolved !== trimmed) {
        originalSrcByResolved.set(resolved, trimmed);
        return `![${alt}](${resolved})`;
      }
      return match;
    });
  }

  if (withSceneRefs && Array.isArray(scenes) && scenes.length > 0) {
    displayMarkdown = displayMarkdown.replace(SCENE_REF_RE, (match, alt, sceneRef) => {
      const rank = Number(String(sceneRef || '').replace(/^scene:/i, ''));
      const scene = scenes[rank - 1];
      if (!scene?.url) return match;
      originalSrcByResolved.set(scene.url, String(sceneRef).trim());
      const label = String(alt || '').trim() || scene.caption || '';
      return `![${label}](${scene.url})`;
    });
    // Forme HTML : c'est celle que l'éditeur riche réécrit à l'enregistrement
    // (`<img src="scene:N" … data-gl-frame>`). Sans cette passe, une scène enregistrée une
    // première fois n'était plus résolue à la relecture (audit des bugs G&L 2026-11-19, E4).
    displayMarkdown = displayMarkdown.replace(HTML_IMG_RE, (tag) => {
      const srcMatch = tag.match(HTML_SRC_ATTR_RE);
      const sceneRef = String(srcMatch?.[2] || '').trim();
      if (!/^scene:\d+$/i.test(sceneRef)) return tag;
      const scene = scenes[Number(sceneRef.replace(/^scene:/i, '')) - 1];
      if (!scene?.url) return tag;
      originalSrcByResolved.set(scene.url, sceneRef);
      const resolvedTag = tag.replace(HTML_SRC_ATTR_RE, `src="${escapeAttr(scene.url)}"`);
      if (/\bdata-gl-md-src=/i.test(resolvedTag)) return resolvedTag;
      return resolvedTag.replace(/^<img\b/i, `<img data-gl-md-src="${escapeAttr(sceneRef)}"`);
    });
  }

  return { displayMarkdown, originalSrcByResolved };
}

/**
 * Ajoute `data-gl-md-src` sur les images dont l’URL affichée a été réécrite.
 * @param {string} html
 * @param {Map<string, string>} originalSrcByResolved resolvedUrl → originalRef
 * @returns {string}
 */
export function annotateEditorHtmlWithOriginalSrc(html, originalSrcByResolved) {
  const source = String(html || '');
  if (!source || !originalSrcByResolved?.size) return source;
  if (typeof document === 'undefined') {
    return source.replace(/<img\b([^>]*)>/gi, (tag, attrs) => {
      const srcMatch = attrs.match(/\bsrc=(['"])(.*?)\1/i);
      const src = srcMatch?.[2] || '';
      const original = originalSrcByResolved.get(src);
      if (!original || /\bdata-gl-md-src=/i.test(attrs)) return tag;
      return `<img data-gl-md-src="${original.replace(/"/g, '&quot;')}"${attrs}>`;
    });
  }
  const template = document.createElement('template');
  template.innerHTML = source;
  template.content.querySelectorAll('img').forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    const original = originalSrcByResolved.get(src);
    if (original && !img.getAttribute('data-gl-md-src')) {
      img.setAttribute('data-gl-md-src', original);
    }
  });
  return template.innerHTML;
}

/**
 * Balise du substitut d'une image non résolue. C'est une ancre sans `href` : l'assainisseur
 * partagé ne garde ni `span` ni image à source inconnue, mais conserve `a`, `class`, `title`
 * et les attributs `data-gl-*`. La source d'origine voyage dans `data-gl-md-src`, comme pour
 * une image résolue ; un `data-gl-frame` signale la forme HTML (image cadrée).
 *
 * @param {{ src: string, alt?: string, frame?: string|null }} ref
 * @returns {string}
 */
export function unresolvedImagePlaceholderHtml({ src, alt = '', frame = null }) {
  const label = String(alt || '').trim();
  const frameAttr =
    frame == null ? '' : ` data-gl-frame='${String(frame).replace(/'/g, '&apos;')}'`;
  const text = label ? `${label} (${src})` : src;
  return `<a class="${GL_UNRESOLVED_IMAGE_CLASS}" data-gl-md-src="${escapeAttr(src)}" title="${escapeAttr(label)}"${frameAttr}>🖼 ${escapeAttr(text)}</a>`;
}

/**
 * Remplace, dans le markdown d'affichage de l'éditeur, chaque image dont la source ne peut pas
 * être affichée (`scene:N` tant que les scènes ne sont pas chargées, scène inexistante…) par un
 * substitut qui porte sa source d'origine. Sans lui, l'assainisseur retirait l'image du DOM
 * éditable et la première frappe réécrivait le texte sans elle (audit 2026-11-19, E4).
 *
 * @param {string} displayMarkdown markdown déjà passé par le résolveur
 * @param {(src: string) => boolean} isDisplayable vrai si l'assainisseur garde cette source
 * @returns {string}
 */
export function protectUnresolvedEditorImages(displayMarkdown, isDisplayable) {
  const raw = String(displayMarkdown ?? '');
  if (!raw || typeof isDisplayable !== 'function') return raw;
  const withMarkdownImages = raw.replace(MD_IMAGE_RE, (match, alt, href) => {
    const src = String(href || '').trim();
    if (!src || /\s/.test(src) || isDisplayable(src)) return match;
    return unresolvedImagePlaceholderHtml({ src, alt });
  });
  return withMarkdownImages.replace(HTML_IMG_RE, (tag) => {
    const src = String(tag.match(HTML_SRC_ATTR_RE)?.[2] || '').trim();
    if (!src || isDisplayable(src)) return tag;
    const alt = tag.match(HTML_ALT_ATTR_RE)?.[2] || '';
    const frameMatch = tag.match(HTML_FRAME_ATTR_RE);
    const frame = frameMatch ? (frameMatch[1] ?? frameMatch[2] ?? '') : '';
    return unresolvedImagePlaceholderHtml({ src, alt, frame });
  });
}
