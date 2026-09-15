import { useEffect, useState } from 'react';

/**
 * Hydratation des encarts du carnet : titres (compat) + cartes enrichies (planches).
 */

const EMBED_SELECTOR = '.journal-embed[data-ref], .gl-journal-embed[data-gl-ref]';

function readEmbed(el) {
  const gl = el.hasAttribute('data-gl-ref');
  const type = gl ? el.getAttribute('data-gl-embed-type') : el.getAttribute('data-embed-type');
  const ref = gl ? el.getAttribute('data-gl-ref') : el.getAttribute('data-ref');
  return {
    type,
    ref,
    titleAttr: gl ? 'data-gl-title' : 'data-journal-title',
    gl,
  };
}

function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeImageUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('/uploads/')) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
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
 * Remplit chaque encart en planche (titre, extrait, vignette) à partir de `cards`.
 * Conserve aussi les attributs titre pour le CSS de repli.
 */
export function hydrateJournalEmbedCards(html, cards, titles = null) {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  doc.querySelectorAll(EMBED_SELECTOR).forEach((el) => {
    const { type, ref, titleAttr } = readEmbed(el);
    const key = `${type}|${ref}`;
    const card = cards?.[key];
    const title = card?.title || titles?.[key];
    if (title) {
      el.setAttribute(titleAttr, title);
      changed = true;
    }
    if (!card) return;
    el.classList.add('journal-embed--plate');
    el.setAttribute('data-plate', '1');
    const label = escapeText(card.label || type);
    const safeTitle = escapeText(card.title || title || ref);
    const excerpt = card.excerpt
      ? `<p class="journal-embed-plate__excerpt">${escapeText(card.excerpt)}</p>`
      : '';
    const img = isSafeImageUrl(card.imageUrl)
      ? `<img class="journal-embed-plate__thumb" src="${escapeText(card.imageUrl)}" alt="" loading="lazy" />`
      : '';
    el.innerHTML = `${img}<div class="journal-embed-plate__body"><p class="journal-embed-plate__label">${label}</p><p class="journal-embed-plate__title">${safeTitle}</p>${excerpt}</div>`;
    changed = true;
  });
  return changed ? doc.body.innerHTML : html;
}

/**
 * @param {string} html
 * @param {(embeds: { type: string, ref: string }[]) => Promise<{ titles?: Record<string, string>, cards?: Record<string, object> }>} resolveEmbeds
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
        const cards = res?.cards || {};
        if (Object.keys(cards).length) {
          setHydrated(hydrateJournalEmbedCards(html, cards, titles));
        } else if (Object.keys(titles).length) {
          setHydrated(hydrateJournalEmbedTitles(html, titles));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [html, resolveEmbeds]);

  return hydrated;
}
