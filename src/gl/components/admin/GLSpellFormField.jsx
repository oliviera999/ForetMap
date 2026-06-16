import React from 'react';
import {
  GL_SPELL_CATEGORY_LABELS,
  GL_SPELL_FIELD_LABELS,
  GL_SPELL_STATUT_LABELS,
} from '../../utils/glSpellFieldLabels.js';
import { TEXTAREA_FIELDS } from '../../utils/glSpellsEditorForm.js';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

/**
 * Champ unique du formulaire de sort GL, prop-driven.
 * Choisit le contrôle selon la clé : catégorie/statut → select, champs longs →
 * zone de texte, sinon input (numérique pour les coûts). État détenu par le parent.
 */
export function GLSpellFormField({ fieldKey, value, onChange, disabled }) {
  const label = GL_SPELL_FIELD_LABELS[fieldKey] || fieldKey;
  if (fieldKey === 'category_slug') {
    return (
      <GLField label={label}>
        <GLSelect
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          disabled={disabled}
          required
        >
          <option value="">—</option>
          {Object.entries(GL_SPELL_CATEGORY_LABELS).map(([slug, nom]) => (
            <option key={slug} value={slug}>
              {nom}
            </option>
          ))}
        </GLSelect>
      </GLField>
    );
  }
  if (fieldKey === 'statut') {
    return (
      <GLField label={label}>
        <GLSelect
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          disabled={disabled}
        >
          {Object.entries(GL_SPELL_STATUT_LABELS).map(([val, lab]) => (
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
