import React from 'react';
import { ProfilesRoleList } from './ProfilesRoleList.jsx';
import { ProfilesPermissionRows } from './ProfilesPermissionRows.jsx';
import { ProfilesUserAssignmentList } from './ProfilesUserAssignmentList.jsx';
import { ProfilesRoleQuickConfig } from './ProfilesRoleQuickConfig.jsx';
import { ProfilesRoleProgressionConfig } from './ProfilesRoleProgressionConfig.jsx';
import { useRoleEditFields } from './useRoleEditFields.js';

const cardStyle = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
};

/**
 * Section RBAC de l'admin des profils — extraite de `ProfilesAdminView` (O6). Grille profils +
 * permissions (liste des profils, config rapide emoji, progression n3beur, lignes de
 * permissions) puis carte « Attribution des profils ». La section possède les champs d'édition
 * du profil sélectionné (`useRoleEditFields`) ; les enregistrements remontent au parent avec la
 * valeur en argument : `onEditRoleDetails(role, fields)`, `onSaveEmoji(emoji)`,
 * `onSaveMinDoneThreshold(value)`, `onSaveMaxConcurrent(value)`. La garde `canManageProfiles`
 * et les appels API restent au parent.
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
  editUserLoadState,
  onCreateRole,
  onSelectRole,
  onReorderRole,
  onEditRoleDetails,
  onDuplicateRole,
  onSaveEmoji,
  onToggleProgression,
  onSaveMinDoneThreshold,
  onTogglePermission,
  onSetForumParticipate,
  onSetContextCommentParticipate,
  onSaveMaxConcurrent,
  onAssignRole,
  onOpenEditUser,
}) {
  const {
    roleEmoji,
    setRoleEmoji,
    roleMinDoneTasks,
    setRoleMinDoneTasks,
    roleDisplayOrder,
    roleMaxConcurrentTasks,
    setRoleMaxConcurrentTasks,
  } = useRoleEditFields(selectedRole);

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
            onEditDetails={(role) =>
              onEditRoleDetails(role, { roleEmoji, roleMinDoneTasks, roleDisplayOrder })
            }
            onDuplicate={onDuplicateRole}
          />
          {selectedRole && (
            <ProfilesRoleQuickConfig
              role={selectedRole}
              roleEmoji={roleEmoji}
              onRoleEmojiChange={setRoleEmoji}
              onSaveEmoji={() => onSaveEmoji(roleEmoji)}
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
                onMinDoneTasksChange={setRoleMinDoneTasks}
                onSaveMinDoneThreshold={() => onSaveMinDoneThreshold(roleMinDoneTasks)}
                proposeEntry={tasksProposeEntry}
                onTogglePermission={onTogglePermission}
                onSetForumParticipate={onSetForumParticipate}
                onSetContextCommentParticipate={onSetContextCommentParticipate}
                maxConcurrentTasks={roleMaxConcurrentTasks}
                onMaxConcurrentChange={setRoleMaxConcurrentTasks}
                onSaveMaxConcurrent={() => onSaveMaxConcurrent(roleMaxConcurrentTasks)}
              />
              <ProfilesPermissionRows
                catalog={catalog}
                rolePermissions={selectedRole.permissions}
                loading={loading}
                hideTasksPropose={isN3beurTier}
                onToggle={onTogglePermission}
              />
            </>
          )}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Attribution des profils</h3>
        <p style={{ margin: '0 0 10px', fontSize: '.78rem', color: '#64748b', lineHeight: 1.45 }}>
          Choisir le profil principal définit notamment forum et commentaires contextuels (réglés
          par profil dans la colonne de gauche, section Permissions). Utilisez « Modifier » pour
          changer prénom, nom, pseudo, email, description, affiliation ou mot de passe.
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
