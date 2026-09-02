/**
 * Navigation basse du chemin n3beur — extraite de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'onglet actif, les drapeaux
 * de modules et le compteur de tâches assignées restent calculés dans `App`
 * (aucun état déplacé, `onTabChange` = setTab).
 *
 * Icônes : jeu SVG commun (src/shared/icons.jsx, audit D-2) — rendu identique sur tous
 * les appareils ; les emojis restent réservés au contenu métier.
 *
 * Accessibilité : l'onglet actif porte `aria-current="page"` (sinon l'état actif
 * n'était signalé que par la classe CSS) et l'icône est décorative (`aria-hidden`).
 */
import {
  IconAbout,
  IconBiodiv,
  IconFoodweb,
  IconForum,
  IconGlossary,
  IconMap,
  IconNotebook,
  IconQuiz,
  IconStats,
  IconTasks,
  IconTuto,
  IconVisit,
} from '../../shared/icons.jsx';
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
    <NavButton id="visit" tab={tab} onTabChange={onTabChange} icon={<IconVisit size={20} />}>
      Visite
    </NavButton>
  ) : null;

  const assignedSuffix =
    studentActiveAssignedTasksCount > 0 ? ` (${studentActiveAssignedTasksCount})` : '';

  return (
    <nav className="bottom-nav">
      {isVisitor && visitButton}
      {canAccessStudentMapTasks && shouldUseDesktopSplit && (
        <NavButton id="maptasks" tab={tab} onTabChange={onTabChange} icon={<IconMap size={20} />}>
          {tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}
          {assignedSuffix}
        </NavButton>
      )}
      {canAccessStudentMapTasks && (
        <NavButton id="map" tab={tab} onTabChange={onTabChange} icon={<IconMap size={20} />}>
          Carte
        </NavButton>
      )}
      {canAccessStudentMapTasks && (
        <NavButton id="tasks" tab={tab} onTabChange={onTabChange} icon={<IconTasks size={20} />}>
          {tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}
          {assignedSuffix}
        </NavButton>
      )}
      <NavButton id="plants" tab={tab} onTabChange={onTabChange} icon={<IconBiodiv size={20} />}>
        Biodiversité
      </NavButton>
      <NavButton id="quiz" tab={tab} onTabChange={onTabChange} icon={<IconQuiz size={20} />}>
        Quiz
      </NavButton>
      <NavButton
        id="glossary"
        tab={tab}
        onTabChange={onTabChange}
        icon={<IconGlossary size={20} />}
      >
        Glossaire
      </NavButton>
      <NavButton id="foodweb" tab={tab} onTabChange={onTabChange} icon={<IconFoodweb size={20} />}>
        Réseau
      </NavButton>
      {tutorialsModuleEnabled && canAccessStudentMapTasks && (
        <NavButton id="tuto" tab={tab} onTabChange={onTabChange} icon={<IconTuto size={20} />}>
          Tuto
        </NavButton>
      )}
      {canViewGeneralStats && (
        <NavButton id="stats" tab={tab} onTabChange={onTabChange} icon={<IconStats size={20} />}>
          Stats
        </NavButton>
      )}
      {observationsEnabled && (
        <NavButton
          id="notebook"
          tab={tab}
          onTabChange={onTabChange}
          icon={<IconNotebook size={20} />}
        >
          Carnet
        </NavButton>
      )}
      {!isVisitor && visitButton}
      {canAccessForum && (
        <NavButton id="forum" tab={tab} onTabChange={onTabChange} icon={<IconForum size={20} />}>
          Forum
        </NavButton>
      )}
      <NavButton id="about" tab={tab} onTabChange={onTabChange} icon={<IconAbout size={20} />}>
        À propos
      </NavButton>
    </nav>
  );
}
