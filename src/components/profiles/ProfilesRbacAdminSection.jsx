import { ProfilesRoleList } from './ProfilesRoleList.jsx';
import { ProfilesPermissionRows } from './ProfilesPermissionRows.jsx';
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
 * Section RBAC de l'admin des profils — grille profils + permissions uniquement.
 * L'attribution des comptes vit dans le sous-onglet Comptes (`ProfilesAccountsPanel`).
 */
export function ProfilesRbacAdminSection({
  roles,
  catalog,
  loading,
  roleTerms,
  selectedRole,
  selectedRoleId,
  canEditRoleDefinition,
  isN3beurTier,
  progressionByTasksEnabled,
  tasksProposeEntry,
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
  );
}
