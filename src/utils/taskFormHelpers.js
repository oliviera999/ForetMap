/**
 * Helpers purs des formulaires de tâche/projet — initialisation de champs et libellés de zone.
 *
 * Extraits de `tasks-views.jsx` (O6) car partagés par `TaskFormModal` et `TaskProjectFormModal` ;
 * sortir ce dernier dans son propre fichier imposait de mutualiser ces fonctions.
 */
import { orderedLivingBeingsForForm, formatLivingBeingsListLine } from './livingBeings';

/** Libellé d'une zone dans un sélecteur (nom + êtres vivants éventuels). */
export function zonePickDisplayName(z) {
  const line = formatLivingBeingsListLine(
    orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant),
  );
  return line ? `${z.name} — ${line}` : z.name;
}

/** IDs initiaux d'un champ lieu (clé multi prioritaire, repli sur la clé simple). */
export function initialLocationIds(editTask, keyMulti, keySingle) {
  if (!editTask) return [];
  const multi = editTask[keyMulti];
  if (Array.isArray(multi) && multi.length) {
    return [...new Set(multi.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  const one = editTask[keySingle];
  return one ? [String(one).trim()].filter(Boolean) : [];
}

/** IDs initiaux d'objets liés (tableau d'objets `{ id }`), dédupliqués. */
export function initialLinkedObjectIds(editTask, linkedKey) {
  if (!editTask) return [];
  const linked = editTask[linkedKey];
  if (!Array.isArray(linked) || !linked.length) return [];
  return [...new Set(linked
    .map((entry) => String(entry?.id || '').trim())
    .filter(Boolean))];
}

/** Normalise une liste d'IDs de tutoriels en entiers positifs uniques. */
export function normalizeTutorialIds(ids) {
  if (!Array.isArray(ids)) return [];
  const unique = new Set();
  for (const raw of ids) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    unique.add(n);
  }
  return [...unique];
}
