import React from 'react';
import { ProfilesRoleList } from './ProfilesRoleList.jsx';
import { ProfilesPermissionRows } from './ProfilesPermissionRows.jsx';
import { ProfilesUserAssignmentList } from './ProfilesUserAssignmentList.jsx';
import { ProfilesRoleQuickConfig } from './ProfilesRoleQuickConfig.jsx';
import { ProfilesRoleProgressionConfig } from './ProfilesRoleProgressionConfig.jsx';

const cardStyle = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 };

/**
 * Section RBAC de l'admin des profils — extraite de `ProfilesAdminView` (O6). Grille profils +
 * permissions (liste des profils, config rapide emoji/PIN, progression n3beur, lignes de
 * permissions) puis carte « Attribution des profils ». Présentation pure : la garde
 * `canManageProfiles` et tout l'état/les appels API restent au parent.
 */
export function ProfilesRbacAdminSection({
  roles,
  catalog,
  users,
  loading,
  roleTerms,
  selectedRole,
  selectedRoleId,
  canEditRoleDefinition,
  isAdmin,
  isN3beurTier,
  progressionByTasksEnabled,
  tasksProposeEntry,
  roleEmoji,
  pin,
  roleMinDoneTasks,
  roleMaxConcurrentTasks,
  editUserLoadState,
  onCreateRole,
  onSelectRole,
  onReorderRole,
  onEditRoleDetails,
  onDuplicateRole,
  onRoleEmojiChange,
  onSaveEmoji,
  onPinChange,
  onSavePin,
  onToggleProgression,
  onMinDoneTasksChange,
  onSaveMinDoneThreshold,
  onTogglePermission,
  onTogglePermissionElevation,
  onSetForumParticipate,
  onSetContextCommentParticipate,
  onMaxConcurrentChange,
  onSaveMaxConcurrent,
  onAssignRole,
  onOpenEditUser,
}) {
  return (
    <>
      <div className="profiles-admin-grid">
        <div style={cardStyle}>
          <ProfilesRoleList
            roles={roles}
            loading={loading}
            selectedRoleId={selectedRoleId}
            canEditRoleDefinition={canEditRoleDefinition}
            onCreate={onCreateRole}
            onSelect={onSelectRole}
            onReorder={onReorderRole}
            onEditDetails={onEditRoleDetails}
            onDuplicate={onDuplicateRole}
          />
          {selectedRole && (
            <ProfilesRoleQuickConfig
              role={selectedRole}
              roleEmoji={roleEmoji}
              onRoleEmojiChange={onRoleEmojiChange}
              onSaveEmoji={onSaveEmoji}
              pin={pin}
              onPinChange={onPinChange}
              onSavePin={onSavePin}
              loading={loading}
              roleTerms={roleTerms}
            />
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Permissions</h3>
          {!selectedRole && <p style={{ margin: 0 }}>Choisis un profil dans la liste.</p>}
          {selectedRole && (
            <>
              <ProfilesRoleProgressionConfig
                role={selectedRole}
                loading={loading}
                roleTerms={roleTerms}
                isTier={isN3beurTier}
                canEditRoleDefinition={canEditRoleDefinition}
                progressionEnabled={progressionByTasksEnabled}
                onToggleProgression={onToggleProgression}
                minDoneTasks={roleMinDoneTasks}
                onMinDoneTasksChange={onMinDoneTasksChange}
                onSaveMinDoneThreshold={onSaveMinDoneThreshold}
                proposeEntry={tasksProposeEntry}
                onTogglePermission={onTogglePermission}
                onTogglePermissionElevation={onTogglePermissionElevation}
                onSetForumParticipate={onSetForumParticipate}
                onSetContextCommentParticipate={onSetContextCommentParticipate}
                maxConcurrentTasks={roleMaxConcurrentTasks}
                onMaxConcurrentChange={onMaxConcurrentChange}
                onSaveMaxConcurrent={onSaveMaxConcurrent}
              />
              <ProfilesPermissionRows
                catalog={catalog}
                rolePermissions={selectedRole.permissions}
                loading={loading}
                hideTasksPropose={isN3beurTier}
                onToggle={onTogglePermission}
                onToggleElevation={onTogglePermissionElevation}
              />
            </>
          )}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Attribution des profils</h3>
        <p style={{ margin: '0 0 10px', fontSize: '.78rem', color: '#64748b', lineHeight: 1.45 }}>
          Choisir le profil principal définit notamment forum et commentaires contextuels (réglés par profil dans la colonne de gauche, section Permissions). L’attribution peut exiger une session élevée (PIN) selon les droits du compte administrateur. Utilisez « Modifier » pour changer prénom, nom, pseudo, email, description, affiliation ou mot de passe.
        </p>
        <ProfilesUserAssignmentList
          users={users}
          roles={roles}
          loading={loading}
          editUserLoadState={editUserLoadState}
          isAdmin={isAdmin}
          onAssignRole={onAssignRole}
          onOpenEditUser={onOpenEditUser}
        />
      </div>
    </>
  );
}
