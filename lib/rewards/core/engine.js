'use strict';

/**
 * Moteur de badges **générique**, commun à tous les produits (ForetMap aujourd'hui,
 * Gnomes & Licornes demain). Un produit crée son instance avec `createRewardsEngine` en
 * fournissant ce qui lui est propre :
 *
 *  - `product`             identifiant (`foret`, `gl`) — messages et journaux ;
 *  - `catalogue`, `families` entrées et familles (forme : `lib/shared/rewardsCore.js`) ;
 *  - `store`               table et colonne de propriétaire où sont rangés les badges
 *                          (`user_rewards.user_id` pour la forêt ; une table de joueurs pour
 *                          G&L) — colonnes attendues : `reward_key`, `source_type`,
 *                          `source_ref`, `awarded_at`, `awarded_by_user_id`, `note`, `seen_at` ;
 *  - `createMetricContext` `(db, ownerId) → { value(metric) }` : mesures agrégées du produit ;
 *  - `isEligible`          `(ownerId, db) → bool` : le propriétaire peut-il recevoir les
 *                          familles listées dans `restrictedFamilies` ?
 *  - `loadOwnerNames`      `(ids, db) → [{ id, name }]` pour la vitrine (facultatif) ;
 *  - `tiers`               noms des trois paliers du produit (défaut : 🌸/🌼/🍎 de la forêt),
 *                          renvoyés par `publicCatalogue()` et portés par chaque entrée.
 *
 * Règles communes, quel que soit le produit : `INSERT IGNORE` (jamais de doublon), jamais de
 * retrait, palier enregistré daté, badge manuel numéroté (`<badge>.<n>`) avec un mot
 * obligatoire, vitrine triée par nom (aucun classement).
 *
 * Aucune route ici : chaque produit expose ses routes (`/api/rewards`, `/api/gl/rewards`) et
 * applique son propre contrôle d'accès et de périmètre.
 */

const database = require('../../../database');
const {
  REWARD_TIERS,
  createRewardKeyParser,
  tierRewardKey,
  tierReached,
  publicCatalogueEntry,
  assertValidCatalogue,
  assertValidTiers,
} = require('../../shared/rewardsCore');

const SOURCE_TYPE_MAX = 32;
const SOURCE_REF_MAX = 64;
const NOTE_MAX = 280;
/** Distance au seuil retenue par « Qui est proche d'un palier ? ». */
const NEAR_THRESHOLD_GAP = 1;
const IDENT_RE = /^[a-z][a-z0-9_]*$/;

class RewardAwardError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toIsoOrNull(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ident(name, what) {
  if (!IDENT_RE.test(String(name || ''))) throw new Error(`Identifiant SQL invalide (${what}).`);
  return name;
}

/**
 * Crée le moteur de badges d'un produit.
 * @param {object} spec voir l'en-tête du module
 */
function createRewardsEngine({
  product,
  catalogue,
  families,
  store = { table: 'user_rewards', ownerColumn: 'user_id' },
  createMetricContext,
  isEligible = async () => true,
  restrictedFamilies = [],
  loadOwnerNames = null,
  tiers = REWARD_TIERS,
  db: defaultDb = database,
}) {
  assertValidCatalogue(catalogue, `badges ${product}`);
  const TIERS = assertValidTiers(tiers, `paliers ${product}`);
  // Noms de table et de colonne fixés par le code du produit, contrôlés une fois ici.
  const T = ident(store.table, 'table');
  const OWNER = ident(store.ownerColumn, 'colonne');
  const CATALOGUE = Object.freeze(catalogue.map((e) => Object.freeze({ ...e })));
  const FAMILIES = Object.freeze([...families]);
  const CATALOGUE_BY_KEY = new Map(CATALOGUE.map((e) => [e.key, e]));
  const RESTRICTED = new Set(restrictedFamilies);
  const MANUAL_ENTRIES = CATALOGUE.filter((e) => e.source === 'manual');
  const parseRewardKey = createRewardKeyParser(CATALOGUE_BY_KEY);

  /** Type court d'un badge manuel : dernier segment de sa clé (`manuel.guide` → `guide`). */
  const MANUAL_TYPES = Object.freeze(MANUAL_ENTRIES.map((e) => e.key.split('.').pop()));

  function describeReward(key, awardedAt = null, extra = {}) {
    const parsed = parseRewardKey(key);
    if (!parsed) return null;
    const { metric: _metric, ...entry } = parsed.entry;
    return {
      ...entry,
      key,
      baseKey: entry.key,
      tier: parsed.tier,
      occurrence: parsed.occurrence,
      awardedAt: toIsoOrNull(awardedAt),
      ...extra,
    };
  }

  function publicCatalogue() {
    return {
      catalogue: CATALOGUE.map((e) => publicCatalogueEntry(e, TIERS)),
      families: FAMILIES,
      tiers: TIERS,
    };
  }

  async function insertReward(db, ownerId, key, source = {}) {
    const result = await db.execute(
      `INSERT IGNORE INTO ${T} (${OWNER}, reward_key, source_type, source_ref, awarded_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        ownerId,
        key,
        source.type ? String(source.type).slice(0, SOURCE_TYPE_MAX) : null,
        source.ref ? String(source.ref).slice(0, SOURCE_REF_MAX) : null,
      ],
    );
    return Number(result?.affectedRows) > 0;
  }

  /** Attribue une clé déjà calculée (badge d'événement) ; vrai si elle vient d'être obtenue. */
  async function award(ownerId, key, source = {}, db = defaultDb) {
    if (!ownerId || !parseRewardKey(key)) return false;
    return insertReward(db, ownerId, key, source);
  }

  /** Valeurs des badges calculés (sans rien écrire). */
  async function computeValues(
    ownerId,
    { families: only = null, eligible = true, db = defaultDb } = {},
  ) {
    const ctx = createMetricContext(db, ownerId);
    const out = [];
    for (const entry of CATALOGUE) {
      if (entry.source !== 'auto' || !entry.metric) continue;
      if (only && !only.includes(entry.family)) continue;
      if (!eligible && RESTRICTED.has(entry.family)) continue;
      const value = await ctx.value(entry.metric);
      out.push({ entry, value, reached: tierReached(entry, value) });
    }
    return out;
  }

  /** Évalue un propriétaire et attribue les paliers manquants ; renvoie les nouveaux badges. */
  async function evaluate(
    ownerId,
    { families: only = null, source = null, dryRun = false, db = defaultDb } = {},
  ) {
    const id = String(ownerId || '').trim();
    if (!id) return [];
    const eligible = RESTRICTED.size ? await isEligible(id, db) : true;
    const values = await computeValues(id, { families: only, eligible, db });
    if (!values.length) return [];
    const rows = await db.queryAll(`SELECT reward_key FROM ${T} WHERE ${OWNER} = ?`, [id]);
    const existing = new Set(rows.map((r) => r.reward_key));
    const effectiveSource = source && source.type ? source : { type: 'backfill', ref: null };
    const awarded = [];
    for (const { entry, reached } of values) {
      for (let n = 1; n <= reached; n += 1) {
        const key = tierRewardKey(entry, n);
        if (existing.has(key)) continue;
        const fresh = dryRun ? true : await insertReward(db, id, key, effectiveSource);
        if (fresh) awarded.push(describeReward(key, new Date()));
      }
    }
    return awarded;
  }

  /** Badges obtenus, dans l'ordre d'obtention (mot de l'adulte, annonce vue). */
  async function listRewards(ownerId, db = defaultDb) {
    const rows = await db.queryAll(
      `SELECT reward_key, awarded_at, note, seen_at FROM ${T}
        WHERE ${OWNER} = ? ORDER BY awarded_at ASC, reward_key ASC`,
      [ownerId],
    );
    return rows
      .map((r) =>
        describeReward(r.reward_key, r.awarded_at, {
          note: r.note || null,
          seen: r.seen_at != null,
        }),
      )
      .filter(Boolean);
  }

  /** Pose `seen_at` sur les badges non vus ; renvoie le nombre de lignes. */
  async function markSeen(ownerId, db = defaultDb) {
    const result = await db.execute(
      `UPDATE ${T} SET seen_at = NOW() WHERE ${OWNER} = ? AND seen_at IS NULL`,
      [ownerId],
    );
    return Number(result?.affectedRows) || 0;
  }

  /** Progression : valeur, palier (le plus haut, enregistré ou atteint), seuil suivant, reste. */
  async function buildProgress(ownerId, { db = defaultDb } = {}) {
    const rewards = await listRewards(ownerId, db);
    const storedTiers = new Map();
    for (const r of rewards) {
      if (r.tier) storedTiers.set(r.baseKey, Math.max(storedTiers.get(r.baseKey) || 0, r.tier));
    }
    const storedKeys = new Set(rewards.map((r) => r.key));
    const eligible = RESTRICTED.size ? await isEligible(ownerId, db) : true;
    const values = await computeValues(ownerId, { eligible, db });
    const progress = values.map(({ entry, value, reached }) => {
      const thresholds = entry.tiers || [1];
      const stored = entry.tiers
        ? storedTiers.get(entry.key) || 0
        : storedKeys.has(entry.key)
          ? 1
          : 0;
      const tier = Math.max(reached, stored);
      const nextThreshold = tier < thresholds.length ? thresholds[tier] : null;
      return {
        key: entry.key,
        family: entry.family,
        value,
        tier,
        nextTier: nextThreshold == null ? null : tier + 1,
        nextThreshold,
        remaining: nextThreshold == null ? null : Math.max(0, nextThreshold - value),
      };
    });
    return { rewards, progress };
  }

  function countByFamily(rewards) {
    const out = Object.fromEntries(FAMILIES.map((f) => [f.key, 0]));
    for (const r of rewards || []) {
      if (Object.prototype.hasOwnProperty.call(out, r.family)) out[r.family] += 1;
    }
    return out;
  }

  function nearThresholds(progress) {
    return (progress || [])
      .filter((p) => p.remaining != null && p.remaining > 0 && p.remaining <= NEAR_THRESHOLD_GAP)
      .map(({ key, value, nextThreshold, nextTier, remaining }) => ({
        key,
        title: CATALOGUE_BY_KEY.get(key)?.title || key,
        emoji: CATALOGUE_BY_KEY.get(key)?.emoji || '',
        value,
        nextThreshold,
        nextTier,
        remaining,
      }));
  }

  /**
   * Vitrine d'un ensemble de propriétaires (déjà filtrés sur le périmètre de l'appelant) :
   * familles × paliers et « proches d'un palier ». Tri alphabétique, jamais par nombre.
   */
  async function buildShowcase(ownerIds, { db = defaultDb } = {}) {
    const ids = [...new Set((ownerIds || []).map(String))];
    if (!ids.length || typeof loadOwnerNames !== 'function') return { students: [], near: [] };
    const owners = await loadOwnerNames(ids, db);
    const students = [];
    const near = [];
    for (const owner of owners) {
      const { rewards, progress } = await buildProgress(owner.id, { db });
      students.push({
        id: owner.id,
        name: owner.name,
        families: countByFamily(rewards),
        total: rewards.length,
      });
      for (const item of nearThresholds(progress))
        near.push({ studentId: owner.id, name: owner.name, ...item });
    }
    const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    students.sort(byName);
    near.sort((a, b) => byName(a, b) || a.key.localeCompare(b.key));
    return { students, near };
  }

  /**
   * Badge décerné par un adulte : type connu du catalogue, mot obligatoire (280 caractères au
   * plus), clé `<badge>.<n>` numérotée à la suite. Le contrôle d'accès est fait par la route.
   */
  async function awardManual({ ownerId, type, note, awardedBy = null }, db = defaultDb) {
    const kind = String(type || '').trim();
    const entry = MANUAL_ENTRIES.find((e) => e.key.split('.').pop() === kind);
    if (!entry) {
      throw new RewardAwardError(
        400,
        `Type de badge inconnu (valeurs : ${MANUAL_TYPES.join(', ')})`,
      );
    }
    const text = String(note ?? '').trim();
    if (!text) throw new RewardAwardError(400, 'Un mot pour l’élève est obligatoire');
    if (text.length > NOTE_MAX)
      throw new RewardAwardError(400, `Le mot est limité à ${NOTE_MAX} caractères`);
    const key = await db.withTransaction(async (tx) => {
      const rows = await tx.queryAll(
        `SELECT reward_key FROM ${T} WHERE ${OWNER} = ? AND reward_key LIKE ? FOR UPDATE`,
        [ownerId, `${entry.key}.%`],
      );
      const max = rows.reduce(
        (m, r) => Math.max(m, parseRewardKey(r.reward_key)?.occurrence || 0),
        0,
      );
      const next = `${entry.key}.${max + 1}`;
      await tx.execute(
        `INSERT INTO ${T} (${OWNER}, reward_key, source_type, source_ref, awarded_at, awarded_by_user_id, note)
         VALUES (?, ?, 'manual', NULL, NOW(), ?, ?)`,
        [ownerId, next, awardedBy || null, text],
      );
      return next;
    });
    return { reward: describeReward(key, new Date(), { note: text, seen: false }), type: kind };
  }

  /**
   * Fusion de deux propriétaires, avant la réattribution générique des lignes : date la plus
   * ancienne gardée en cas de doublon, badges manuels du compte absorbé renumérotés à la suite
   * (deux passes, par clés temporaires, pour ne heurter aucune ligne).
   */
  async function prepareMerge(tx, fromId, intoId) {
    const dated = await tx.execute(
      `UPDATE ${T} a JOIN ${T} b ON b.reward_key = a.reward_key AND b.${OWNER} = ?
          SET a.awarded_at = LEAST(a.awarded_at, b.awarded_at)
        WHERE a.${OWNER} = ?`,
      [fromId, intoId],
    );
    const manualPrefixes = MANUAL_ENTRIES.map((e) => e.key);
    if (!manualPrefixes.length)
      return { keptOldestDates: Number(dated?.affectedRows) || 0, renumbered: 0 };
    const rows = await tx.queryAll(
      `SELECT ${OWNER} AS owner, reward_key, awarded_at FROM ${T}
        WHERE ${OWNER} IN (?, ?) AND (${manualPrefixes.map(() => 'reward_key LIKE ?').join(' OR ')})
        ORDER BY awarded_at ASC, reward_key ASC`,
      [fromId, intoId, ...manualPrefixes.map((p) => `${p}.%`)],
    );
    const maxByEntry = new Map();
    for (const row of rows) {
      if (row.owner !== intoId) continue;
      const parsed = parseRewardKey(row.reward_key);
      if (parsed?.occurrence) {
        maxByEntry.set(
          parsed.entry.key,
          Math.max(maxByEntry.get(parsed.entry.key) || 0, parsed.occurrence),
        );
      }
    }
    const plan = [];
    for (const row of rows) {
      if (row.owner !== fromId) continue;
      const parsed = parseRewardKey(row.reward_key);
      if (!parsed?.occurrence) continue;
      const next = (maxByEntry.get(parsed.entry.key) || 0) + 1;
      maxByEntry.set(parsed.entry.key, next);
      const to = `${parsed.entry.key}.${next}`;
      if (to !== row.reward_key) plan.push({ from: row.reward_key, to });
    }
    for (let i = 0; i < plan.length; i += 1) {
      plan[i].tmp = `merge-tmp-${i}`;
      await tx.execute(`UPDATE ${T} SET reward_key = ? WHERE ${OWNER} = ? AND reward_key = ?`, [
        plan[i].tmp,
        fromId,
        plan[i].from,
      ]);
    }
    for (const step of plan) {
      await tx.execute(`UPDATE ${T} SET reward_key = ? WHERE ${OWNER} = ? AND reward_key = ?`, [
        step.to,
        fromId,
        step.tmp,
      ]);
    }
    return { keptOldestDates: Number(dated?.affectedRows) || 0, renumbered: plan.length };
  }

  return Object.freeze({
    product,
    store: Object.freeze({ table: T, ownerColumn: OWNER }),
    catalogue: CATALOGUE,
    families: FAMILIES,
    tiers: TIERS,
    CATALOGUE_BY_KEY,
    MANUAL_TYPES,
    restrictedFamilies: RESTRICTED,
    parseRewardKey,
    describeReward,
    publicCatalogue,
    award,
    computeValues,
    evaluate,
    listRewards,
    markSeen,
    buildProgress,
    countByFamily,
    nearThresholds,
    buildShowcase,
    awardManual,
    prepareMerge,
    isEligible: (ownerId, db = defaultDb) =>
      RESTRICTED.size ? isEligible(ownerId, db) : Promise.resolve(true),
  });
}

module.exports = { createRewardsEngine, RewardAwardError, NOTE_MAX, NEAR_THRESHOLD_GAP };
