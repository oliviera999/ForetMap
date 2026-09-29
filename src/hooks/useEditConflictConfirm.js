import { useCallback } from 'react';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { EDIT_CONFLICT_CONFIRM_OPTIONS } from '../utils/editRevision.js';

/**
 * Question posée au prof quand la fiche qu'il enregistre a été modifiée ailleurs entre-temps
 * (`createEditRevisionSession`, option `confirmOverwrite`).
 * @returns {() => Promise<boolean>} vrai s'il choisit d'écraser l'autre version
 */
export function useEditConflictConfirm() {
  const { confirm } = useAppDialogs();
  return useCallback(() => confirm(EDIT_CONFLICT_CONFIRM_OPTIONS), [confirm]);
}
