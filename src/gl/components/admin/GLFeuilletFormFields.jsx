import React from 'react';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';
import { GLMarkdownEditor } from '../ui/GLMarkdownEditor.jsx';
import { GLFeuilletSpeciesPicker } from './GLFeuilletSpeciesPicker.jsx';
import { FEUILLET_SECTIONS } from '../../utils/glFeuilletFieldLabels.js';

/**
 * Rend le contrôle d'un champ de feuillet selon son `kind` (cf. FEUILLET_SECTIONS).
 * Source unique partagée par tous les points d'édition d'un feuillet.
 *
 * @param {{
 *   field: { key: string, kind?: string, rows?: number, options?: string[], readOnly?: boolean },
 *   form: object,
 *   biomes?: Array<{ slug: string, nom?: string }>,
 *   onChange: (key: string, value: any) => void,
 *   onPatch: (patch: object) => void,
 * }} props
 */
export function GLFeuilletFieldControl({ field, form, biomes = [], onChange, onPatch }) {
  const value = form?.[field.key] ?? '';

  if (field.kind === 'biome') {
    return (
      <GLSelect value={value} onChange={(e) => onChange(field.key, e.target.value)}>
        <option value="">— Aucun —</option>
        {biomes.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.nom || b.slug}
          </option>
        ))}
      </GLSelect>
    );
  }
  if (field.kind === 'select') {
    return (
      <GLSelect value={value} onChange={(e) => onChange(field.key, e.target.value)}>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </GLSelect>
    );
  }
  if (field.kind === 'species-picker') {
    return (
      <GLFeuilletSpeciesPicker
        biomeSlug={form?.biome_slug}
        canal={form?.lien_canal}
        reference={form?.lien_ref}
        onChange={({ canal, ref }) => onPatch({ lien_canal: canal, lien_ref: ref })}
      />
    );
  }
  if (field.kind === 'markdown') {
    return (
      <GLMarkdownEditor
        value={value}
        rows={field.rows || 4}
        onChange={(next) =>
          // GLMarkdownEditor renvoie soit une chaîne, soit un event selon le mode.
          onChange(field.key, typeof next === 'string' ? next : next?.target?.value || '')
        }
      />
    );
  }
  if (field.kind === 'textarea') {
    return (
      <GLTextarea
        value={value}
        rows={field.rows || 3}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    );
  }
  return (
    <GLInput
      type={field.kind === 'number' ? 'number' : 'text'}
      value={value}
      readOnly={field.readOnly || false}
      disabled={field.readOnly || false}
      onChange={(e) => onChange(field.key, e.target.value)}
    />
  );
}

/**
 * Formulaire complet d'un feuillet : les sections de FEUILLET_SECTIONS rendues
 * en `<details>`, chacune avec sa grille de champs. `renderSectionExtra` permet
 * d'injecter des blocs additionnels (chapitres, zone, ordre de liasse…) sous une
 * section donnée.
 *
 * @param {{
 *   form: object,
 *   biomes?: Array<{ slug: string, nom?: string }>,
 *   sections?: Array<object>,
 *   onChange: (key: string, value: any) => void,
 *   onPatch: (patch: object) => void,
 *   renderSectionExtra?: (section: object) => React.ReactNode,
 * }} props
 */
export function GLFeuilletFormSections({
  form,
  biomes = [],
  sections = FEUILLET_SECTIONS,
  onChange,
  onPatch,
  renderSectionExtra,
}) {
  return sections.map((section) => (
    <details key={section.id} open={section.open || false}>
      <summary>{section.title}</summary>
      <div className="gl-feuillet-editor-modal__grid">
        {section.fields.map((field) => (
          <GLField
            key={field.key}
            label={field.label}
            className={
              field.kind === 'markdown' || field.kind === 'species-picker'
                ? 'gl-field--wide'
                : undefined
            }
          >
            <GLFeuilletFieldControl
              field={field}
              form={form}
              biomes={biomes}
              onChange={onChange}
              onPatch={onPatch}
            />
          </GLField>
        ))}
      </div>
      {renderSectionExtra ? renderSectionExtra(section) : null}
    </details>
  ));
}
