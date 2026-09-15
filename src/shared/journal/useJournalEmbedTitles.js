import { useEffect, useState } from 'react';

/**
 * Hydratation des encarts du carnet. Le markdown ne stocke que le type et la référence
 * de l'encart (round-trip d'édition intact) ; ce hook résout les TITRES réels côté serveur
 * puis les injecte en attribut sur le HTML déjà sécurisé, sans toucher au markdown. Le CSS
 * affiche alors le vrai titre (repli sur « type · ref » si non résolu).
 *
 * Les deux dialectes d'encart sont reconnus, quel que soit le produit : `.journal-embed`
 * (`data-embed-type` / `data-ref` → `data-journal-title`, ForetMap) et `.gl-journal-embed`
 * (`data-gl-embed-type` / `data-gl-ref` → `data-gl-title`, G&L).
 */

const EMBED_SELECTOR = '.journal-embed[data-ref], .gl-journal-embed[data-gl-ref]';

function readEmbed(el) {
  const gl = el.hasAttribute('data-gl-ref');
  const type = gl ? el.getAttribute('data-gl-embed-type') : el.getAttribute('data-embed-type');
  const ref = gl ? el.getAttribute('data-gl-ref') : el.getAttribute('data-ref');
  return { type, ref, titleAttr: gl ? 'data-gl-title' : 'data-journal-title' };
}

/** Encarts `{ type, ref }` présents dans un HTML sécurisé (dédoublonnés). */
export function parseJournalEmbeds(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set();
  const out = [];
  doc.querySelectorAll(EMBED_SELECTOR).forEach((el) => {
    const { type, ref } = readEmbed(el);
    if (!type || !ref) return;
    const key = `${type}|${ref}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type, ref });
  });
  return out;
}

/** Injecte les titres résolus (`titles['type|ref']`) ; renvoie le HTML d'origine si rien ne change. */
export function hydrateJournalEmbedTitles(html, titles) {
  if (!html || !titles || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  doc.querySelectorAll(EMBED_SELECTOR).forEach((el) => {
    const { type, ref, titleAttr } = readEmbed(el);
    const title = titles[`${type}|${ref}`];
    if (title) {
      el.setAttribute(titleAttr, title);
      changed = true;
    }
  });
  return changed ? doc.body.innerHTML : html;
}

/**
 * Renvoie le HTML d'aperçu avec les encarts hydratés. Tant que la résolution n'a pas
 * répondu, renvoie le HTML d'origine (affichage progressif) ; une erreur réseau le laisse tel
 * quel (repli CSS).
 *
 * @param {string} html HTML déjà sécurisé (`renderMarkdownToSafeHtml`)
 * @param {(embeds: { type: string, ref: string }[]) => Promise<{ titles?: Record<string, string> }>} resolveEmbeds
 *   résolveur produit (`adapter.resolveEmbeds`)
 */
export function useJournalEmbedTitles(html, resolveEmbeds) {
  const [hydrated, setHydrated] = useState(html);

  useEffect(() => {
    setHydrated(html);
    const embeds = parseJournalEmbeds(html);
    if (!embeds.length || typeof resolveEmbeds !== 'function') return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => resolveEmbeds(embeds))
      .then((res) => {
        if (cancelled) return;
        const titles = res?.titles || {};
        if (Object.keys(titles).length) setHydrated(hydrateJournalEmbedTitles(html, titles));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [html, resolveEmbeds]);

  return hydrated;
}
