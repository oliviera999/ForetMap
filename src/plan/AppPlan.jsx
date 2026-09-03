/**
 * Coquille du Plan Lyautey (lot 1 du socle multi-produit) : aucune logique métier ici,
 * le lot 4 (docs/AUDIT_PLAN_LYAUTEY_2026-09.md) remplit `<main>`.
 */
export function AppPlan() {
  return (
    <div className="plan-shell">
      <header className="plan-header">
        <h1 className="plan-title">Plan Lyautey</h1>
        <p className="plan-intro">Le plan arrive bientôt.</p>
      </header>
      <main className="plan-main" role="main" />
    </div>
  );
}
