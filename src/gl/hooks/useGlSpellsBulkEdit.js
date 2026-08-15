import { useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import {
  GL_SPELL_APPROVAL_MODE_LABELS,
  GL_SPELL_CASTER_KIND_LABELS,
  GL_SPELL_CAST_SCOPE_LABELS,
  GL_SPELL_FIELD_LABELS,
  GL_SPELL_STATUT_LABELS,
} from '../utils/glSpellFieldLabels.js';

/**
 * Champs modifiables en masse (alignés sur `lib/glSpellBulkPatch.js`).
 * Chaque entrée porte ses options : l'édition en masse ne concerne que des champs à
 * valeurs fermées, elle sert à harmoniser des réglages sur une sélection de sorts.
 */
export const SPELL_BULK_FIELD_OPTIONS = [
  {
    key: 'caster_kind',
    label: GL_SPELL_FIELD_LABELS.caster_kind,
    options: GL_SPELL_CASTER_KIND_LABELS,
  },
  {
    key: 'approval_mode',
    label: GL_SPELL_FIELD_LABELS.approval_mode,
    options: GL_SPELL_APPROVAL_MODE_LABELS,
  },
  {
    key: 'cast_scope',
    label: GL_SPELL_FIELD_LABELS.cast_scope,
    options: GL_SPELL_CAST_SCOPE_LABELS,
  },
  { key: 'statut', label: GL_SPELL_FIELD_LABELS.statut, options: GL_SPELL_STATUT_LABELS },
];

/**
 * Édition en masse des sortilèges : sélection par cases à cocher (y compris « tout
 * sélectionner » sur les lignes visibles), choix du réglage à appliquer et
 * POST /api/gl/admin/spells/bulk. Même contrat que `useGlFeuilletBulkEdit`.
 *
 * @param {object} options
 * @param {string[]} options.visibleCodes — codes des sorts affichés (après filtres)
 * @param {() => Promise<void>} options.reloadList — rechargement de la liste après application
 * @param {() => void} options.onApplyStart — remise à zéro des notifications avant l'appel
 * @param {(message: string) => void} options.onApplySuccess
 * @param {(message: string) => void} options.onApplyError
 */
export function useGlSpellsBulkEdit({
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

  const bulkOptions = SPELL_BULK_FIELD_OPTIONS.find((o) => o.key === bulkField)?.options || null;

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

  /** Change le réglage ciblé et présélectionne sa première option. */
  function selectBulkField(key) {
    setBulkField(key);
    const options = SPELL_BULK_FIELD_OPTIONS.find((o) => o.key === key)?.options;
    setBulkValue(options ? Object.keys(options)[0] : '');
  }

  async function applyBulk() {
    if (!bulkField || !bulkValue || !checked.size) return;
    setBulkBusy(true);
    onApplyStart();
    try {
      const res = await apiGL('/api/gl/admin/spells/bulk', 'POST', {
        codes: [...checked],
        patch: { [bulkField]: bulkValue },
      });
      const updated = res?.updated ?? 0;
      const requested = res?.requested ?? checked.size;
      onApplySuccess(
        updated === requested
          ? `Édition en masse : ${updated} sortilège(s) modifié(s).`
          : `Édition en masse : ${updated} sortilège(s) modifié(s) sur ${requested} ` +
              '(les autres avaient déjà cette valeur).',
      );
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
    bulkOptions,
    bulkBusy,
    applyBulk,
  };
}
