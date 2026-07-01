import { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

// Hydratation des encarts `gl-journal-embed` : le corps markdown ne stocke que le
// type + la référence de l'encart (round-trip d'édition intact). Ce hook résout les
// TITRES réels côté serveur puis les injecte en attribut `data-gl-title` sur le HTML
// déjà sécurisé, sans jamais toucher au markdown stocké. Le CSS affiche alors le vrai
// titre (repli sur « type · ref » si non résolu).

function parseEmbeds(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  doc.querySelectorAll('.gl-journal-embed[data-gl-ref]').forEach((el) => {
    const type = el.getAttribute('data-gl-embed-type');
    const ref = el.getAttribute('data-gl-ref');
    if (type && ref) out.push({ type, ref });
  });
  return out;
}

function hydrate(html, titles) {
  if (!html || !titles || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  doc.querySelectorAll('.gl-journal-embed[data-gl-ref]').forEach((el) => {
    const type = el.getAttribute('data-gl-embed-type');
    const ref = el.getAttribute('data-gl-ref');
    const title = titles[`${type}|${ref}`];
    if (title) {
      el.setAttribute('data-gl-title', title);
      changed = true;
    }
  });
  return changed ? doc.body.innerHTML : html;
}

/**
 * Renvoie le HTML d'aperçu avec les encarts hydratés (titre réel). Tant que la
 * résolution n'a pas répondu, renvoie le HTML d'origine (affichage progressif).
 * @param {string} html HTML déjà sécurisé (renderMarkdownToSafeHtml)
 */
export function useGlJournalEmbedTitles(html) {
  const [hydrated, setHydrated] = useState(html);

  useEffect(() => {
    setHydrated(html);
    const embeds = parseEmbeds(html);
    if (!embeds.length) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiGL('/api/gl/player-journal/embeds/resolve', 'POST', { embeds }))
      .then((res) => {
        if (cancelled) return;
        const titles = res?.titles || {};
        if (Object.keys(titles).length) setHydrated(hydrate(html, titles));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [html]);

  return hydrated;
}
