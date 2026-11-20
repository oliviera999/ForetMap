/**
 * État vide partagé (ForêtMap + Gnomes & Licornes) — lot R0 de l'audit UI/UX du 19/11/2026.
 *
 * Remplace le motif recopié `<div className="empty"><div className="empty-icon">…</div><p>…</p></div>`
 * (26 occurrences au relevé) : une seule structure, une seule feuille
 * (`src/shared/styles/empty-state.css`), des jetons partout.
 *
 * L'icône est décorative (`aria-hidden`) : le sens passe par le titre et le texte. Le
 * composant n'est pas une région vivante par défaut ; passer `role="status"` quand l'état
 * vide apparaît en réponse à une action (filtre, recherche) et doit être annoncé.
 *
 * @param {object} props
 * @param {import('react').ReactNode} [props.icon] icône ou emoji décoratif
 * @param {import('react').ReactNode} [props.title] titre court (facultatif)
 * @param {import('react').ReactNode} [props.children] message
 * @param {import('react').ReactNode} [props.action] bouton ou lien de sortie (« Changer de filtre »…)
 * @param {boolean} [props.compact] marges et icône réduites (panneau, liste imbriquée)
 * @param {boolean} [props.framed] cadre pointillé (zone de dépôt, console MJ)
 * @param {string} [props.role] ex. `status`
 * @param {string} [props.className] classes additionnelles
 * @param {string} [props.testId] `data-testid`
 */
export function EmptyState({
  icon = null,
  title = null,
  children = null,
  action = null,
  compact = false,
  framed = false,
  role,
  className = '',
  testId,
}) {
  const classes = [
    'empty-state',
    compact ? 'empty-state--compact' : '',
    framed ? 'empty-state--framed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} role={role} data-testid={testId}>
      {icon ? (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {title ? <p className="empty-state-title">{title}</p> : null}
      {children ? <div className="empty-state-text">{children}</div> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
