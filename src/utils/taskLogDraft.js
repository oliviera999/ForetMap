/**
 * Brouillon de commentaire de rapport de tâche, persisté en sessionStorage.
 *
 * Extrait de `tasks-views.jsx` (O6) pour découpler `LogModal` du méga-composant et le tester.
 */
import {
  safeSessionStorageGetItem,
  safeSessionStorageSetItem,
  safeSessionStorageRemoveItem,
} from './browserStorage.js';

export function taskLogCommentDraftKey(taskId) {
  return `foretmap:taskLogCommentDraft:${String(taskId ?? '')}`;
}

export function readTaskLogCommentDraft(taskId) {
  return String(safeSessionStorageGetItem(taskLogCommentDraftKey(taskId), '') || '');
}

export function writeTaskLogCommentDraft(taskId, text) {
  if (taskId == null || taskId === '') return;
  const key = taskLogCommentDraftKey(taskId);
  const v = String(text || '');
  if (v.trim()) safeSessionStorageSetItem(key, v);
  else safeSessionStorageRemoveItem(key);
}
