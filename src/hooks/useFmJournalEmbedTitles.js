import { useEffect, useState } from 'react';
import { api } from '../services/api';

function parseEmbeds(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  doc.querySelectorAll('.journal-embed[data-ref], .gl-journal-embed[data-gl-ref]').forEach((el) => {
    const type = el.getAttribute('data-embed-type') || el.getAttribute('data-gl-embed-type');
    const ref = el.getAttribute('data-ref') || el.getAttribute('data-gl-ref');
    if (type && ref) out.push({ type, ref });
  });
  return out;
}

function hydrate(html, titles) {
  if (!html || !titles || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  doc.querySelectorAll('.journal-embed[data-ref], .gl-journal-embed[data-gl-ref]').forEach((el) => {
    const type = el.getAttribute('data-embed-type') || el.getAttribute('data-gl-embed-type');
    const ref = el.getAttribute('data-ref') || el.getAttribute('data-gl-ref');
    const title = titles[`${type}|${ref}`];
    if (title) {
      el.setAttribute('data-journal-title', title);
      el.setAttribute('data-gl-title', title);
      changed = true;
    }
  });
  return changed ? doc.body.innerHTML : html;
}

/** Hydrate les titres d’encarts du carnet FM. */
export function useFmJournalEmbedTitles(html) {
  const [hydrated, setHydrated] = useState(html);

  useEffect(() => {
    setHydrated(html);
    const embeds = parseEmbeds(html);
    if (!embeds.length) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => api('/api/user-journal/embeds/resolve', 'POST', { embeds }))
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
