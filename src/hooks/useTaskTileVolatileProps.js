import { useMemo, useRef } from 'react';

/** Référence stable pour « aucune sélection » : ne casse pas React.memo des tuiles fermées. */
const EMPTY_SELECTED_STUDENT_IDS = Object.freeze([]);

/** Égalité superficielle de deux enregistrements plats (clés + valeurs). */
function shallowEqualRecord(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function volatilePropsEqual(prev, next) {
  return (
    prev.quickAssignTaskId === next.quickAssignTaskId &&
    prev.quickAssignStudentIds === next.quickAssignStudentIds &&
    prev.draggingTaskId === next.draggingTaskId &&
    shallowEqualRecord(prev.loading, next.loading)
  );
}

/**
 * Tranche de `loading` qui concerne une tâche : clés `${id}<action>` (assign, unassign,
 * del, status…, assign_teacher_quick, assign-group, _teacher_collective_done_…).
 * Le caractère qui suit l'id ne doit pas être un chiffre pour ne pas confondre la
 * tâche 4 avec la clé « 42assign ». Seules les entrées vraies comptent : `loading[k]`
 * absent ou `false` produisent le même rendu dans `TaskTileCard`.
 */
function taskBusySlice(loading, idStr) {
  const busy = {};
  if (!loading || !idStr) return busy;
  for (const key of Object.keys(loading)) {
    if (!loading[key] || !key.startsWith(idStr)) continue;
    const nextChar = key.charAt(idStr.length);
    if (nextChar >= '0' && nextChar <= '9') continue;
    busy[key] = loading[key];
  }
  return busy;
}

/**
 * Dérive, par tuile, les props volatiles de `TaskTileCard` (O2/P1) : `loading` (tranche
 * limitée aux clés de la tâche), `quickAssignTaskId` / `quickAssignStudentIds` (transmis
 * uniquement à la tuile dont le panneau d'affectation rapide est ouvert) et
 * `draggingTaskId` (uniquement à la tuile glissée).
 *
 * Retourne un getter `(t) => props` mémoïsé par id de tâche : tant que rien ne change
 * pour une tuile, la même référence d'objet est retournée, donc la comparaison shallow
 * de `React.memo(TaskTileCard)` reste vraie et la tuile n'est pas re-réconciliée.
 * Iso-comportement : `TaskTileCard` ne lit ces props que via `loading[clé préfixée par
 * l'id]`, `quickAssignTaskId === t.id` et `String(draggingTaskId) === String(t.id)`.
 */
export function useTaskTileVolatileProps({
  loading,
  quickAssignTaskId,
  quickAssignStudentIds,
  draggingTaskId = null,
}) {
  const cacheRef = useRef(new Map());
  return useMemo(() => {
    const cache = cacheRef.current;
    return (t) => {
      const idStr = String(t?.id ?? '');
      const isQuickAssignOpen = quickAssignTaskId != null && String(quickAssignTaskId) === idStr;
      const next = {
        loading: taskBusySlice(loading, idStr),
        quickAssignTaskId: isQuickAssignOpen ? quickAssignTaskId : null,
        quickAssignStudentIds: isQuickAssignOpen
          ? quickAssignStudentIds
          : EMPTY_SELECTED_STUDENT_IDS,
        draggingTaskId:
          draggingTaskId != null && String(draggingTaskId) === idStr ? draggingTaskId : null,
      };
      const prev = cache.get(idStr);
      if (prev && volatilePropsEqual(prev, next)) return prev;
      cache.set(idStr, next);
      return next;
    };
  }, [loading, quickAssignTaskId, quickAssignStudentIds, draggingTaskId]);
}
