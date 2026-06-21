import React from 'react';

/**
 * Barre d'onglets haute du chemin n3boss — extraite de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'onglet actif, les permissions
 * et les libellés dérivés restent calculés dans `App` (aucun état déplacé).
 * `hasPermission` / `hasPermissionInRole` sont les callbacks mémoïsés d'App
 * (volontairement en props, cf. note O5 sur la vue élève).
 */
export function TeacherTopTabs({
  tab,
  onTabChange,
  shouldUseDesktopSplit,
  mapTasksSplitLabel,
  tasksTabLabel,
  teacherPendingValidationCount,
  mergeTasksTutoNav,
  tutorialsModuleEnabled,
  statsEnabled,
  visitEnabled,
  canAccessForum,
  isN3Affiliated,
  hasPermission,
  hasPermissionInRole,
}) {
  const pendingSuffix =
    teacherPendingValidationCount > 0 ? ` (${teacherPendingValidationCount} à valider)` : '';
  return (
    <div className="top-tabs app-tabs-surface">
      {shouldUseDesktopSplit && (
        <button
          className={`top-tab ${tab === 'maptasks' ? 'active' : ''}`}
          onClick={() => onTabChange('maptasks')}
        >
          {mapTasksSplitLabel}
          {pendingSuffix}
        </button>
      )}
      <button
        className={`top-tab ${tab === 'map' ? 'active' : ''}`}
        onClick={() => onTabChange('map')}
      >
        🗺️ Carte & Zones
      </button>
      <button
        className={`top-tab ${tab === 'tasks' || (mergeTasksTutoNav && tab === 'tuto') ? 'active' : ''}`}
        onClick={() => onTabChange('tasks')}
      >
        {tasksTabLabel}
        {pendingSuffix}
      </button>
      <button
        className={`top-tab ${tab === 'plants' ? 'active' : ''}`}
        onClick={() => onTabChange('plants')}
      >
        🌱 Biodiversité
      </button>
      <button
        className={`top-tab ${tab === 'quiz' ? 'active' : ''}`}
        onClick={() => onTabChange('quiz')}
      >
        ❓ Quiz
      </button>
      <button
        className={`top-tab ${tab === 'foodweb' ? 'active' : ''}`}
        onClick={() => onTabChange('foodweb')}
      >
        🕸️ Réseau trophique
      </button>
      {tutorialsModuleEnabled && !mergeTasksTutoNav && (
        <button
          className={`top-tab ${tab === 'tuto' ? 'active' : ''}`}
          onClick={() => onTabChange('tuto')}
        >
          📘 Tuto
        </button>
      )}
      {canAccessForum && (
        <button
          className={`top-tab ${tab === 'forum' ? 'active' : ''}`}
          onClick={() => onTabChange('forum')}
        >
          💬 Forum
        </button>
      )}
      {statsEnabled && (
        <button
          className={`top-tab ${tab === 'stats' ? 'active' : ''}`}
          onClick={() => onTabChange('stats')}
        >
          📊 Stats
        </button>
      )}
      {visitEnabled && (
        <button
          className={`top-tab ${tab === 'visit' ? 'active' : ''}`}
          onClick={() => onTabChange('visit')}
        >
          🧭 Visite
        </button>
      )}
      {visitEnabled && (
        <button
          className={`top-tab ${tab === 'mascot_packs' ? 'active' : ''}`}
          onClick={() => onTabChange('mascot_packs')}
        >
          🎨 Packs mascotte
        </button>
      )}
      <button
        className={`top-tab ${tab === 'media_library' ? 'active' : ''}`}
        onClick={() => onTabChange('media_library')}
      >
        🗂️ Médiathèque
      </button>
      {(hasPermissionInRole('admin.roles.manage') ||
        hasPermissionInRole('admin.users.assign_roles') ||
        hasPermissionInRole('stats.export') ||
        hasPermissionInRole('students.import') ||
        hasPermissionInRole('students.delete') ||
        hasPermissionInRole('users.create')) && (
        <button
          className={`top-tab ${tab === 'profiles' ? 'active' : ''}`}
          onClick={() => onTabChange('profiles')}
        >
          🛡️ {isN3Affiliated ? 'n3boss & utilisateurs' : 'Profils & utilisateurs'}
        </button>
      )}
      {hasPermissionInRole('admin.settings.read') && (
        <button
          className={`top-tab ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          ⚙️ Paramètres
        </button>
      )}
      {hasPermission('audit.read') && (
        <button
          className={`top-tab ${tab === 'audit' ? 'active' : ''}`}
          onClick={() => onTabChange('audit')}
        >
          📜 Audit
        </button>
      )}
      <button
        className={`top-tab ${tab === 'about' ? 'active' : ''}`}
        onClick={() => onTabChange('about')}
      >
        ℹ️ À propos
      </button>
    </div>
  );
}
