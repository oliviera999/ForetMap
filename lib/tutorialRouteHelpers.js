'use strict';

/**
 * Logique pure de `routes/tutorials.js` (O10) : normalisations, validation d'URL de
 * couverture d'un tutoriel, slugification, conversion HTML → texte brut / PDF (PDFKit,
 * en mémoire uniquement), injection du script de liens d'iframe et transformations
 * lignes SQL → objets publics. Aucune I/O directe, aucun accès req/res/DB.
 */

const PDFDocument = require('pdfkit');
const { normalizeIdArray } = require('./taskRouteHelpers');

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function detectImageExtensionFromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = String(m[1]).toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function extractUploadsRelativePath(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
  try {
    const u = new URL(raw);
    if (u.pathname.startsWith('/uploads/')) return u.pathname.slice('/uploads/'.length);
  } catch {
    return null;
  }
  return null;
}

function isLocalUploadsPath(value) {
  return /^\/uploads\/[^?#\s]+/i.test(normalizeString(value));
}

function isDirectImagePath(value) {
  const raw = normalizeString(value);
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(raw);
}

function isDevLocalhostHttp(url) {
  if (!url || url.protocol !== 'http:') return false;
  return /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
}

function isDirectImageUrl(url) {
  const pathLower = (url?.pathname || '').toLowerCase();
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(pathLower)) return true;
  if (/\/wiki\/special:filepath\//.test(pathLower)) return true;
  return false;
}

/** Erreur texte ou null si la valeur est vide ou valide. */
function validateTutorialCoverImageUrl(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (isLocalUploadsPath(raw)) {
    if (!isDirectImagePath(raw))
      return 'cover_image_url : chemin local invalide (extension image requise)';
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'cover_image_url : URL invalide';
  }
  if (url.protocol !== 'https:' && !isDevLocalhostHttp(url)) {
    return 'cover_image_url : seules les URLs HTTPS (ou localhost en dev) sont autorisées';
  }
  if (!isDirectImageUrl(url)) {
    return "cover_image_url : URL d'image directe requise (.jpg/.png/... ou /wiki/Special:FilePath/...)";
  }
  return null;
}

function resolveLinkedTaskMapId(taskRow, zl, ml) {
  const mapsFromLinks = [
    ...new Set([...zl.map((z) => z.map_id), ...ml.map((x) => x.map_id)].filter(Boolean)),
  ];
  if (mapsFromLinks.length === 1) return mapsFromLinks[0];
  if (mapsFromLinks.length === 0) return taskRow.map_id || null;
  return mapsFromLinks[0];
}

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeSortOrder(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function slugify(input) {
  return (
    normalizeString(input)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'tuto'
  );
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html) {
  const raw = String(html || '');
  const noScript = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = noScript
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|section|article|br)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(noTags);
  return decoded
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function htmlToPdfBuffer(title, html) {
  const text = htmlToPlainText(html);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: { Title: title || 'Tutoriel ForetMap' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(title || 'Tutoriel ForetMap', { align: 'left' });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#5b6456').text('Export PDF généré automatiquement par ForetMap');
    doc.moveDown(1.2);
    doc
      .fillColor('#111111')
      .fontSize(11)
      .text(text || 'Contenu vide.', {
        lineGap: 3,
        paragraphGap: 8,
        align: 'left',
      });
    doc.end();
  });
}

/** Réécrit les clics `target="_blank"` pour rester dans l’iframe (modale app). */
const TUTORIAL_VIEW_IFRAME_LINK_SCRIPT = `<script>(function(){document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var href=(a.getAttribute("href")||"").trim();if(!href||href.toLowerCase().startsWith("javascript:"))return;var t=(a.getAttribute("target")||"").toLowerCase();if(t==="_blank"||t==="_top"){e.preventDefault();window.location.href=a.href;}},true);})();<\/script>`;

function injectTutorialViewIframeLinkScript(html) {
  const s = String(html || '');
  if (!s.trim()) return s;
  const replaced = s.replace(/<\/body\s*>/i, `${TUTORIAL_VIEW_IFRAME_LINK_SCRIPT}</body>`);
  if (replaced !== s) return replaced;
  return `${s}${TUTORIAL_VIEW_IFRAME_LINK_SCRIPT}`;
}

function toPublicTutorialRow(row, zonesLinked = [], markersLinked = []) {
  const zl = zonesLinked || [];
  const ml = markersLinked || [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    type: row.type,
    summary: row.summary || '',
    cover_image_url: row.cover_image_url || null,
    source_url: row.source_url || null,
    source_file_path: row.source_file_path || null,
    is_active: Number(row.is_active) === 1,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    linked_tasks_count: Number(row.linked_tasks_count) || 0,
    zone_ids: zl.map((z) => z.id),
    marker_ids: ml.map((x) => x.id),
    zones_linked: zl.map((z) => ({ id: z.id, name: z.name, map_id: z.map_id })),
    markers_linked: ml.map((x) => ({ id: x.id, label: x.label, map_id: x.map_id })),
  };
}

function buildLinkedTaskLocationHint(zoneName, markerLabel) {
  const z = zoneName ? String(zoneName).trim() : '';
  const m = markerLabel ? String(markerLabel).trim() : '';
  if (z && m) return `${z} · ${m}`;
  if (z) return z;
  if (m) return m;
  return '';
}

module.exports = {
  normalizeString,
  detectImageExtensionFromDataUrl,
  extractUploadsRelativePath,
  isLocalUploadsPath,
  isDirectImagePath,
  isDevLocalhostHttp,
  isDirectImageUrl,
  validateTutorialCoverImageUrl,
  normalizeIdArray,
  resolveLinkedTaskMapId,
  isValidHttpUrl,
  sanitizeSortOrder,
  slugify,
  decodeHtmlEntities,
  htmlToPlainText,
  htmlToPdfBuffer,
  TUTORIAL_VIEW_IFRAME_LINK_SCRIPT,
  injectTutorialViewIframeLinkScript,
  toPublicTutorialRow,
  buildLinkedTaskLocationHint,
};
