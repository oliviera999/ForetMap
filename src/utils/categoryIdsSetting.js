/**
 * Sérialisation des listes d'ids de catégories dans les réglages
 * (`ui.*.default_category_ids`, `ui.plan.hidden_category_ids`) : `;` / `,` / espaces.
 */

/** @param {unknown} raw */
export function parseCategoryIdsSetting(raw) {
  return String(raw || '')
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @param {Iterable<string|number>|null|undefined} ids */
export function formatCategoryIdsSetting(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const s = String(id || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.join(';');
}

/**
 * File d'écriture « dernière valeur gagne » : une seule requête à la fois, et si
 * plusieurs valeurs arrivent pendant l'attente, seule la plus récente part.
 * Évite qu'un PUT lent d'une sélection partielle écrase un PUT plus récent
 * (cases à cocher cliquées avant le re-rendu « désactivé »).
 *
 * @param {(value: string) => Promise<unknown>|unknown} writeFn
 * @param {{ onIdle?: () => void }} [options] appelé quand plus rien n'est en file
 */
export function createLatestWriteQueue(writeFn, options = {}) {
  let inflight = false;
  let pending = undefined;
  let hasPending = false;

  async function flush() {
    if (inflight) return;
    if (!hasPending) return;
    const value = pending;
    hasPending = false;
    pending = undefined;
    inflight = true;
    try {
      await writeFn(value);
    } finally {
      inflight = false;
      if (hasPending) await flush();
      else options.onIdle?.();
    }
  }

  return {
    /** @param {string} value */
    push(value) {
      pending = value;
      hasPending = true;
      return flush();
    },
  };
}
