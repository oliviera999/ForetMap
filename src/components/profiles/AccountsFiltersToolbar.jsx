import { PROFILES_PAGE_SIZES, PROFILES_SORTS } from '../../utils/profilesUserListFilters.js';

/**
 * Barre de recherche, filtres et tri de l'onglet Comptes.
 *
 * P10 de l'audit UX : chaque champ porte désormais un **libellé visible**. Quatre `<select>`
 * alignés qui n'avaient qu'un `aria-label` devenaient illisibles dès qu'une valeur était
 * choisie — « Novice » ne dit pas de quel filtre il s'agit. P6 ajoute le tri.
 *
 * Présentationnel pur : l'état des filtres vit au parent (qui le synchronise avec l'URL).
 */
export function AccountsFiltersToolbar({
  filters,
  roles = [],
  groupOptions = [],
  pageSize,
  pageSizes = PROFILES_PAGE_SIZES,
  onChange,
  onChangePageSize,
}) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="profiles-admin-list-toolbar">
      <div className="profiles-admin-filter">
        <label htmlFor="accounts-filter-q">Rechercher</label>
        <input
          id="accounts-filter-q"
          type="search"
          value={filters.query}
          onChange={set('query')}
          placeholder="Nom, pseudo, e-mail…"
        />
      </div>
      <div className="profiles-admin-filter">
        <label htmlFor="accounts-filter-role">Profil</label>
        <select id="accounts-filter-role" value={filters.roleId} onChange={set('roleId')}>
          <option value="">Tous les profils</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name || r.slug}
            </option>
          ))}
        </select>
      </div>
      <div className="profiles-admin-filter">
        <label htmlFor="accounts-filter-type">Type de compte</label>
        <select id="accounts-filter-type" value={filters.userType} onChange={set('userType')}>
          <option value="">Tous les types</option>
          <option value="student">Élèves</option>
          <option value="teacher">Enseignants</option>
        </select>
      </div>
      <div className="profiles-admin-filter">
        <label htmlFor="accounts-filter-group">Groupe</label>
        <select id="accounts-filter-group" value={filters.groupId} onChange={set('groupId')}>
          <option value="">Tous les groupes</option>
          {groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="profiles-admin-filter">
        <label htmlFor="accounts-filter-sort">Trier par</label>
        <select id="accounts-filter-sort" value={filters.sort} onChange={set('sort')}>
          {PROFILES_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="profiles-admin-filter profiles-admin-filter--narrow">
        <label htmlFor="accounts-filter-size">Par page</label>
        <select
          id="accounts-filter-size"
          value={pageSize}
          onChange={(e) => onChangePageSize(e.target.value)}
        >
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
