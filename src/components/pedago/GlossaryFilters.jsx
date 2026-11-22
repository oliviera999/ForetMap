/**
 * Barre de filtres de l'onglet Glossaire (extraite de `GlossaryView`, flux C2) : recherche,
 * profondeur du terme, catégorie, niveau et notion du programme. Composant contrôlé : chaque
 * valeur et son option viennent du parent.
 */

/** Liste déroulante étiquetée (une option = `{ value, label }`). */
function FilterSelect({ label, value, onChange, options, wide = false }) {
  return (
    <label className={`pedago-filter-field${wide ? ' pedago-filter-field--wide' : ''}`}>
      <span>{label}</span>
      <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * @param {object} props
 * @param {{ value: string, onChange: (v: string) => void }} props.search
 * @param {{ value: string, onChange: (v: string) => void, options: any[] }} props.niveau
 * @param {{ value: string, onChange: (v: string) => void, options: any[] }} props.categorie
 * @param {{ value: string, onChange: (v: string) => void, options: any[] }} props.notionNiveau
 * @param {{ value: string, onChange: (v: string) => void, options: any[] }} props.notion
 */
export function GlossaryFilters({ search, niveau, categorie, notionNiveau, notion }) {
  return (
    <div className="pedago-filters card">
      <label className="pedago-filter-field">
        <span>Recherche</span>
        <input
          type="search"
          className="form-input"
          placeholder="Mot-clé…"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
        />
      </label>
      <FilterSelect label="Niveau" {...niveau} />
      <FilterSelect label="Catégorie" {...categorie} />
      <FilterSelect label="Niveau du programme" {...notionNiveau} />
      <FilterSelect label="Notion du programme" {...notion} wide />
    </div>
  );
}
