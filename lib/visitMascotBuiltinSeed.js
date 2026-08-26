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
const fs = require('node:fs');
const path = require('node:path');
const { queryAll, queryOne, execute } = require('../database');
const logger = require('./logger');

/** Marque de passage de l'alignement unique (cf. `alignUnrenderableBuiltinMascots`). */
const UNRENDERABLE_ALIGNED_KEY = 'ops.visit_mascot_unrenderable_aligned_at';

/**
 * Identifiants catalogue des mascottes livrées **supprimées pour de bon**.
 *
 * La table peut ne pas exister : une installation dont les migrations n'ont pas encore tourné en
 * est dépourvue, et le serveur n'applique pas les migrations au démarrage (cf. `docs/EXPLOITATION.md`).
 * Une absence de table signifie « aucune suppression enregistrée » — surtout pas « échec du
 * semis », qui laisserait cette installation-là sans aucune mascotte.
 *
 * @returns {Promise<Set<string>>}
 */
async function listDeletedBuiltinCatalogIds() {
  try {
    const rows = await queryAll('SELECT catalog_id FROM visit_mascot_pack_deletions');
    return new Set(rows.map((r) => String(r.catalog_id || '').trim()).filter(Boolean));
  } catch (err) {
    // 1146 = table absente. Toute autre erreur mérite d'être vue, sans bloquer le semis.
    if (err?.errno !== 1146) {
      logger.warn({ err }, 'Lecture des suppressions de mascottes livrées impossible');
    }
    return new Set();
  }
}

/**
 * Enregistre la suppression définitive d'une mascotte livrée, pour que le semis ne la réinsère
 * plus. Sans effet si l'identifiant y figure déjà — supprimer deux fois n'est pas une erreur.
 *
 * @param {string} catalogId
 * @param {string | null} [deletedBy] identifiant de l'auteur (FK `users`), `null` si inconnu
 */
async function recordBuiltinMascotDeletion(catalogId, deletedBy = null) {
  const id = String(catalogId || '').trim();
  if (!id) return;
  await execute(
    `INSERT INTO visit_mascot_pack_deletions (catalog_id, deleted_at, deleted_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE deleted_at = VALUES(deleted_at), deleted_by = VALUES(deleted_by)`,
    [id, new Date().toISOString(), deletedBy || null],
  );
}

/**
 * Oublie toutes les suppressions : les mascottes livrées effacées redeviennent semables.
 * Réservé à la commande d'administration `npm run visit:mascots:restore` — la garder hors du
 * studio est ce qui permet à celui-ci de n'afficher qu'**une** liste.
 *
 * @returns {Promise<string[]>} les identifiants redevenus semables
 */
async function clearBuiltinMascotDeletions() {
  const avant = await listDeletedBuiltinCatalogIds();
  if (avant.size === 0) return [];
  await execute('DELETE FROM visit_mascot_pack_deletions');
  return [...avant].sort();
}

/**
 * Une mascotte livrée est-elle **impossible à rendre**, faute de son fichier d'animation ?
 *
 * Le cas concret, et la raison d'être de cette fonction : dix des seize mascottes livrées
 * déclarent `renderer: 'rive'` et pointent vers `/assets/rive/*.riv`. **Aucun de ces fichiers
 * n'existe, et aucun n'a jamais été versionné** (`git log --diff-filter=A -- '*.riv'` est vide).
 * Ce ne sont donc pas des fichiers perdus : ces entrées ont toujours décrit des animations
 * absentes du dépôt.
 *
 * À l'écran, l'échec est **silencieux par conception** : `useRive` reçoit un 404, `onLoadError`
 * bascule sur la silhouette SVG, et le visiteur voit un joli dessin parfaitement immobile sans
 * aucun moyen de comprendre que ce n'était pas prévu. Les proposer au sélecteur, c'est promettre
 * dix personnages animés dont pas un ne bougera jamais.
 *
 * On mesure plutôt que de déclarer une liste : le jour où les `.riv` sont déposés dans
 * `public/assets/rive/`, une installation neuve les proposera d'elle-même, sans qu'il faille
 * penser à retirer dix identifiants d'un tableau.
 *
 * @param {Record<string, unknown>} entry entrée du catalogue livré.
 * @returns {boolean} vrai si le fichier requis manque sur le disque.
 */
function builtinAssetIsMissing(entry) {
  if (entry?.renderer !== 'rive') return false;
  const src = String(entry?.rive?.src || '').trim();
  if (!src.startsWith('/')) return false;
  const abs = path.join(__dirname, '..', 'public', src.replace(/^\/+/, ''));
  try {
    return !fs.existsSync(abs);
  } catch (_) {
    // Disque illisible : on ne dépublie pas sur un doute. Le pire cas reste l'état d'avant —
    // une mascotte proposée qui retombe sur sa silhouette.
    return false;
  }
}

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
 * existantes — y compris celles qu'un prof a modifiées, ou qu'il a supprimées.
 *
 * @returns {Promise<{ inserted: string[], skipped: string[], ignored: string[], failed: string[], unpublished: string[], deleted: string[] }>}
 */
async function seedBuiltinMascotPacks() {
  const bilan = {
    inserted: [],
    skipped: [],
    ignored: [],
    failed: [],
    unpublished: [],
    deleted: [],
  };
  try {
    const { listStaticVisitMascotEntries } = require('./visitMascotRegistry');
    const entries = await listStaticVisitMascotEntries();
    const { packs, ignores } = buildBuiltinMascotPacks(entries);
    bilan.ignored = ignores;
    // `packs` a perdu la forme catalogue (il porte le pack JSON) : on garde l'entrée d'origine
    // sous la main pour savoir si son fichier d'animation existe.
    const entryById = new Map(
      (Array.isArray(entries) ? entries : []).map((e) => [String(e?.id || '').trim(), e]),
    );

    const existantes = new Set(
      (await queryAll('SELECT catalog_id FROM visit_mascot_packs')).map((r) =>
        String(r.catalog_id || '').trim(),
      ),
    );

    // Les mascottes livrées **supprimées pour de bon**. Sans cette mémoire, le semis les
    // réinsérerait, et le bouton « Supprimer » du studio se serait annulé tout seul au prochain
    // `npm run db:migrate` : une réussite qui ment, découverte des semaines plus tard.
    //
    // La table peut manquer (installation dont les migrations n'ont pas encore tourné). Le semis
    // n'a alors rien à honorer — il ne doit surtout pas échouer pour autant, sinon une base en
    // retard d'une migration se retrouverait sans aucune mascotte.
    const supprimees = await listDeletedBuiltinCatalogIds();

    for (const { catalogId, label, pack } of packs) {
      if (existantes.has(catalogId)) {
        bilan.skipped.push(catalogId);
        continue;
      }
      if (supprimees.has(catalogId)) {
        bilan.deleted.push(catalogId);
        continue;
      }
      const now = new Date().toISOString();
      // Publiée d'emblée, **sauf** si son fichier d'animation manque : proposer une mascotte
      // qui ne bougera jamais serait une promesse en l'air. Elle reste présente au studio —
      // éditable, exportable, republiable en un clic le jour où le fichier arrive.
      const publiee = builtinAssetIsMissing(entryById.get(catalogId)) ? 0 : 1;
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
           VALUES (?, ?, ?, ?, ?, 'builtin', ?, ?, NULL)`,
          [crypto.randomUUID(), catalogId, label, JSON.stringify(pack), publiee, now, now],
        );
        bilan.inserted.push(catalogId);
        if (!publiee) bilan.unpublished.push(catalogId);
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
        deleted: bilan.deleted,
        unpublished: bilan.unpublished,
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

/**
 * Aligne **une seule fois** les installations déjà semées : les mascottes livrées dont le
 * fichier d'animation manque sont retirées de la visite.
 *
 * Le semis ne touche jamais une ligne existante — c'est son premier filet, et il est bon. Mais
 * il laisse donc les installations semées avant cette règle avec dix mascottes proposées qui ne
 * bougeront jamais. D'où ce rattrapage, qui obéit à deux exigences contradictoires :
 *
 * - il doit passer sur les bases déjà semées ;
 * - il ne doit **jamais** reprendre la main sur un administrateur. Republier délibérément une
 *   mascotte livrée dont on assume la silhouette est un choix légitime ; un alignement rejoué à
 *   chaque démarrage le défferait en silence, ce qui est exactement la classe de défaut que
 *   cette série de lots s'emploie à fermer.
 *
 * D'où la marque de passage (`ops.visit_mascot_unrenderable_aligned_at`) : écrite après coup,
 * elle rend l'opération définitivement unique. Sans marque on ne saurait pas distinguer « pas
 * encore fait » de « fait, puis défait exprès ».
 *
 * @returns {Promise<{ applied: boolean, hidden: string[], reason: string|null }>}
 */
async function alignUnrenderableBuiltinMascots() {
  const bilan = { applied: false, hidden: [], reason: null };
  try {
    const deja = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ? LIMIT 1', [
      UNRENDERABLE_ALIGNED_KEY,
    ]);
    if (deja) {
      bilan.reason = 'deja_aligne';
      return bilan;
    }

    const { listStaticVisitMascotEntries } = require('./visitMascotRegistry');
    const entries = await listStaticVisitMascotEntries();
    const aRetirer = entries
      .filter((e) => builtinAssetIsMissing(e))
      .map((e) => String(e.id).trim())
      .filter(Boolean);

    for (const catalogId of aRetirer) {
      const res = await execute(
        "UPDATE visit_mascot_packs SET is_published = 0 WHERE catalog_id = ? AND origin = 'builtin' AND is_published = 1",
        [catalogId],
      );
      if (res?.affectedRows) bilan.hidden.push(catalogId);
    }

    // La marque est écrite **même si rien n'a été retiré** : « aucune ligne à corriger » est un
    // résultat, pas une raison de recommencer au prochain démarrage.
    await execute(
      'INSERT INTO app_settings (`key`, scope, value_json, updated_at) VALUES (?, ?, ?, NOW()) ' +
        'ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()',
      [UNRENDERABLE_ALIGNED_KEY, 'admin', JSON.stringify(new Date().toISOString())],
    );

    bilan.applied = true;
    if (bilan.hidden.length) {
      logger.info(
        { hidden: bilan.hidden },
        'Mascottes livrées sans fichier d’animation retirées de la visite (une seule fois)',
      );
    }
    return bilan;
  } catch (err) {
    // Comme le semis : jamais d'échec au démarrage. Sans marque écrite, le rattrapage sera
    // simplement retenté au prochain démarrage.
    logger.warn({ err }, 'Alignement des mascottes livrées non rendables ignoré');
    bilan.reason = 'erreur';
    return bilan;
  }
}

module.exports = {
  UNRENDERABLE_ALIGNED_KEY,
  builtinAssetIsMissing,
  listDeletedBuiltinCatalogIds,
  recordBuiltinMascotDeletion,
  clearBuiltinMascotDeletions,
  alignUnrenderableBuiltinMascots,
  commonFramesBase,
  catalogEntryToPack,
  buildBuiltinMascotPacks,
  seedBuiltinMascotPacks,
};
