import React from 'react';
import {
  GL_SPECIES_FIELD_LABELS,
  GL_SPECIES_TYPE_LABELS,
} from '../../utils/glSpeciesFieldLabels.js';
import { TEXTAREA_FIELDS } from '../../utils/glSpeciesEditorForm.js';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

/**
 * Champ unitaire de l'éditeur d'espèces : choisit le contrôle adapté
 * (select type/statut, textarea, ou input) selon la clé. Feuille prop-driven —
 * la valeur est détenue par le parent, les modifications remontent via
 * `onChange(fieldKey, value)`.
 */
export function GLSpeciesField({ fieldKey, value, onChange, disabled }) {
  const label = GL_SPECIES_FIELD_LABELS[fieldKey] || fieldKey;
  if (fieldKey === 'type') {
    return (
      <GLField label={label}>
        <GLSelect
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          disabled={disabled}
          required
        >
          <option value="faune">{GL_SPECIES_TYPE_LABELS.faune}</option>
          <option value="flore">{GL_SPECIES_TYPE_LABELS.flore}</option>
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
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
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
        required={fieldKey === 'nom_commun'}
      />
    </GLField>
  );
}
