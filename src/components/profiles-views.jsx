import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { downloadApiFile } from '../utils/downloadApiFile.js';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { resolveHelpPanelSection } from '../utils/helpResolve';
import { buildAffiliationSelectOptions } from '../utils/affiliationSelectOptions';
import { GroupsAdminView } from './groups-views.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import {
  pickUserField,
  mergeRbacUserRowsForEdit,
  isLikelyApiUserPayload,
  validateUserIdentityFields,
  buildUserEditPatchPayload,
} from '../utils/profilesUserFields.js';
import { UserEditModal } from './profiles/UserEditModal.jsx';
import { DeleteUserConfirmModal } from './profiles/DeleteUserConfirmModal.jsx';
import { CreateUserPanel } from './profiles/CreateUserPanel.jsx';
import { StudentImportPanel } from './profiles/StudentImportPanel.jsx';
import { StudentDeletePanel } from './profiles/StudentDeletePanel.jsx';
import { ProfilesRbacAdminSection } from './profiles/ProfilesRbacAdminSection.jsx';
import { ProfilesAdminHeader } from './profiles/ProfilesAdminHeader.jsx';
import { ProfilesAdminFeedback } from './profiles/ProfilesAdminFeedback.jsx';
import { ProfilesStatsExportRow } from './profiles/ProfilesStatsExportRow.jsx';
import {
  isN3beurTierConfigurableProfile as isN3beurTierConfigurableRole,
  sortRolesForDisplay,
  deriveProfilesCapabilities,
  buildRoleReorderPatches,
  parseMaxConcurrentTasksLimit,
  parseMinDoneTasksThreshold,
} from '../utils/profilesRbacHelpers.js';
import {
  promptRoleDetailsPatch,
  promptNewRoleProfile,
  promptDuplicateRoleProfile,
} from '../utils/profilesRolePrompts.js';

function ProfilesAdminViewImpl({ onImpersonationApplied, maps = [] }) {
  const publicSettings = usePublicSettings();
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const affiliationOptions = useMemo(() => buildAffiliationSelectOptions(maps), [maps]);
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({
      publicSettings,
      isTeacher: true,
    });
  const helpProfiles = resolveHelpPanelSection('profiles', publicSettings);
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [confirmStudent, setConfirmStudent] = useState(null);
  const [authPerms, setAuthPerms] = useState([]);
  const [authRoleSlug, setAuthRoleSlug] = useState('');
  const [progressionByTasksEnabled, setProgressionByTasksEnabled] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUserLoadState, setEditUserLoadState] = useState('idle');
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  const load = async () => {
    setErr('');
    const auth = await api('/api/auth/me').catch(() => null);
    const perms = Array.isArray(auth?.auth?.permissions) ? auth.auth.permissions : [];
    const roleSlug = String(auth?.auth?.roleSlug || '').toLowerCase();
    setAuthPerms(perms);
    setAuthRoleSlug(roleSlug);

    const canManageProfiles =
      perms.includes('admin.roles.manage') || perms.includes('admin.users.assign_roles');
    const canLoadStudents = perms.includes('stats.read.all');

    if (canManageProfiles) {
      const [profilePayload, userRows] = await Promise.all([
        api('/api/rbac/profiles'),
        api('/api/rbac/users'),
      ]);
      const normalized = Array.isArray(profilePayload)
        ? profilePayload
        : Array.isArray(profilePayload?.roles)
          ? profilePayload.roles
          : [];
      if (profilePayload && typeof profilePayload === 'object' && !Array.isArray(profilePayload)) {
        setProgressionByTasksEnabled(profilePayload.progressionByValidatedTasksEnabled !== false);
      } else {
        setProgressionByTasksEnabled(true);
      }
      setRoles(
        normalized.map((r) => ({
          ...r,
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
        })),
      );
      setCatalog(normalized[0]?.catalog || []);
      setUsers(Array.isArray(userRows) ? userRows : []);
      setSelectedRoleId((prev) => prev ?? normalized[0]?.id ?? null);
    } else {
      setRoles([]);
      setCatalog([]);
      setUsers([]);
      setSelectedRoleId(null);
    }

    if (canLoadStudents) {
      const payload = await api('/api/stats/all');
      const rows = Array.isArray(payload) ? payload : (payload?.students ?? []);
      setStudents(Array.isArray(rows) ? rows : []);
    } else {
      setStudents([]);
    }
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  const selectedRole = useMemo(
    () => roles.find((r) => Number(r.id) === Number(selectedRoleId)) || null,
    [roles, selectedRoleId],
  );
  /** Paliers n3beur : slug eleve_* ou profil perso. avec rang strictement inférieur à 400 (n3boss) ; exclus admin, n3boss, visiteur. */
  const isN3beurTierConfigurableProfile = useMemo(
    () => isN3beurTierConfigurableRole(selectedRole),
    [selectedRole],
  );
  const tasksProposeEntry = useMemo(() => {
    if (!selectedRole) return null;
    return (selectedRole.permissions || []).find((p) => p.key === 'tasks.propose') || null;
  }, [selectedRole]);
  const {
    canManageProfiles,
    canEditRoleDefinition,
    canExport,
    canImport,
    canCreateUsers,
    canReadAllStats,
    canDuplicateStudents,
    isAdmin,
    canManageStudents,
    canDeleteUi,
  } = deriveProfilesCapabilities({ authPerms, authRoleSlug });

  /** Même tri que GET /api/rbac/profiles (affichage cohérent avec la progression n3beur côté serveur). */
  const sortedRoles = useMemo(() => sortRolesForDisplay(roles), [roles]);

  const reorderRole = async (roleId, direction) => {
    const patches = buildRoleReorderPatches(sortedRoles, roleId, direction);
    if (!patches) return;
    setLoading(true);
    setErr('');
    try {
      for (const { id, display_order } of patches) {
        await api(`/api/rbac/profiles/${id}`, 'PATCH', { display_order });
      }
      setMsg('Ordre des profils mis à jour');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur lors du changement d’ordre');
    }
    setLoading(false);
  };

  const filteredStudents = useMemo(() => {
    const needle = searchStudent.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((s) =>
      `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase().includes(needle),
    );
  }, [students, searchStudent]);

  /** `fields` : { roleEmoji, roleMinDoneTasks, roleDisplayOrder } saisis dans la section RBAC. */
  const saveRoleDetails = async (role, fields) => {
    const result = promptRoleDetailsPatch(role, fields);
    if (!result) return;
    if (result.error) {
      setErr(result.error);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${role.id}`, 'PATCH', result.payload);
      setMsg('Profil mis à jour');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur mise à jour du profil');
    }
    setLoading(false);
  };

  const toggleProgressionByValidatedTasks = async (enabled) => {
    setLoading(true);
    setErr('');
    try {
      await api('/api/rbac/progression-by-validated-tasks', 'PATCH', { enabled: !!enabled });
      setProgressionByTasksEnabled(!!enabled);
      setMsg(
        enabled
          ? 'Montée de niveau automatique selon les tâches validées : activée.'
          : 'Montée de niveau automatique : désactivée. Les profils affichés restent ceux attribués manuellement.',
      );
    } catch (e) {
      setErr(e.message || 'Erreur lors de l’enregistrement du réglage');
    }
    setLoading(false);
  };

  const saveMaxConcurrentTasks = async (roleMaxConcurrentTasks) => {
    if (!selectedRole) return;
    const parsed = parseMaxConcurrentTasksLimit(roleMaxConcurrentTasks);
    if (parsed.error) {
      setErr(parsed.error);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', {
        max_concurrent_tasks: parsed.value,
      });
      setMsg(parsed.message);
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement du plafond');
    }
    setLoading(false);
  };

  const saveStudentMinDoneThreshold = async (roleMinDoneTasks) => {
    /* Même règle que la garde historique admin/prof/visiteur + rang : seuls les paliers n3beur ont un seuil. */
    if (!selectedRole || !isN3beurTierConfigurableProfile) return;
    const parsed = parseMinDoneTasksThreshold(roleMinDoneTasks);
    if (parsed.error) {
      setErr(parsed.error);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', { min_done_tasks: parsed.value });
      setMsg('Nombre de tâches validées requis pour ce niveau enregistré');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement du seuil');
    }
    setLoading(false);
  };

  const saveProfileEmoji = async (roleEmoji) => {
    if (!selectedRole) return;
    const trimmed = String(roleEmoji || '').trim();
    const slug = String(selectedRole.slug || '');
    if (/^eleve_/i.test(slug) && !trimmed) {
      setErr(`Un profil ${roleTerms.studentSingular} doit avoir un emoji`);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', {
        emoji: trimmed || null,
      });
      setMsg('Emoji du profil enregistré');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement de l’emoji');
    }
    setLoading(false);
  };

  const createRoleProfile = async () => {
    const result = promptNewRoleProfile();
    if (!result) return;
    if (result.error) {
      setErr(result.error);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const created = await api('/api/rbac/profiles', 'POST', result.payload);
      setMsg('Profil créé');
      await load();
      if (created?.id != null) setSelectedRoleId(created.id);
    } catch (e) {
      setErr(e.message || 'Erreur création profil');
    }
    setLoading(false);
  };

  const duplicateRoleProfile = async (role) => {
    if (!role?.id) return;
    const result = promptDuplicateRoleProfile(role);
    if (!result) return;
    setLoading(true);
    setErr('');
    try {
      const created = await api(`/api/rbac/profiles/${role.id}/duplicate`, 'POST', result.payload);
      setMsg(`Profil dupliqué : ${created.display_name || result.payload.slug}`);
      await load();
      if (created?.id != null) setSelectedRoleId(created.id);
    } catch (e) {
      setErr(e.message || 'Erreur duplication du profil');
    }
    setLoading(false);
  };

  const togglePermission = async (permissionKey, checked) => {
    if (!selectedRole) return;
    setLoading(true);
    setErr('');
    try {
      const current = selectedRole.permissions || [];
      const next = checked
        ? [...current, { key: permissionKey }]
        : current.filter((p) => p.key !== permissionKey);
      await api(`/api/rbac/profiles/${selectedRole.id}/permissions`, 'PUT', { permissions: next });
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur permissions');
    }
    setLoading(false);
  };

  const assignRole = async (userType, userId, roleId) => {
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/users/${userType}/${userId}/role`, 'PUT', { role_id: roleId });
      setMsg('Profil utilisateur mis à jour');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur attribution');
    }
    setLoading(false);
  };

  const openEditUser = async (u) => {
    setErr('');
    setEditingUser(null);
    setEditModalOpen(true);
    setEditUserLoadState('loading');
    const ut = String(u.user_type ?? pickUserField(u, 'user_type', 'userType') ?? '').toLowerCase();
    const uid = encodeURIComponent(String(u.id ?? pickUserField(u, 'id') ?? ''));
    if (!ut || !uid || uid === 'undefined' || uid === 'null') {
      setEditModalOpen(false);
      setEditUserLoadState('idle');
      setErr('Données utilisateur incomplètes (type ou identifiant manquant).');
      return;
    }
    try {
      let detail = null;
      try {
        detail = await api(`/api/rbac/users/${ut}/${uid}`);
      } catch (fetchErr) {
        detail = null;
      }
      const merged = mergeRbacUserRowsForEdit(u, isLikelyApiUserPayload(detail) ? detail : null);
      if (!merged.id) {
        setEditModalOpen(false);
        setEditUserLoadState('idle');
        setErr('Impossible de charger la fiche utilisateur.');
        return;
      }
      merged.user_type = String(merged.user_type || ut).toLowerCase();
      if (!merged.user_type || !['student', 'teacher'].includes(merged.user_type)) {
        setEditModalOpen(false);
        setEditUserLoadState('idle');
        setErr('Type de compte inconnu — impossible d’ouvrir l’édition.');
        return;
      }
      /* Les champs du formulaire sont initialisés par la modale (montée avec `user`). */
      setEditingUser(merged);
      setEditUserLoadState('ready');
    } catch (e) {
      setEditModalOpen(false);
      setEditUserLoadState('idle');
      setErr(e.message || 'Impossible de charger le compte');
    }
  };

  const closeEditUser = () => {
    setEditModalOpen(false);
    setEditingUser(null);
    setEditUserLoadState('idle');
    setEditLoading(false);
  };

  const startImpersonation = async () => {
    if (!editingUser) return;
    setImpersonateLoading(true);
    setErr('');
    try {
      const ut = String(editingUser.user_type || '').toLowerCase();
      const uid = editingUser.id ?? pickUserField(editingUser, 'id');
      const data = await api('/api/auth/admin/impersonate', 'POST', {
        userType: ut,
        userId: uid,
      });
      if (!data?.authToken) {
        setErr('Réponse serveur invalide');
        return;
      }
      closeEditUser();
      if (typeof onImpersonationApplied === 'function') {
        onImpersonationApplied(data);
      } else {
        window.location.reload();
      }
    } catch (e) {
      setErr(e.message || 'Prise de contrôle impossible');
    } finally {
      setImpersonateLoading(false);
    }
  };

  /** `fields` : champs saisis dans la modale — { firstName, lastName, pseudo, email, description, affiliation, password }. */
  const saveEditUser = async (fields) => {
    if (!editingUser) return;
    const { firstName, lastName, pseudo, email, description, affiliation, password } = fields;
    const fieldError = validateUserIdentityFields({
      firstName,
      lastName,
      pseudo,
      email,
      description,
    });
    if (fieldError) {
      setErr(fieldError);
      return;
    }
    setEditLoading(true);
    setErr('');
    try {
      const payload = buildUserEditPatchPayload({
        firstName,
        lastName,
        pseudo,
        email,
        description,
        affiliation,
        password,
        isStudent: editingUser.user_type === 'student',
      });
      await api(
        `/api/rbac/users/${String(editingUser.user_type || '').toLowerCase()}/${encodeURIComponent(String(editingUser.id))}`,
        'PATCH',
        payload,
      );
      setMsg(`Compte mis à jour : ${firstName.trim()} ${lastName.trim()}`);
      closeEditUser();
      try {
        await load();
      } catch (loadErr) {
        setErr(loadErr?.message || 'Liste non rafraîchie — rechargez la page si besoin.');
      }
    } catch (e) {
      setErr(e.message || 'Erreur lors de la mise à jour du compte');
    }
    setEditLoading(false);
  };

  const setRoleForumParticipate = async (roleId, forumParticipate) => {
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${roleId}`, 'PATCH', {
        forum_participate: forumParticipate ? 1 : 0,
      });
      setRoles((prev) =>
        prev.map((r) =>
          Number(r.id) === Number(roleId)
            ? { ...r, forum_participate: forumParticipate ? 1 : 0 }
            : r,
        ),
      );
      setUsers((prev) =>
        prev.map((u) => {
          if (u.user_type !== 'student' || Number(u.role_id) !== Number(roleId)) return u;
          return { ...u, forum_participate: forumParticipate };
        }),
      );
      setMsg(
        forumParticipate
          ? 'Participation au forum activée pour ce profil.'
          : 'Forum en lecture seule pour ce profil.',
      );
    } catch (e) {
      setErr(e.message || 'Erreur réglage forum');
    }
    setLoading(false);
  };

  const setRoleContextCommentParticipate = async (roleId, contextCommentParticipate) => {
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${roleId}`, 'PATCH', {
        context_comment_participate: contextCommentParticipate ? 1 : 0,
      });
      setRoles((prev) =>
        prev.map((r) =>
          Number(r.id) === Number(roleId)
            ? { ...r, context_comment_participate: contextCommentParticipate ? 1 : 0 }
            : r,
        ),
      );
      setUsers((prev) =>
        prev.map((u) => {
          if (u.user_type !== 'student' || Number(u.role_id) !== Number(roleId)) return u;
          return { ...u, context_comment_participate: contextCommentParticipate };
        }),
      );
      setMsg(
        contextCommentParticipate
          ? 'Commentaires contextuels autorisés pour ce profil.'
          : 'Commentaires contextuels en lecture seule pour ce profil.',
      );
    } catch (e) {
      setErr(e.message || 'Erreur réglage commentaires');
    }
    setLoading(false);
  };

  const exportStats = async () => {
    try {
      await downloadApiFile(
        '/api/stats/export',
        `foretmap-stats-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (e) {
      setErr(e.message || 'Erreur lors de l’export');
    }
  };

  const confirmDelete = async () => {
    if (!confirmStudent) return;
    const target = confirmStudent;
    setConfirmStudent(null);
    setErr('');
    try {
      await api(`/api/students/${target.id}`, 'DELETE');
      setMsg(`${target.first_name} ${target.last_name} supprimé`);
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur suppression');
    }
  };

  const duplicateStudent = async (studentRow) => {
    if (!studentRow?.id) return;
    setErr('');
    try {
      await api(`/api/students/${studentRow.id}/duplicate`, 'POST', {});
      setMsg(`${studentRow.first_name} ${studentRow.last_name} dupliqué`);
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur duplication');
    }
  };

  return (
    <div className="fade-in profiles-admin">
      <ProfilesAdminHeader
        isHelpEnabled={isHelpEnabled}
        helpProfiles={helpProfiles}
        hasSeenSection={hasSeenSection}
        onMarkSeen={markSectionSeen}
        onOpen={trackPanelOpen}
        onDismiss={trackPanelDismiss}
      />
      <p className="section-sub">
        Gestion des profils, des comptes et des opérations {roleTerms.studentPlural} (création,
        import, export, suppression).
      </p>
      <ProfilesAdminFeedback
        err={err}
        msg={msg}
        editModalOpen={editModalOpen}
        editUserLoadState={editUserLoadState}
      />

      {/* Montée/démontée à chaque ouverture (clé par utilisateur) : les champs de la modale
          s'initialisent paresseusement depuis `user` au montage. */}
      {editModalOpen && (
        <UserEditModal
          key={editingUser ? `${editingUser.user_type}:${editingUser.id}` : 'loading'}
          user={editingUser}
          loadState={editUserLoadState}
          err={err}
          affiliationOptions={affiliationOptions}
          authPerms={authPerms}
          saving={editLoading}
          impersonateLoading={impersonateLoading}
          onClose={closeEditUser}
          onSave={saveEditUser}
          onImpersonate={startImpersonation}
        />
      )}

      <DeleteUserConfirmModal
        confirmStudent={confirmStudent}
        roleTerms={roleTerms}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmStudent(null)}
      />

      {canManageProfiles && (
        <ProfilesRbacAdminSection
          roles={sortedRoles}
          catalog={catalog}
          users={users}
          loading={loading}
          roleTerms={roleTerms}
          selectedRole={selectedRole}
          selectedRoleId={selectedRoleId}
          canEditRoleDefinition={canEditRoleDefinition}
          isAdmin={isAdmin}
          isN3beurTier={isN3beurTierConfigurableProfile}
          progressionByTasksEnabled={progressionByTasksEnabled}
          tasksProposeEntry={tasksProposeEntry}
          editUserLoadState={editUserLoadState}
          onCreateRole={createRoleProfile}
          onSelectRole={setSelectedRoleId}
          onReorderRole={reorderRole}
          onEditRoleDetails={saveRoleDetails}
          onDuplicateRole={duplicateRoleProfile}
          onSaveEmoji={saveProfileEmoji}
          onToggleProgression={toggleProgressionByValidatedTasks}
          onSaveMinDoneThreshold={saveStudentMinDoneThreshold}
          onTogglePermission={togglePermission}
          onSetForumParticipate={setRoleForumParticipate}
          onSetContextCommentParticipate={setRoleContextCommentParticipate}
          onSaveMaxConcurrent={saveMaxConcurrentTasks}
          onAssignRole={assignRole}
          onOpenEditUser={openEditUser}
        />
      )}

      {canManageProfiles && <GroupsAdminView />}

      {canManageStudents && (
        <>
          <ProfilesStatsExportRow canExport={canExport} onExport={exportStats} />

          <CreateUserPanel
            roleTerms={roleTerms}
            affiliationOptions={affiliationOptions}
            isAdmin={isAdmin}
            canCreateUsers={canCreateUsers}
            setErr={setErr}
            setMsg={setMsg}
            onCreated={load}
          />

          <StudentImportPanel
            roleTerms={roleTerms}
            canImport={canImport}
            setErr={setErr}
            setMsg={setMsg}
            onImported={load}
          />

          {canReadAllStats && (
            <StudentDeletePanel
              roleTerms={roleTerms}
              canDeleteUi={canDeleteUi}
              canDuplicateStudents={canDuplicateStudents}
              searchStudent={searchStudent}
              filteredStudents={filteredStudents}
              setSearchStudent={setSearchStudent}
              setConfirmStudent={setConfirmStudent}
              duplicateStudent={duplicateStudent}
            />
          )}
        </>
      )}

      {!canManageProfiles && !canManageStudents && (
        <div className="empty" style={{ marginTop: 12 }}>
          <p>
            Aucune permission disponible pour gérer les profils ou les {roleTerms.studentPlural}.
          </p>
        </div>
      )}
    </div>
  );
}

/** Mémoïsation (comparaison shallow par défaut) : évite le re-render de cette vue lourde
 *  à chaque tick du polling global d'App.jsx quand ses props ne changent pas. */
const ProfilesAdminView = React.memo(ProfilesAdminViewImpl);
ProfilesAdminView.displayName = 'ProfilesAdminView';

export { ProfilesAdminView };
