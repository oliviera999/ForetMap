import React from 'react';

/**
 * Barre d'onglets haute du chemin n3boss — extraite de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'onglet actif, les permissions
 * et les libellés dérivés restent calculés dans `App` (aucun état déplacé).
 * `hasPermission` / `hasPermissionInRole` sont les callbacks mémoïsés d'App
 * (volontairement en props, cf. note O5 sur la vue élève).
 *
 * Accessibilité : l'onglet actif porte `aria-current="page"` (sinon l'état actif
 * n'était signalé que par la classe CSS).
 */
function TopTab({ id, tab, onTabChange, children }) {
  const isActive = tab === id;
  return (
    <button
      className={`top-tab ${isActive ? 'active' : ''}`}
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onTabChange(id)}
    >
      {children}
    </button>
  );
}

export function TeacherTopTabs({
  tab,
  onTabChange,
  shouldUseDesktopSplit,
  mapTasksSplitLabel,
  tasksTabLabel,
  teacherPendingValidationCount,
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
        <TopTab id="maptasks" tab={tab} onTabChange={onTabChange}>
          {mapTasksSplitLabel}
          {pendingSuffix}
        </TopTab>
      )}
      <TopTab id="map" tab={tab} onTabChange={onTabChange}>
        🗺️ Carte & Zones
      </TopTab>
      <TopTab id="tasks" tab={tab} onTabChange={onTabChange}>
        {tasksTabLabel}
        {pendingSuffix}
      </TopTab>
      <TopTab id="plants" tab={tab} onTabChange={onTabChange}>
        🌱 Biodiversité
      </TopTab>
      <TopTab id="quiz" tab={tab} onTabChange={onTabChange}>
        ❓ Quiz
      </TopTab>
      {/* Le glossaire est rendu pour les deux branches par `PedagoTabs`, mais seule la
          barre élève l'exposait : côté prof, l'onglet n'était atteignable qu'en cliquant
          un terme auto-lié (`openPedagoGlossaryTerm`). */}
      <TopTab id="glossary" tab={tab} onTabChange={onTabChange}>
        📖 Glossaire
      </TopTab>
      <TopTab id="foodweb" tab={tab} onTabChange={onTabChange}>
        🕸️ Réseau trophique
      </TopTab>
      {tutorialsModuleEnabled && (
        <TopTab id="tuto" tab={tab} onTabChange={onTabChange}>
          📘 Tuto
        </TopTab>
      )}
      {canAccessForum && (
        <TopTab id="forum" tab={tab} onTabChange={onTabChange}>
          💬 Forum
        </TopTab>
      )}
      {statsEnabled && (
        <TopTab id="stats" tab={tab} onTabChange={onTabChange}>
          📊 Stats
        </TopTab>
      )}
      {visitEnabled && (
        <TopTab id="visit" tab={tab} onTabChange={onTabChange}>
          🧭 Visite
        </TopTab>
      )}
      {visitEnabled && (
        <TopTab id="mascot_packs" tab={tab} onTabChange={onTabChange}>
          🎨 Packs mascotte
        </TopTab>
      )}
      <TopTab id="media_library" tab={tab} onTabChange={onTabChange}>
        🗂️ Médiathèque
      </TopTab>
      {(hasPermissionInRole('admin.roles.manage') ||
        hasPermissionInRole('admin.users.assign_roles') ||
        hasPermissionInRole('stats.export') ||
        hasPermissionInRole('students.import') ||
        hasPermissionInRole('students.delete') ||
        hasPermissionInRole('users.create')) && (
        <TopTab id="profiles" tab={tab} onTabChange={onTabChange}>
          🛡️ {isN3Affiliated ? 'n3boss & utilisateurs' : 'Profils & utilisateurs'}
        </TopTab>
      )}
      {/* `tours.manage` ouvre l'onglet sans `admin.settings.read` : un prof à qui l'on
          délègue la réécriture des visites guidées n'y voit que ce sous-onglet. */}
      {(hasPermissionInRole('admin.settings.read') || hasPermissionInRole('tours.manage')) && (
        <TopTab id="settings" tab={tab} onTabChange={onTabChange}>
          ⚙️ Paramètres
        </TopTab>
      )}
      {hasPermission('audit.read') && (
        <TopTab id="audit" tab={tab} onTabChange={onTabChange}>
          📜 Audit
        </TopTab>
      )}
      <TopTab id="about" tab={tab} onTabChange={onTabChange}>
        ℹ️ À propos
      </TopTab>
    </div>
  );
}
