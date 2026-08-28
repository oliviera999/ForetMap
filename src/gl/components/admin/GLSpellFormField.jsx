import { GL_SPELL_FIELD_LABELS } from '../../utils/glSpellFieldLabels.js';
import { SELECT_FIELD_OPTIONS, TEXTAREA_FIELDS } from '../../utils/glSpellsEditorForm.js';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

/**
 * Champ unique du formulaire de sort GL, prop-driven.
 * Choisit le contrôle selon la clé : champs à valeurs fermées → select (catégorie,
 * statut, lanceurs, validation MJ, portée), champs longs → zone de texte, sinon input
 * (numérique pour les coûts). État détenu par le parent.
 */
export function GLSpellFormField({ fieldKey, value, onChange, disabled }) {
  const label = GL_SPELL_FIELD_LABELS[fieldKey] || fieldKey;
  const selectOptions = SELECT_FIELD_OPTIONS[fieldKey];
  if (selectOptions) {
    return (
      <GLField label={label}>
        <GLSelect
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          disabled={disabled}
          required={fieldKey === 'category_slug'}
        >
          {fieldKey === 'category_slug' ? <option value="">—</option> : null}
          {Object.entries(selectOptions).map(([val, lab]) => (
            <option key={val} value={val}>
              {lab}
            </option>
          ))}
        </GLSelect>
      </GLField>
    );
  }
  if (TEXTAREA_FIELDS.has(fieldKey)) {
    return (
      <GLField label={label}>
        <GLTextarea
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          rows={3}
          disabled={disabled}
        />
      </GLField>
    );
  }
  return (
    <GLField label={label}>
      <GLInput
        value={value}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        disabled={disabled}
        required={fieldKey === 'nom'}
        type={fieldKey === 'cout_gemmes' || fieldKey === 'cout_coeurs' ? 'number' : 'text'}
        min={fieldKey === 'cout_gemmes' || fieldKey === 'cout_coeurs' ? 0 : undefined}
      />
    </GLField>
  );
}
