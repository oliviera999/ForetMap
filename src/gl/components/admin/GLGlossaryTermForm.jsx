import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';
import { GLMultiCheckDropdown } from '../GLMultiCheckDropdown.jsx';

/**
 * Formulaire (feuille prop-driven) d'un terme de glossaire GL.
 * L'état (form, sélection, chargement) est conservé par le parent ; les champs
 * remontent via onField(key, value) et les actions via onSubmit/onArchive.
 *
 * @param {object} props.form valeurs courantes du formulaire
 * @param {(key: string, value: *) => void} props.onField
 * @param {(event: Event) => void} props.onSubmit
 * @param {() => void} props.onArchive
 * @param {string|null} props.selectedCode
 * @param {boolean} props.loading
 * @param {Array<{id: string|number, label: string}>} props.categories
 * @param {Array<{id: string|number, label: string}>} props.niveaux
 * @param {Array<{value: string, label: string}>} props.biomeOptions
 */
export function GLGlossaryTermForm({
  form,
  onField,
  onSubmit,
  onArchive,
  selectedCode,
  loading,
  categories,
  niveaux,
  biomeOptions,
}) {
  return (
    <form className="gl-form" onSubmit={onSubmit}>
      <GLField label="Code (id)" hint="Laisser vide à la création pour génération automatique GL####">
        <GLInput
          value={form.glossary_code}
          onChange={(e) => onField('glossary_code', e.target.value)}
          disabled={Boolean(selectedCode)}
        />
      </GLField>
      <GLField label="Statut">
        <GLSelect value={form.statut} onChange={(e) => onField('statut', e.target.value)}>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
        </GLSelect>
      </GLField>
      <GLField label="Terme *">
        <GLInput value={form.terme} onChange={(e) => onField('terme', e.target.value)} required />
      </GLField>
      <GLField label="Variantes">
        <GLInput value={form.variantes} onChange={(e) => onField('variantes', e.target.value)} />
      </GLField>
      <GLField label="Catégorie *">
        <GLSelect value={form.categorie} onChange={(e) => onField('categorie', e.target.value)} required>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </GLSelect>
      </GLField>
      <GLField label="Niveau *">
        <GLSelect value={form.niveau} onChange={(e) => onField('niveau', e.target.value)} required>
          {niveaux.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </GLSelect>
      </GLField>
      <GLField label="Définition courte">
        <GLInput value={form.definition_courte} onChange={(e) => onField('definition_courte', e.target.value)} />
      </GLField>
      <GLField label="Définition complète">
        <GLTextarea value={form.definition_complete} onChange={(e) => onField('definition_complete', e.target.value)} rows={4} />
      </GLField>
      <GLField label="Exemple">
        <GLTextarea value={form.exemple} onChange={(e) => onField('exemple', e.target.value)} rows={2} />
      </GLField>
      <GLField label="Étymologie">
        <GLInput value={form.etymologie} onChange={(e) => onField('etymologie', e.target.value)} />
      </GLField>
      <GLField label="Portée">
        <label>
          <input
            type="checkbox"
            checked={form.all_biomes}
            onChange={(e) => onField('all_biomes', e.target.checked)}
          />
          {' '}
          Tous les biomes
        </label>
      </GLField>
      {!form.all_biomes ? (
        <GLMultiCheckDropdown
          label="Biomes concernés"
          options={biomeOptions}
          selectedValues={form.biome_slugs}
          onChange={(next) => onField('biome_slugs', next)}
          emptyLabel="Aucun biome"
          allSelectedLabel="Tous les biomes listés"
        />
      ) : null}
      <GLField label="Termes liés" hint="Codes GL#### ou libellés, séparés par des virgules">
        <GLInput value={form.termes_lies} onChange={(e) => onField('termes_lies', e.target.value)} />
      </GLField>
      <GLField label="Présent dans le QCM">
        <GLInput value={form.present_dans_qcm} onChange={(e) => onField('present_dans_qcm', e.target.value)} />
      </GLField>
      <GLField label="Idée d’illustration">
        <GLTextarea value={form.illustration_idee} onChange={(e) => onField('illustration_idee', e.target.value)} rows={2} />
      </GLField>
      <div className="gl-inline-actions">
        <GLButton type="submit" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </GLButton>
        {selectedCode ? (
          <GLButton type="button" variant="secondary" onClick={onArchive} disabled={loading}>
            Archiver
          </GLButton>
        ) : null}
      </div>
    </form>
  );
}
