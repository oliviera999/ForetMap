/**
 * Puce « Parcours » et liste des parcours publiés sur le plan (lot 8).
 *
 * Placée à côté des puces de catégories : un parcours est une autre façon de lire le même
 * plan, pas un autre écran.
 *
 * Un parcours **sans étape affichable** n'est pas proposé : la charge du plan écarte les
 * étapes dont le lieu est supprimé ou masqué (`routes/plan.js`), et un parcours qui n'ouvre
 * que sur « aucune étape » n'a rien à promettre (`docs/AUDIT_PARCOURS_2026-09.md` §2.4).
 *
 * @param {object} props
 * @param {Array<object>} props.routes parcours publiés.
 * @param {(route: object) => void} props.onStart
 * @param {boolean} props.open
 * @param {(next: boolean) => void} props.onToggle
 */
export function PlanRoutePicker({ routes, onStart, open, onToggle }) {
  const offered = (routes || []).filter((route) => (route?.steps || []).length > 0);
  if (offered.length === 0) return null;
  return (
    <div className="plan-routes">
      <button
        type="button"
        className={`plan-chip plan-chip--routes${open ? ' is-active' : ''}`}
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        <span aria-hidden>🧭</span> Parcours
        <span className="plan-chip__count">{offered.length}</span>
      </button>
      {open ? (
        <ul className="plan-routes__list">
          {offered.map((route) => (
            <li key={route.id}>
              <button type="button" className="plan-routes__item" onClick={() => onStart(route)}>
                <span className="plan-routes__title">{route.title}</span>
                {route.audience ? (
                  <span className="plan-routes__audience">{route.audience}</span>
                ) : null}
                <span className="plan-routes__steps">
                  {route.steps.length} étape{route.steps.length > 1 ? 's' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
