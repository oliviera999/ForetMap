/**
 * Logique pure de la grille admin « Zones & repères » — édition directe et
 * actions par lot. Aucune dépendance React : tout est testable isolément.
 *
 * Les patchs produits sont des corps de `PUT /api/zones/:id` /
 * `PUT /api/map/markers/:id` **partiels** : seuls les champs modifiés sont
 * envoyés, le reste de la fiche (polygone, photos, blocs éditoriaux…) est
 * conservé par le serveur.
 */

import {
  MARKER_EMOJIS,
  MAP_MARKER_EMOJI_MAX_CHARS,
  clampEmojiInput,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../constants/emojis.js';
import { buildZoneName } from './zoneModalForm.js';
import { locationCategoryIds } from './locationCategories.js';
import { orderedLivingBeingsForForm } from './livingBeings';

/** Découpe le nom stocké d'une zone en { emoji, cleanName } (préfixe emoji + nom). */
export function splitZoneName(name, emojiList = MARKER_EMOJIS) {
  return {
    emoji: detectLeadingMarkerEmoji(name || '', emojiList) || '',
    cleanName: stripLeadingMarkerEmoji(name || '', emojiList) || '',
  };
}

/**
 * Recompose le nom complet d'une zone (préfixe emoji + nom nettoyé).
 * Renvoie `null` si le nom est vide (sauvegarde à bloquer).
 */
export function composeZoneName(cleanName, emoji, emojiList = MARKER_EMOJIS) {
  return buildZoneName(cleanName, emoji, {
    markerEmojis: emojiList,
    emojiParsingList: emojiList,
  });
}

/** Liste ordonnée des êtres vivants d'un lieu (junction, JSON legacy, colonne legacy). */
export function locationLivingBeings(item) {
  return orderedLivingBeingsForForm(
    item?.living_beings_list || item?.living_beings,
    item?.plant_name || item?.current_plant,
  );
}

/**
 * Catégories réellement posables sur un lieu : actives, applicables à son type
 * et globales ou propres à sa carte (même filtre que `resolveAssignableCategoryIds`
 * côté serveur, qui reste l'arbitre final).
 */
export function categoryOptionsForLocation(kind, mapId, catalog = []) {
  return (catalog || []).filter(
    (cat) =>
      cat &&
      cat.is_active !== false &&
      (cat.applies_to === 'both' || cat.applies_to === kind) &&
      (!cat.map_id || String(cat.map_id) === String(mapId)),
  );
}

/** Remplacement littéral de toutes les occurrences (pas d'expression régulière). */
export function applyFindReplace(text, find, replace) {
  if (!find) return String(text ?? '');
  return String(text ?? '')
    .split(find)
    .join(String(replace ?? ''));
}

/** Actions par lot proposées ; `forKinds` restreint aux types concernés. */
export const BULK_ACTIONS = [
  { id: 'add_category', label: 'Ajouter une catégorie', forKinds: ['zone', 'marker'] },
  { id: 'remove_category', label: 'Retirer une catégorie', forKinds: ['zone', 'marker'] },
  { id: 'add_species', label: 'Ajouter une espèce', forKinds: ['zone', 'marker'] },
  { id: 'remove_species', label: 'Retirer une espèce', forKinds: ['zone', 'marker'] },
  { id: 'set_map', label: 'Déplacer vers une carte', forKinds: ['zone', 'marker'] },
  { id: 'set_emoji', label: 'Définir l’emoji', forKinds: ['zone', 'marker'] },
  { id: 'find_replace', label: 'Rechercher / remplacer', forKinds: ['zone', 'marker'] },
  { id: 'delete', label: 'Supprimer les lieux', forKinds: ['zone', 'marker'] },
];

function skip(reason) {
  return { skip: reason };
}

/**
 * Calcule l'effet d'une action de lot sur un lieu.
 *
 * @param {string} actionId identifiant `BULK_ACTIONS`
 * @param {object} params paramètres de l'action :
 *   - add/remove_category : { categoryId, catalog }
 *   - add/remove_species  : { speciesName }
 *   - set_map             : { mapId }
 *   - set_emoji           : { emoji }
 *   - find_replace        : { find, replace, includeText }
 * @param {{ kind: 'zone'|'marker', item: object }} target
 * @returns {{ patch: object }|{ del: true }|{ skip: string }}
 *   `patch` : corps du PUT partiel ; `del` : suppression ; `skip` : lieu non
 *   concerné (déjà conforme, catégorie non applicable, aucune occurrence…).
 */
export function bulkPatchForItem(actionId, params = {}, { kind, item }) {
  switch (actionId) {
    case 'add_category': {
      const id = String(params.categoryId || '');
      if (!id) return skip('catégorie manquante');
      const current = locationCategoryIds(item);
      if (current.includes(id)) return skip('déjà dans la catégorie');
      const applicable = categoryOptionsForLocation(kind, item.map_id, params.catalog).some(
        (cat) => String(cat.id) === id,
      );
      if (!applicable) return skip('catégorie non applicable à ce lieu');
      return { patch: { category_ids: [...current, id] } };
    }
    case 'remove_category': {
      const id = String(params.categoryId || '');
      if (!id) return skip('catégorie manquante');
      const current = locationCategoryIds(item);
      if (!current.includes(id)) return skip('ne porte pas cette catégorie');
      return { patch: { category_ids: current.filter((c) => c !== id) } };
    }
    case 'add_species': {
      const name = String(params.speciesName || '').trim();
      if (!name) return skip('espèce manquante');
      const current = locationLivingBeings(item);
      if (current.includes(name)) return skip('espèce déjà associée');
      return { patch: { living_beings: [...current, name] } };
    }
    case 'remove_species': {
      const name = String(params.speciesName || '').trim();
      if (!name) return skip('espèce manquante');
      const current = locationLivingBeings(item);
      if (!current.includes(name)) return skip('espèce non associée');
      return { patch: { living_beings: current.filter((n) => n !== name) } };
    }
    case 'set_map': {
      const mapId = String(params.mapId || '').trim();
      if (!mapId) return skip('carte manquante');
      if (String(item.map_id) === mapId) return skip('déjà sur cette carte');
      return { patch: { map_id: mapId } };
    }
    case 'set_emoji': {
      const emoji = clampEmojiInput(String(params.emoji || '').trim(), MAP_MARKER_EMOJI_MAX_CHARS);
      if (!emoji) return skip('emoji manquant');
      if (kind === 'marker') {
        if (String(item.emoji || '').trim() === emoji) return skip('emoji déjà en place');
        return { patch: { emoji } };
      }
      const { emoji: currentEmoji, cleanName } = splitZoneName(item.name);
      if (currentEmoji === emoji) return skip('emoji déjà en place');
      const name = composeZoneName(cleanName, emoji);
      if (!name) return skip('nom de zone vide');
      return { patch: { name } };
    }
    case 'find_replace': {
      const find = String(params.find ?? '');
      if (!find) return skip('texte à rechercher manquant');
      const replace = String(params.replace ?? '');
      const patch = {};
      if (kind === 'zone') {
        const { emoji, cleanName } = splitZoneName(item.name);
        const nextClean = applyFindReplace(cleanName, find, replace);
        if (nextClean !== cleanName) {
          // Sans emoji détecté en tête, on n'en ajoute pas un au passage :
          // `composeZoneName` poserait le premier de la palette par défaut.
          const name = emoji ? composeZoneName(nextClean, emoji) : nextClean.trim();
          if (!name) return skip('le remplacement viderait le nom');
          patch.name = name;
        }
        if (params.includeText) {
          const nextDesc = applyFindReplace(item.description || '', find, replace);
          if (nextDesc !== String(item.description || '')) patch.description = nextDesc;
        }
      } else {
        const nextLabel = applyFindReplace(item.label || '', find, replace);
        if (nextLabel !== String(item.label || '')) {
          if (!nextLabel.trim()) return skip('le remplacement viderait le nom');
          patch.label = nextLabel;
        }
        if (params.includeText) {
          const nextNote = applyFindReplace(item.note || '', find, replace);
          if (nextNote !== String(item.note || '')) patch.note = nextNote;
        }
      }
      if (Object.keys(patch).length === 0) return skip('aucune occurrence');
      return { patch };
    }
    case 'delete':
      return { del: true };
    default:
      return skip('action inconnue');
  }
}

/** Nombre de lieux réellement touchés par une action (aperçu avant application). */
export function countBulkTargets(actionId, params, targets = []) {
  let n = 0;
  for (const target of targets) {
    const effect = bulkPatchForItem(actionId, params, target);
    if (!effect.skip) n += 1;
  }
  return n;
}
