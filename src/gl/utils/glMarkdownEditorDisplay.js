/**
 * Résolution markdown GL pour l’aperçu WYSIWYG admin (legacy `gl-*`, `scene:N`).
 * Conserve une map resolved → original pour round-trip via `data-gl-md-src`.
 */
import { resolveLegacyGlMediaUrl } from './glLegacyMediaUrl.js';

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const SCENE_REF_RE = /!\[([^\]]*)\]\(\s*(scene:\d+)\s*\)/gi;

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
