import React from 'react';

/**
 * Navigation basse du chemin n3beur — extraite de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'onglet actif, les drapeaux
 * de modules et le compteur de tâches assignées restent calculés dans `App`
 * (aucun état déplacé, `onTabChange` = setTab).
 */
export function StudentBottomNav({
  tab,
  onTabChange,
  canAccessStudentMapTasks,
  shouldUseDesktopSplit,
  tutorialsModuleEnabled,
  mergeTasksTutoNav,
  studentActiveAssignedTasksCount,
  canViewGeneralStats,
  observationsEnabled,
  visitEnabled,
  canAccessForum,
}) {
  return (
    <nav className="bottom-nav">
      {canAccessStudentMapTasks && shouldUseDesktopSplit && (
        <button
          className={`nav-btn ${tab === 'maptasks' ? 'active' : ''}`}
          onClick={() => onTabChange('maptasks')}
        >
          <span className="nav-icon">🗺️</span>
          {tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}
          {studentActiveAssignedTasksCount > 0 && ` (${studentActiveAssignedTasksCount})`}
        </button>
      )}
      {canAccessStudentMapTasks && (
        <button
          className={`nav-btn ${tab === 'map' ? 'active' : ''}`}
          onClick={() => onTabChange('map')}
        >
          <span className="nav-icon">🗺️</span> Carte
        </button>
      )}
      {canAccessStudentMapTasks &&
        (mergeTasksTutoNav ? (
          <button
            className={`nav-btn ${tab === 'tasks' || tab === 'tuto' ? 'active' : ''}`}
            type="button"
            onClick={() => onTabChange('tasks')}
          >
            <span className="nav-icon">✅</span>
            Tâches&tuto
            {studentActiveAssignedTasksCount > 0 && ` (${studentActiveAssignedTasksCount})`}
          </button>
        ) : (
          <button
            className={`nav-btn ${tab === 'tasks' ? 'active' : ''}`}
            type="button"
            onClick={() => onTabChange('tasks')}
          >
            <span className="nav-icon">✅</span>
            {tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}
            {studentActiveAssignedTasksCount > 0 && ` (${studentActiveAssignedTasksCount})`}
          </button>
        ))}
      <button
        className={`nav-btn ${tab === 'plants' ? 'active' : ''}`}
        onClick={() => onTabChange('plants')}
      >
        <span className="nav-icon">🌱</span> Biodiversité
      </button>
      <button
        className={`nav-btn ${tab === 'quiz' ? 'active' : ''}`}
        type="button"
        onClick={() => onTabChange('quiz')}
      >
        <span className="nav-icon">❓</span> Quiz
      </button>
      <button
        className={`nav-btn ${tab === 'glossary' ? 'active' : ''}`}
        type="button"
        onClick={() => onTabChange('glossary')}
      >
        <span className="nav-icon">📖</span> Glossaire
      </button>
      {tutorialsModuleEnabled && !mergeTasksTutoNav && (
        <button
          className={`nav-btn ${tab === 'tuto' ? 'active' : ''}`}
          type="button"
          onClick={() => onTabChange('tuto')}
        >
          <span className="nav-icon">📘</span> Tuto
        </button>
      )}
      {canViewGeneralStats && (
        <button
          className={`nav-btn ${tab === 'stats' ? 'active' : ''}`}
          onClick={() => onTabChange('stats')}
        >
          <span className="nav-icon">📊</span> Stats
        </button>
      )}
      {observationsEnabled && (
        <button
          className={`nav-btn ${tab === 'notebook' ? 'active' : ''}`}
          onClick={() => onTabChange('notebook')}
        >
          <span className="nav-icon">📓</span> Carnet
        </button>
      )}
      {visitEnabled && (
        <button
          className={`nav-btn ${tab === 'visit' ? 'active' : ''}`}
          onClick={() => onTabChange('visit')}
        >
          <span className="nav-icon">🧭</span> Visite
        </button>
      )}
      {canAccessForum && (
        <button
          className={`nav-btn ${tab === 'forum' ? 'active' : ''}`}
          onClick={() => onTabChange('forum')}
        >
          <span className="nav-icon">💬</span> Forum
        </button>
      )}
      <button
        className={`nav-btn ${tab === 'about' ? 'active' : ''}`}
        onClick={() => onTabChange('about')}
      >
        <span className="nav-icon">ℹ️</span> À propos
      </button>
    </nav>
  );
}
