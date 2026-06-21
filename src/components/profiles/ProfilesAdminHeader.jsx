import React from 'react';
import { HelpPanel } from '../HelpPanel';

/**
 * En-tête de la vue « Profils & utilisateurs » (administration).
 * Extrait de profiles-views.jsx (O6) — présentationnel pur. DOM/classes/textes inchangés.
 *
 * Affiche le titre de section et, lorsque l'aide est activée, le panneau d'aide associé.
 */
function ProfilesAdminHeader({
  isHelpEnabled,
  helpProfiles,
  hasSeenSection,
  onMarkSeen,
  onOpen,
  onDismiss,
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <h2 className="section-title" style={{ marginBottom: 0 }}>
        🛡️ Profils & utilisateurs
      </h2>
      {isHelpEnabled && (
        <HelpPanel
          sectionId="profiles"
          title={helpProfiles.title}
          entries={helpProfiles.items}
          isTeacher
          isPulsing={!hasSeenSection('profiles')}
          onMarkSeen={onMarkSeen}
          onOpen={onOpen}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

export { ProfilesAdminHeader };
