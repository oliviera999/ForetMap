import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

/**
 * Aside (feuille prop-driven) de l'éditeur de glossaire GL : filtres
 * recherche/catégorie, liste des termes sélectionnables, bouton « Nouveau terme ».
 * L'état (filtres, sélection, chargement) est conservé par le parent.
 *
 * @param {string} props.filterQ
 * @param {(value: string) => void} props.onFilterQChange
 * @param {string} props.filterCategorie
 * @param {(value: string) => void} props.onFilterCategorieChange
 * @param {Array<{id: string|number, label: string}>} props.categories
 * @param {Array<object>} props.items termes filtrés à afficher
 * @param {string|null} props.selectedCode
 * @param {(code: string) => void} props.onSelect
 * @param {() => void} props.onNew
 * @param {boolean} props.loading
 */
export function GLGlossaryTermList({
  filterQ,
  onFilterQChange,
  filterCategorie,
  onFilterCategorieChange,
  categories,
  items,
  selectedCode,
  onSelect,
  onNew,
  loading,
}) {
  return (
    <aside>
      <div className="gl-form gl-form--compact">
        <GLField label="Recherche">
          <GLInput
            value={filterQ}
            onChange={(e) => onFilterQChange(e.target.value)}
            placeholder="Terme ou code…"
          />
        </GLField>
        <GLField label="Catégorie">
          <GLSelect
            value={filterCategorie}
            onChange={(e) => onFilterCategorieChange(e.target.value)}
          >
            <option value="">Toutes</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </GLSelect>
        </GLField>
      </div>
      <ul className="gl-chapters-admin-list">
        {items.map((row) => (
          <li key={row.glossary_code}>
            <button
              type="button"
              className={selectedCode === row.glossary_code ? 'is-active' : ''}
              onClick={() => onSelect(row.glossary_code)}
            >
              <strong>{row.terme}</strong>
              <span className="gl-hint">{row.glossary_code}</span>
              {row.statut !== 'actif' ? <span className="gl-hint">(inactif)</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <GLButton type="button" variant="secondary" onClick={onNew} disabled={loading}>
        + Nouveau terme
      </GLButton>
    </aside>
  );
}
