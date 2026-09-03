import { useId } from 'react';

/**
 * Barre haute flottante du plan (lot 4) : titre du lieu et **champ de recherche**, toujours
 * accessible au pouce en haut de l'écran. Pas de menu, pas de connexion : le plan n'a qu'une
 * seule chose à faire.
 *
 * @param {object} props
 * @param {string} props.title titre du plan (réglage `ui.plan.title`).
 * @param {string} props.query saisie courante.
 * @param {(next: string) => void} props.onQueryChange
 * @param {() => void} [props.onFocusSearch] ouverture de la feuille de résultats.
 * @param {number} [props.resultCount] nombre de résultats (annonce vocale).
 */
export function PlanTopBar({ title, query, onQueryChange, onFocusSearch, resultCount = null }) {
  const inputId = useId();
  return (
    <header className="plan-topbar">
      <h1 className="plan-topbar__title">{title}</h1>
      <div className="plan-topbar__search">
        <label className="fm-visually-hidden" htmlFor={inputId}>
          Rechercher un lieu
        </label>
        <span className="plan-topbar__search-icon" aria-hidden>
          🔍
        </span>
        <input
          id={inputId}
          type="search"
          className="plan-topbar__input"
          placeholder="Rechercher un lieu…"
          value={query}
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={onFocusSearch}
        />
        {query ? (
          <button
            type="button"
            className="plan-topbar__clear"
            aria-label="Effacer la recherche"
            onClick={() => onQueryChange('')}
          >
            ✕
          </button>
        ) : null}
      </div>
      <p className="fm-visually-hidden" role="status">
        {query && resultCount != null
          ? `${resultCount} lieu${resultCount > 1 ? 'x' : ''} trouvé${resultCount > 1 ? 's' : ''}`
          : ''}
      </p>
    </header>
  );
}
