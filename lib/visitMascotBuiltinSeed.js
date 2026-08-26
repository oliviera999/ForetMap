'use strict';

/**
 * Semis des **mascottes livrées** dans `visit_mascot_packs` — étape 2 de la fusion
 * catalogue / packs (`docs/AUDIT_MASCOTTES_2026-08.md`, piste P3).
 *
 * Jusqu'ici « mascotte livrée » et « pack » étaient deux univers parallèles : les premières en
 * code, non éditables et non supprimables, les seconds en base. Un prof voyait une seule liste et
 * trois régimes de droits derrière — d'où l'impression d'arbitraire du signalement d'origine.
 *
 * Semer les mascottes livrées dans la table les rend éditables, exportables et supprimables comme
 * n'importe quel pack, et fait du catalogue en code une **graine** plutôt qu'un univers concurrent.
 *
 * ## Les filets
 *
 * Un semis qui rate ne se voit pas à moitié : il viderait le sélecteur, ou doublerait chaque
 * mascotte. Quatre garde-fous, du plus important au moins :
 *
 * 1. **On n'insère que ce qui est absent** (`catalog_id` unique). Une ligne éditée par un prof
 *    n'est jamais écrasée par un redémarrage.
 * 2. **Le registre garde le catalogue en repli** : une entrée non encore semée reste listée
 *    (`listVisitMascotRegistry`). Un semis qui échoue ne peut donc pas vider le sélecteur — au
 *    pire il ne change rien.
 * 3. **Le semis ne fait jamais échouer le démarrage** : il journalise et rend la main.
 * 4. **Chaque entrée est isolée** : une mascotte qui ne se convertit pas n'empêche pas les
 *    quinze autres d'être semées.
 */

const crypto = require('node:crypto');
const { queryAll, execute } = require('../database');
const logger = require('./logger');

// **Quand ce semis tourne.** Il est appelé depuis `initSchema()`, c'est-à-dire par
// `npm run db:migrate` / `npm run db:init` — l'étape de migration du déploiement. Il ne tourne
// **pas** au démarrage du serveur : `initDatabase()` ne fait qu'un ping (cf. son commentaire,
// « la création des tables et le seed sont gérés via npm run db:init »). Un déploiement qui
// remplace les fichiers sans jouer les migrations laisse donc la table sans la colonne `origin`
// et sans les lignes semées ; `mapVisitMascotPackSqlError` le signale alors explicitement.

/** Préfixe commun des `srcs` d'un état `sprite_cut`, jusqu'au dernier `/` inclus. */
function commonFramesBase(allSrcs) {
  const urls = allSrcs.filter((u) => typeof u === 'string' && u.startsWith('/'));
  if (urls.length === 0) return null;
  let base = urls[0].slice(0, urls[0].lastIndexOf('/') + 1);
  for (const url of urls.slice(1)) {
    while (base && !url.startsWith(base)) {
      base = base.slice(0, base.lastIndexOf('/', base.length - 2) + 1);
    }
    if (!base) return null;
  }
  return base || null;
}

/**
 * Entrée catalogue → pack JSON. L'inverse de `buildMascotCatalogEntry`.
 *
 * `spritesheet` et `rive` se recopient tels quels — le format de pack a été taillé sur leur
 * forme (étape 1). Seul `sprite_cut` demande un travail : le catalogue y porte des URLs
 * absolues (`srcs`), le pack veut une base commune et des noms de fichiers.
 *
 * @param {Record<string, unknown>} entry entrée du catalogue livré.
 * @returns {Record<string, unknown>|null} pack JSON, ou `null` si l'entrée est inexploitable.
 */
function catalogEntryToPack(entry) {
  const id = String(entry?.id || '').trim();
  const renderer = entry?.renderer;
  if (!id || !renderer) return null;

  const commun = {
    mascotPackVersion: 2,
    id,
    label: String(entry.label || id).trim() || id,
    renderer,
    fallbackSilhouette: String(entry.fallbackSilhouette || 'gnome'),
    ...(entry.displayScale ? { displayScale: Number(entry.displayScale) } : {}),
  };

  if (renderer === 'rive') {
    const src = String(entry?.rive?.src || '').trim();
    const stateAnimations = entry?.rive?.stateAnimations;
    if (!src || !stateAnimations || typeof stateAnimations !== 'object') return null;
    return { ...commun, rive: { src, stateAnimations } };
  }

  if (renderer === 'spritesheet') {
    const sheet = entry?.spritesheet;
    if (!sheet?.src || !sheet?.frameWidth || !sheet?.frameHeight || !sheet?.stateFrames) {
      return null;
    }
    return {
      ...commun,
      spritesheet: {
        src: String(sheet.src),
        frameWidth: Number(sheet.frameWidth),
        frameHeight: Number(sheet.frameHeight),
        stateFrames: sheet.stateFrames,
      },
    };
  }

  if (renderer === 'sprite_cut') {
    const cut = entry?.spriteCut;
    const stateFrames = cut?.stateFrames;
    if (!cut?.frameWidth || !cut?.frameHeight || !stateFrames) return null;

    const toutesLesSrcs = Object.values(stateFrames).flatMap((spec) =>
      Array.isArray(spec?.srcs) ? spec.srcs : [],
    );
    const framesBase = commonFramesBase(toutesLesSrcs);
    // Sans base commune, le pack ne peut pas exprimer ses trames : mieux vaut ne pas semer
    // cette entrée que d'en semer une qui ne rendra rien.
    if (!framesBase || framesBase.length < 8) return null;

    const packStateFrames = {};
    for (const [state, spec] of Object.entries(stateFrames)) {
      const srcs = Array.isArray(spec?.srcs) ? spec.srcs : [];
      if (!srcs.length || !srcs.every((u) => String(u).startsWith(framesBase))) return null;
      packStateFrames[state] = {
        files: srcs.map((u) => String(u).slice(framesBase.length)),
        fps: Number(spec?.fps) || 8,
        ...(Array.isArray(spec?.frameDwellMs) && spec.frameDwellMs.length === srcs.length
          ? { frameDwellMs: spec.frameDwellMs }
          : {}),
      };
    }
    return {
      ...commun,
      framesBase,
      frameWidth: Number(cut.frameWidth),
      frameHeight: Number(cut.frameHeight),
      pixelated: cut.pixelated !== false,
      stateFrames: packStateFrames,
    };
  }

  return null;
}

/**
 * Convertit tout le catalogue livré. Les entrées inexploitables sont **écartées et nommées**
 * plutôt que semées à moitié.
 * @param {Array<Record<string, unknown>>} entries
 * @returns {{ packs: Array<{ catalogId: string, label: string, pack: object }>, ignores: string[] }}
 */
function buildBuiltinMascotPacks(entries) {
  const packs = [];
  const ignores = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const pack = catalogEntryToPack(entry);
    if (!pack) {
      ignores.push(String(entry?.id || '(sans identifiant)'));
      continue;
    }
    packs.push({ catalogId: pack.id, label: pack.label, pack });
  }
  return { packs, ignores };
}

/**
 * Sème les mascottes livrées absentes de la table. Idempotent, et sans effet sur les lignes
 * existantes — y compris celles qu'un prof a modifiées.
 *
 * @returns {Promise<{ inserted: string[], skipped: string[], ignored: string[], failed: string[] }>}
 */
async function seedBuiltinMascotPacks() {
  const bilan = { inserted: [], skipped: [], ignored: [], failed: [] };
  try {
    const { listStaticVisitMascotEntries } = require('./visitMascotRegistry');
    const entries = await listStaticVisitMascotEntries();
    const { packs, ignores } = buildBuiltinMascotPacks(entries);
    bilan.ignored = ignores;

    const existantes = new Set(
      (await queryAll('SELECT catalog_id FROM visit_mascot_packs')).map((r) =>
        String(r.catalog_id || '').trim(),
      ),
    );

    for (const { catalogId, label, pack } of packs) {
      if (existantes.has(catalogId)) {
        bilan.skipped.push(catalogId);
        continue;
      }
      const now = new Date().toISOString();
      try {
        // `created_by` est une **clé étrangère vers `users`** : y poser une chaîne comme
        // « system » viole la contrainte. Une ligne semée n'a pas d'auteur — c'est `NULL`,
        // ce que la colonne accepte (`ON DELETE SET NULL`).
        //
        // Et surtout : **pas de `INSERT IGNORE`**. Un premier jet en avait mis un, au nom de
        // deux instances qui démarreraient ensemble. Il transformait la violation de clé
        // étrangère en avertissement muet : le semis annonçait « 16 insérées » et la table
        // restait vide. Un filet qui avale les erreurs n'est pas un filet, c'est un bandeau.
        // La collision d'identifiant, elle, est nommée juste en dessous.
        await execute(
          `INSERT INTO visit_mascot_packs
             (id, catalog_id, label, pack_json, is_published, origin, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, 1, 'builtin', ?, ?, NULL)`,
          [crypto.randomUUID(), catalogId, label, JSON.stringify(pack), now, now],
        );
        bilan.inserted.push(catalogId);
      } catch (err) {
        // Deux instances qui sèment en même temps : la seconde perd la course sur
        // `catalog_id` (unique). Ce n'est pas un échec, la ligne est bien là.
        if (err?.code === 'ER_DUP_ENTRY') {
          bilan.skipped.push(catalogId);
          continue;
        }
        // Toute autre erreur est réelle : elle est journalisée, et n'empêche pas les autres
        // mascottes d'être semées.
        bilan.failed.push(catalogId);
        logger.warn({ err, catalogId }, 'Semis mascotte livrée : échec sur une entrée');
      }
    }

    logger.info(
      {
        inserted: bilan.inserted.length,
        skipped: bilan.skipped.length,
        ignored: bilan.ignored,
        failed: bilan.failed,
      },
      'Semis des mascottes livrées',
    );
  } catch (err) {
    // Filet principal : le semis ne fait jamais échouer le démarrage. Le registre garde le
    // catalogue en repli, donc le sélecteur reste peuplé même si rien n'a été semé.
    logger.warn({ err }, 'Semis des mascottes livrées ignoré (le catalogue reste en repli)');
  }
  return bilan;
}

module.exports = {
  commonFramesBase,
  catalogEntryToPack,
  buildBuiltinMascotPacks,
  seedBuiltinMascotPacks,
};
