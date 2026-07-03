import { useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/** Champs modifiables en masse (alignés sur lib/glFeuilletBulkPatch.js). */
export const FEUILLET_BULK_FIELD_OPTIONS = [
  { key: 'lien_canal', label: 'Canal de lien', kind: 'text' },
  { key: 'lien_ref', label: 'Référence de lien', kind: 'text' },
  { key: 'lien_pays', label: 'Pays (1–5)', kind: 'number' },
  { key: 'biome_slug', label: 'Biome', kind: 'biome' },
  { key: 'plateau_number', label: 'Plateau (1–5)', kind: 'number' },
  { key: 'statut', label: 'Statut', kind: 'statut' },
  { key: 'cout_gemme', label: 'Coût gemme', kind: 'number' },
  { key: 'gain_coeur', label: 'Gain cœur', kind: 'number' },
];

/**
 * Édition en masse des feuillets du carnet de Sélène : sélection par cases à
 * cocher (y compris « tout sélectionner » sur les lignes visibles), choix du
 * champ/valeur à appliquer et POST /api/gl/lore/admin/feuillets/bulk.
 * Les notifications restent dans le panneau via les callbacks.
 *
 * @param {object} options
 * @param {string[]} options.visibleCodes — codes des feuillets affichés (après filtres)
 * @param {() => Promise<void>} options.reloadList — rechargement de la liste après application
 * @param {() => void} options.onApplyStart — remise à zéro des notifications avant l'appel
 * @param {(message: string) => void} options.onApplySuccess
 * @param {(message: string) => void} options.onApplyError
 */
export function useGlFeuilletBulkEdit({
  visibleCodes,
  reloadList,
  onApplyStart,
  onApplySuccess,
  onApplyError,
}) {
  const [checked, setChecked] = useState(() => new Set());
  const [bulkField, setBulkField] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const bulkKind = FEUILLET_BULK_FIELD_OPTIONS.find((o) => o.key === bulkField)?.kind || null;

  const allVisibleChecked =
    visibleCodes.length > 0 && visibleCodes.every((code) => checked.has(code));

  function toggleCheck(code) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleCheckAll() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visibleCodes.forEach((code) => next.delete(code));
      else visibleCodes.forEach((code) => next.add(code));
      return next;
    });
  }

  function clearChecked() {
    setChecked(new Set());
  }

  /** Change le champ ciblé et réinitialise la valeur saisie. */
  function selectBulkField(key) {
    setBulkField(key);
    setBulkValue('');
  }

  async function applyBulk() {
    if (!bulkField || !checked.size) return;
    setBulkBusy(true);
    onApplyStart();
    try {
      const res = await apiGL('/api/gl/lore/admin/feuillets/bulk', 'POST', {
        codes: [...checked],
        patch: { [bulkField]: bulkValue },
      });
      onApplySuccess(`Édition en masse : ${res?.updated ?? 0} feuillet(s) modifié(s).`);
      setChecked(new Set());
      setBulkField('');
      setBulkValue('');
      await reloadList();
    } catch (err) {
      onApplyError(err.message || 'Édition en masse impossible');
    } finally {
      setBulkBusy(false);
    }
  }

  return {
    checked,
    allVisibleChecked,
    toggleCheck,
    toggleCheckAll,
    clearChecked,
    bulkField,
    selectBulkField,
    bulkValue,
    setBulkValue,
    bulkKind,
    bulkBusy,
    applyBulk,
  };
}
