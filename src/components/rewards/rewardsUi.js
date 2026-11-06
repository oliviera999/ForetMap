/**
 * Helpers purs de l'interface des badges (lot F). Le catalogue vient du serveur
 * (`GET /api/rewards/me`) : rien n'est codé ici en dur, sauf les mots d'affichage.
 */

/** Mots qui arrêtent l'accord au pluriel d'une unité (« tâche de jardinage »). */
const STOP_WORDS = new Set(['de', 'du', 'des', 'aux', 'à', 'et', 'sans', 'la', 'le', 'les']);

function pluralizeWord(word) {
  if (!word || /[sxz]$/i.test(word) || /^[A-ZÉ«]/.test(word)) return word;
  if (/al$/.test(word)) return `${word.slice(0, -2)}aux`;
  return `${word}s`;
}

/**
 * Unité au pluriel quand `n > 1` : seuls les mots avant la première préposition s'accordent
 * (« espèce observée » → « espèces observées », « tâche de jardinage » → « tâches de
 * jardinage »). Les mots en capitale (« Flash ») et les mots invariables sont laissés.
 */
export function pluralizeUnit(unit, n) {
  const text = String(unit || '').trim();
  if (!text || Number(n) <= 1) return text;
  const words = text.split(/\s+/);
  let stopped = false;
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (stopped) return w;
      if (lower.startsWith('d’') || lower.startsWith("d'") || STOP_WORDS.has(lower)) {
        if (lower !== 'et') stopped = true;
        return w;
      }
      return pluralizeWord(w);
    })
    .join(' ');
}

/** Paliers obtenus d'un badge de base, depuis la liste des badges obtenus. */
export function earnedOf(entry, rewards) {
  return (rewards || []).filter((r) => (r.baseKey || r.key) === entry.key);
}

/**
 * Libellé de progression : « encore 3 tâches de jardinage pour 🌼 Fleur ».
 * @param {object} entry entrée du catalogue (paliers `{ emoji, label, threshold }`)
 * @param {{ remaining?: number|null, nextTier?: number|null }} progress
 */
export function progressLabel(entry, progress) {
  if (!progress || progress.remaining == null || progress.nextTier == null) return '';
  const tier = entry?.tiers?.[progress.nextTier - 1];
  const target = tier ? `${tier.emoji} ${tier.label}` : 'l’obtenir';
  const unit = pluralizeUnit(entry?.unit, progress.remaining);
  return `encore ${progress.remaining}${unit ? ` ${unit}` : ''} pour ${target}`;
}

/**
 * Catalogue regroupé par famille, dans l'ordre des familles du serveur ; une entrée sans
 * famille connue va dans « Autres ». Les badges manuels non obtenus restent visibles, grisés.
 */
export function groupCatalogueByFamily(catalogue, families) {
  const order = Array.isArray(families) && families.length ? families : [];
  const groups = order.map((f) => ({ key: f.key, label: f.label, entries: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const others = { key: 'autres', label: 'Autres', entries: [] };
  for (const entry of catalogue || []) {
    (byKey.get(entry.family) || others).entries.push(entry);
  }
  return [...groups, others].filter((g) => g.entries.length > 0);
}

/** Nombre de badges du catalogue obtenus au moins une fois. */
export function countEarnedEntries(catalogue, rewards) {
  return (catalogue || []).filter((e) => earnedOf(e, rewards).length > 0).length;
}

/** Date d'obtention en français (« 6 nov. 2026 »). */
export function formatAwardDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Libellé court d'un badge obtenu : « 🪴 Main verte — 🌼 Fleur ». */
export function rewardShortLabel(reward) {
  const tier = reward?.tier && reward?.tiers?.[reward.tier - 1];
  const tierText = tier
    ? ` — ${tier.emoji} ${tier.label}`
    : reward?.tier
      ? ` — palier ${reward.tier}`
      : '';
  return `${reward?.emoji || ''} ${reward?.title || ''}${tierText}`.trim();
}
