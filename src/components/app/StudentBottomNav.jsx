/**
 * Navigation basse du chemin n3beur — extraite de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'onglet actif, les drapeaux
 * de modules et le compteur de tâches assignées restent calculés dans `App`
 * (aucun état déplacé, `onTabChange` = setTab).
 *
 * Accessibilité : l'onglet actif porte `aria-current="page"` (sinon l'état actif
 * n'était signalé que par la classe CSS) et l'emoji d'icône est `aria-hidden`
 * (sinon les lecteurs d'écran lisent « carte du monde Carte »).
 */
function NavButton({ id, tab, onTabChange, icon, children }) {
  const isActive = tab === id;
  return (
    <button
      className={`nav-btn ${isActive ? 'active' : ''}`}
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onTabChange(id)}
    >
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>{' '}
      {children}
    </button>
  );
}

export function StudentBottomNav({
  tab,
  onTabChange,
  canAccessStudentMapTasks,
  isVisitor = false,
  shouldUseDesktopSplit,
  tutorialsModuleEnabled,
  studentActiveAssignedTasksCount,
  canViewGeneralStats,
  observationsEnabled,
  visitEnabled,
  canAccessForum,
}) {
  const visitButton = visitEnabled ? (
    <NavButton id="visit" tab={tab} onTabChange={onTabChange} icon="🧭">
      Visite
    </NavButton>
  ) : null;

  const assignedSuffix =
    studentActiveAssignedTasksCount > 0 ? ` (${studentActiveAssignedTasksCount})` : '';

  return (
    <nav className="bottom-nav">
      {isVisitor && visitButton}
      {canAccessStudentMapTasks && shouldUseDesktopSplit && (
        <NavButton id="maptasks" tab={tab} onTabChange={onTabChange} icon="🗺️">
          {tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}
          {assignedSuffix}
        </NavButton>
      )}
      {canAccessStudentMapTasks && (
        <NavButton id="map" tab={tab} onTabChange={onTabChange} icon="🗺️">
          Carte
        </NavButton>
      )}
      {canAccessStudentMapTasks && (
        <NavButton id="tasks" tab={tab} onTabChange={onTabChange} icon="✅">
          {tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}
          {assignedSuffix}
        </NavButton>
      )}
      <NavButton id="plants" tab={tab} onTabChange={onTabChange} icon="🌱">
        Biodiversité
      </NavButton>
      <NavButton id="quiz" tab={tab} onTabChange={onTabChange} icon="❓">
        Quiz
      </NavButton>
      <NavButton id="glossary" tab={tab} onTabChange={onTabChange} icon="📖">
        Glossaire
      </NavButton>
      <NavButton id="foodweb" tab={tab} onTabChange={onTabChange} icon="🕸️">
        Réseau
      </NavButton>
      {tutorialsModuleEnabled && canAccessStudentMapTasks && (
        <NavButton id="tuto" tab={tab} onTabChange={onTabChange} icon="📘">
          Tuto
        </NavButton>
      )}
      {canViewGeneralStats && (
        <NavButton id="stats" tab={tab} onTabChange={onTabChange} icon="📊">
          Stats
        </NavButton>
      )}
      {observationsEnabled && (
        <NavButton id="notebook" tab={tab} onTabChange={onTabChange} icon="📓">
          Carnet
        </NavButton>
      )}
      {!isVisitor && visitButton}
      {canAccessForum && (
        <NavButton id="forum" tab={tab} onTabChange={onTabChange} icon="💬">
          Forum
        </NavButton>
      )}
      <NavButton id="about" tab={tab} onTabChange={onTabChange} icon="ℹ️">
        À propos
      </NavButton>
    </nav>
  );
}
