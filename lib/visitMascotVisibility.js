'use strict';

/**
 * Bascule de la **visibilité des mascottes** du réglage `ui.visit.mascot.allowed_ids` vers la
 * colonne `is_published` — étape 3 de la fusion catalogue / packs
 * (`docs/AUDIT_MASCOTTES_2026-08.md`, piste P3).
 *
 * ## La liste figée
 *
 * `ui.visit.mascot.allowed_ids` est une **liste d'identifiants en dur**. Sa sémantique est
 * « vide = aucune restriction, non vide = seuls ceux-là ». Conséquence mécanique : dès qu'un
 * administrateur en décoche une seule, la liste se fige sur les mascottes **existant ce jour-là**,
 * et toute mascotte ajoutée ensuite — un pack importé, par exemple — en est absente donc invisible.
 *
 * C'est exactement le symptôme signalé : « la mascotte importée n'est pas utilisable dans la carte
 * ou les visites, j'ai une liste figée à la place ». Le défaut n'est pas un oubli, il est dans la
 * forme du réglage : une liste blanche d'identifiants ne peut pas connaître l'avenir.
 *
 * ## Ce qui le remplace
 *
 * Depuis l'étape 2, **toute** mascotte est une ligne de `visit_mascot_packs`. « Proposée aux
 * visiteurs » est donc une propriété de la ligne : `is_published`. Une mascotte ajoutée plus tard
 * arrive avec son propre `is_published` et n'a besoin de figurer dans aucune liste. Le défaut
 * disparaît **par construction**, il n'est pas corrigé au cas par cas.
 *
 * ## La traduction
 *
 * Elle a lieu **une seule fois**, dans `initSchema()` et juste après le semis (il faut que les
 * lignes existent pour pouvoir les dépublier). Donc au moment des **migrations**
 * (`npm run db:migrate`), pas au démarrage du serveur — `initDatabase()` ne fait qu'un ping.
 * Elle reporte la restriction en cours sur `is_published`, puis **efface le réglage** — ce qui
 * est aussi sa marque de passage : une fois vide, il n'y a plus rien à traduire.
 *
 * Deux refus explicites, parce qu'une traduction ratée se paie en mascottes disparues :
 *
 * - si la restriction ne correspond à **aucune** ligne connue (réglage écrit avant le semis,
 *   identifiants d'une autre installation), on n'y touche pas et on le journalise ;
 * - si l'appliquer ne laisserait **aucune** mascotte proposée, on n'y touche pas non plus. Vider
 *   le sélecteur est pire que garder l'ancien réglage.
 */

const { queryAll, execute } = require('../database');
const logger = require('./logger');

const ALLOWED_KEY = 'ui.visit.mascot.allowed_ids';

/**
 * Lit la restriction en vigueur **directement dans `app_settings`**, et non via `lib/settings.js`
 * : la clé n'y figure plus (c'est tout l'objet de la bascule), donc `loadFlatSettings` l'ignore.
 * Il faut bien que quelqu'un sache encore la lire, une dernière fois, pour la traduire.
 * @returns {Promise<string[]>} identifiants restreints, `[]` si aucune restriction.
 */
async function readLegacyAllowedIds() {
  const rows = await queryAll('SELECT value_json FROM app_settings WHERE `key` = ? LIMIT 1', [
    ALLOWED_KEY,
  ]);
  if (!rows.length) return [];
  let raw = rows[0].value_json;
  try {
    raw = JSON.parse(raw);
  } catch (_) {
    /* la valeur est déjà une chaîne nue */
  }
  return String(raw || '')
    .split(/[,\n;]+/g)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

/**
 * Reporte `ui.visit.mascot.allowed_ids` sur `is_published`, puis efface le réglage.
 *
 * Idempotent : une fois le réglage vide, les appels suivants ne font rien.
 *
 * @returns {Promise<{ applied: boolean, hidden: string[], reason: string|null }>}
 */
async function migrateVisitMascotVisibilityToColumn() {
  const bilan = { applied: false, hidden: [], reason: null };
  try {
    const allowed = await readLegacyAllowedIds();
    if (allowed.length === 0) {
      bilan.reason = 'aucune_restriction';
      return bilan;
    }

    const rows = await queryAll('SELECT catalog_id, is_published FROM visit_mascot_packs');
    const connus = rows.map((r) => String(r.catalog_id || '').trim()).filter(Boolean);
    if (connus.length === 0) {
      // Aucune ligne : le semis n'a pas encore tourné. On ne traduit pas dans le vide — le
      // réglage reste en place et fera son office au prochain démarrage.
      bilan.reason = 'aucune_ligne';
      logger.warn({ allowed }, 'Visibilité mascottes : traduction reportée (table vide)');
      return bilan;
    }

    const reconnus = allowed.filter((id) => connus.includes(id));
    if (reconnus.length === 0) {
      bilan.reason = 'restriction_inconnue';
      logger.warn(
        { allowed, connus: connus.length },
        'Visibilité mascottes : la restriction ne désigne aucune mascotte connue, réglage conservé',
      );
      return bilan;
    }

    const aMasquer = connus.filter((id) => !allowed.includes(id));
    if (aMasquer.length === connus.length) {
      bilan.reason = 'selecteur_vide';
      logger.warn(
        { allowed },
        'Visibilité mascottes : la traduction viderait le sélecteur, réglage conservé',
      );
      return bilan;
    }

    for (const catalogId of aMasquer) {
      await execute(
        'UPDATE visit_mascot_packs SET is_published = 0 WHERE catalog_id = ? AND is_published = 1',
        [catalogId],
      );
    }
    // Effacer le réglage **après** avoir reporté la restriction : c'est la marque de passage,
    // et un plantage entre les deux ne fait que rejouer la traduction au démarrage suivant
    // (elle est idempotente).
    await execute('DELETE FROM app_settings WHERE `key` = ?', [ALLOWED_KEY]);

    bilan.applied = true;
    bilan.hidden = aMasquer;
    logger.info(
      { hidden: aMasquer.length, proposees: connus.length - aMasquer.length },
      'Visibilité mascottes : restriction reportée sur is_published, la liste figée est levée',
    );
    return bilan;
  } catch (err) {
    // Comme le semis : jamais d'échec au démarrage. Sans traduction, l'ancien réglage continue
    // simplement de s'appliquer — l'état d'avant, pas un état cassé.
    logger.warn({ err }, 'Visibilité mascottes : traduction ignorée');
    bilan.reason = 'erreur';
    return bilan;
  }
}

module.exports = {
  ALLOWED_KEY,
  readLegacyAllowedIds,
  migrateVisitMascotVisibilityToColumn,
};
