/**
 * Export image du graphe du réseau trophique — SVG et PNG (sorti de `FoodWebGraph.jsx`, flux
 * C3). Le CSS de la page ne s'applique pas hors DOM : les styles utiles sont embarqués.
 */

import { buildEdgeExportCss } from '../../shared/foodWebEdgeStyle.js';

/** Styles embarqués pour l'export SVG/PNG (le CSS de la page ne s'applique pas hors DOM). */
export const EXPORT_STYLE = `
  ${buildEdgeExportCss()}
  .pedago-foodweb-graph__node{fill:#dcfce7;stroke:#16a34a;stroke-width:1.5}
  .pedago-foodweb-graph__node.highlight{fill:#bbf7d0;stroke-width:2.5}
  .pedago-foodweb-graph__node.dim{opacity:.18}
  .pedago-foodweb-graph__node--env{fill:#f3f4f6;stroke:#94a3b8;stroke-dasharray:3 3}
  .pedago-foodweb-graph__node--outside{fill:#fff7ed;stroke:#ea9a5c;stroke-dasharray:5 3}
  .pedago-foodweb-graph__label{font:600 10px sans-serif;fill:#1f2937;paint-order:stroke;stroke:#ffffff;stroke-width:2.5px;stroke-linejoin:round}
  .pedago-foodweb-graph__label.dim{opacity:.2}
  .pedago-foodweb-graph__col-label{font:600 11px sans-serif;fill:#4b5563}
  .pedago-foodweb-graph__band-label{font:600 11px sans-serif;fill:#4b5563}
  .pedago-foodweb-graph__band-rule{stroke:#d7e3da;stroke-width:1;stroke-dasharray:4 4}
  .pedago-foodweb-graph__node-emoji{font:16px sans-serif}
`;

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sérialise le SVG du graphe pour l'export, cadré (pan / zoom neutralisés) et autonome.
 *
 * @param {SVGSVGElement|null} svg
 * @param {{ width: number, height: number }} size
 * @returns {string} chaîne vide sans SVG
 */
export function serializeGraphSvg(svg, { width, height }) {
  if (!svg) return '';
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  // neutralise pan/zoom pour un export cadré
  const inner = clone.querySelector('[data-fw-viewport]');
  if (inner) inner.setAttribute('transform', 'translate(0,0) scale(1)');
  const style = document.createElement('style');
  style.textContent = EXPORT_STYLE;
  clone.insertBefore(style, clone.firstChild);
  return new window.XMLSerializer().serializeToString(clone);
}

/** Télécharge le graphe en SVG. */
export function exportGraphSvg(svg, size) {
  const str = serializeGraphSvg(svg, size);
  if (!str) return;
  download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), 'reseau-trophique.svg');
}

/** Télécharge le graphe en PNG (double résolution, fond blanc). */
export function exportGraphPng(svg, size) {
  const str = serializeGraphSvg(svg, size);
  if (!str) return;
  const scale = 2;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width * scale;
    canvas.height = size.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) download(blob, 'reseau-trophique.png');
    }, 'image/png');
  };
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(str)))}`;
}
