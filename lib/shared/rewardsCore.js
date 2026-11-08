/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/rewards/rewardsCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Noyau des badges — **commun à tous les produits** (ForetMap, Gnomes & Licornes) et à tous
 * les côtés (front, serveur). Aucune règle métier ici : seulement la mécanique partagée.
 *
 *  - paliers phénologiques (🌸 Bourgeon, 🌼 Fleur, 🍎 Fruit) par défaut ; un produit peut
 *    passer ses propres noms de paliers (même nombre, même forme `{ n, emoji, label }`) à
 *    `createRewardsEngine({ tiers })`, `publicCatalogueEntry` et `rewardShortLabel` ;
 *  - forme des clés enregistrées : `<badge>.<n>` pour un palier, `<badge>` pour un badge
 *    unique, `<badge>.<n>` (n-ième fois) pour un badge décerné par un adulte ;
 *  - palier atteint pour une valeur, entrée publique d'un catalogue ;
 *  - libellés d'affichage (pluriel d'une unité, progression, regroupement par famille).
 *
 * Chaque produit fournit son **catalogue** (entrées `{ key, family, emoji, title,
 * description, tiers?, unit?, source, metric? }`) et ses **familles** ; ce module ne connaît
 * ni l'un ni l'autre. Moteur serveur générique : `lib/rewards/core/engine.js`.
 *
 * Miroir CJS : `lib/shared/rewardsCore.js` (généré par `npm run sync:shared-cores`).
 * Aucune I/O ici.
 */

/** Paliers phénologiques (seuils 1, 2, 3 du tableau `tiers` d'une entrée). */
const REWARD_TIERS = Object.freeze([
  Object.freeze({ n: 1, emoji: '🌸', label: 'Bourgeon' }),
  Object.freeze({ n: 2, emoji: '🌼', label: 'Fleur' }),
  Object.freeze({ n: 3, emoji: '🍎', label: 'Fruit' }),
]);

/**
 * Contrôle d'une liste de paliers d'un produit : `REWARD_TIERS.length` entrées `{ n, emoji,
 * label }` numérotées 1..n. Lève une erreur au premier défaut ; renvoie la liste gelée.
 * @param {Array<{ n: number, emoji: string, label: string }>} tiers
 * @param {string} [name]
 */
function assertValidTiers(tiers, name = 'paliers') {
  if (!Array.isArray(tiers) || tiers.length !== REWARD_TIERS.length) {
    throw new Error(`${name} : ${REWARD_TIERS.length} paliers attendus.`);
  }
  tiers.forEach((t, i) => {
    if (!t || Number(t.n) !== i + 1 || !t.emoji || !t.label) {
      throw new Error(`${name} : palier ${i + 1} incomplet.`);
    }
  });
  return Object.freeze(tiers.map((t) => Object.freeze({ ...t })));
}

/** Sources d'un badge : calculé, attribué à un événement, décerné par un adulte. */
const REWARD_SOURCES = Object.freeze(['auto', 'event', 'manual']);

/** Longueur maximale d'une clé enregistrée (colonne `reward_key`). */
const REWARD_KEY_MAX_LENGTH = 64;

/** Clé enregistrée d'un palier (`metier.jardinage.2`) ou d'un badge unique (`ecotone`). */
function tierRewardKey(entry, n) {
  return entry.tiers ? `${entry.key}.${n}` : entry.key;
}

/** Toutes les clés enregistrables d'un badge calculé ou d'événement (une par palier). */
function storedKeysOf(entry) {
  if (entry.source !== 'auto' && entry.source !== 'event') return [];
  if (!entry.tiers) return [entry.key];
  return entry.tiers.map((_, i) => tierRewardKey(entry, i + 1));
}

/**
 * Lecteur de clés pour un catalogue donné : `parse(key)` → `{ entry, tier, occurrence }` ou
 * null si la clé n'appartient pas au catalogue.
 * @param {Map<string, object>} catalogueByKey
 */
function createRewardKeyParser(catalogueByKey) {
  return function parseRewardKey(key) {
    const raw = String(key || '');
    if (catalogueByKey.has(raw)) {
      const entry = catalogueByKey.get(raw);
      return entry.tiers || entry.source === 'manual'
        ? null
        : { entry, tier: null, occurrence: null };
    }
    const m = /^(.+)\.(\d+)$/.exec(raw);
    if (!m) return null;
    const entry = catalogueByKey.get(m[1]);
    if (!entry) return null;
    const n = Number(m[2]);
    if (entry.source === 'manual') return n >= 1 ? { entry, tier: null, occurrence: n } : null;
    if (!entry.tiers || n < 1 || n > entry.tiers.length) return null;
    return { entry, tier: n, occurrence: null };
  };
}

/** Plus haut palier atteint pour une valeur (0 = aucun ; badge unique : seuil 1). */
function tierReached(entry, value) {
  const v = Number(value) || 0;
  const thresholds = entry.tiers || [1];
  let reached = 0;
  thresholds.forEach((t, i) => {
    if (v >= t) reached = i + 1;
  });
  return reached;
}

/**
 * Entrée publique d'un catalogue (envoyée au front) : sans détail interne de calcul. Les
 * paliers portent les noms du produit (`tiers`, par défaut ceux de la forêt).
 */
function publicCatalogueEntry(entry, tiers = REWARD_TIERS) {
  const { metric: _metric, ...rest } = entry;
  return {
    ...rest,
    tiers: entry.tiers ? entry.tiers.map((threshold, i) => ({ ...tiers[i], threshold })) : null,
  };
}

/**
 * Contrôle d'un catalogue au chargement : clés uniques, sources connues, trois paliers au
 * plus, clés enregistrées dans la longueur de la colonne. Lève une erreur au premier défaut.
 * @param {object[]} catalogue
 * @param {string} name nom du produit (messages)
 */
function assertValidCatalogue(catalogue, name = 'catalogue') {
  const seen = new Set();
  for (const entry of catalogue) {
    if (!entry?.key || !entry.title || !entry.emoji || !entry.family) {
      throw new Error(`${name} : entrée incomplète (${entry?.key || '?'}).`);
    }
    if (seen.has(entry.key)) throw new Error(`${name} : clé en double « ${entry.key} ».`);
    seen.add(entry.key);
    if (!REWARD_SOURCES.includes(entry.source)) {
      throw new Error(`${name} : source inconnue pour « ${entry.key} ».`);
    }
    if (entry.tiers && (entry.tiers.length < 1 || entry.tiers.length > REWARD_TIERS.length)) {
      throw new Error(`${name} : « ${entry.key} » doit avoir 1 à ${REWARD_TIERS.length} paliers.`);
    }
    const longest = entry.source === 'manual' ? `${entry.key}.99999` : tierRewardKey(entry, 3);
    if (longest.length > REWARD_KEY_MAX_LENGTH) {
      throw new Error(`${name} : clé trop longue pour « ${entry.key} ».`);
    }
  }
  return true;
}

// --- Libellés d'affichage ------------------------------------------------------------------

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
function pluralizeUnit(unit, n) {
  const text = String(unit || '').trim();
  if (!text || Number(n) <= 1) return text;
  let stopped = false;
  return text
    .split(/\s+/)
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

/** Paliers / occurrences obtenus d'un badge de base, depuis la liste des badges obtenus. */
function earnedOf(entry, rewards) {
  return (rewards || []).filter((r) => (r.baseKey || r.key) === entry.key);
}

/**
 * Libellé de progression : « encore 3 tâches de jardinage pour 🌼 Fleur ».
 * @param {object} entry entrée publique (paliers `{ emoji, label, threshold }`)
 * @param {{ remaining?: number|null, nextTier?: number|null }} progress
 */
function progressLabel(entry, progress) {
  if (!progress || progress.remaining == null || progress.nextTier == null) return '';
  const tier = entry?.tiers?.[progress.nextTier - 1];
  const target = tier ? `${tier.emoji} ${tier.label}` : 'l’obtenir';
  const unit = pluralizeUnit(entry?.unit, progress.remaining);
  return `encore ${progress.remaining}${unit ? ` ${unit}` : ''} pour ${target}`;
}

/**
 * Catalogue regroupé par famille, dans l'ordre des familles du produit ; une entrée sans
 * famille connue va dans « Autres ».
 */
function groupCatalogueByFamily(catalogue, families) {
  const order = Array.isArray(families) ? families : [];
  const groups = order.map((f) => ({ key: f.key, label: f.label, entries: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const others = { key: 'autres', label: 'Autres', entries: [] };
  for (const entry of catalogue || []) {
    (byKey.get(entry.family) || others).entries.push(entry);
  }
  return [...groups, others].filter((g) => g.entries.length > 0);
}

/** Nombre de badges du catalogue obtenus au moins une fois. */
function countEarnedEntries(catalogue, rewards) {
  return (catalogue || []).filter((e) => earnedOf(e, rewards).length > 0).length;
}

/** Date d'obtention en français (« 6 nov. 2026 »). */
function formatAwardDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Libellé court d'un badge obtenu : « 🪴 Main verte — 🌼 Fleur » (paliers du produit). */
function rewardShortLabel(reward, tiers = REWARD_TIERS) {
  const tier = reward?.tier ? (tiers || REWARD_TIERS)[reward.tier - 1] : null;
  const tierText = tier ? ` — ${tier.emoji} ${tier.label}` : '';
  return `${reward?.emoji || ''} ${reward?.title || ''}${tierText}`.trim();
}

/**
 * Texte d'une annonce de badges (notification) : un seul badge, plusieurs, ou le
 * récapitulatif du rattrapage initial. Tutoiement (élèves, joueurs).
 * @param {{ recap?: boolean, tiers?: object[] }} [options] paliers du produit
 * @returns {{ title: string, body: string } | null}
 */
function rewardAnnouncementText(awarded, { recap = false, tiers = REWARD_TIERS } = {}) {
  const list = (awarded || []).filter(Boolean);
  if (!list.length) return null;
  if (recap) {
    return {
      title: `Tes badges sont arrivés : ${list.length} badge${list.length > 1 ? 's' : ''} !`,
      body: 'Ouvre « Mes badges » pour découvrir ce que ton travail t’a déjà rapporté.',
    };
  }
  if (list.length === 1) {
    return {
      title: `Nouveau badge : ${rewardShortLabel(list[0], tiers)}`,
      body: list[0].description,
    };
  }
  return {
    title: `${list.length} nouveaux badges !`,
    body: list.map((r) => rewardShortLabel(r, tiers)).join(' · '),
  };
}

module.exports = {
  REWARD_TIERS,
  assertValidTiers,
  REWARD_SOURCES,
  REWARD_KEY_MAX_LENGTH,
  tierRewardKey,
  storedKeysOf,
  createRewardKeyParser,
  tierReached,
  publicCatalogueEntry,
  assertValidCatalogue,
  pluralizeUnit,
  earnedOf,
  progressLabel,
  groupCatalogueByFamily,
  countEarnedEntries,
  formatAwardDate,
  rewardShortLabel,
  rewardAnnouncementText,
};
