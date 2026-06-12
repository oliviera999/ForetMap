import React, { useEffect, useMemo, useState } from 'react';
import { API, api, getAuthToken } from '../services/api';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { HELP_PANELS } from '../constants/help';
import { buildAffiliationSelectOptions } from '../utils/affiliationSelectOptions';
import { GroupsAdminView } from './groups-views.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import {
  pickUserField,
  mergeRbacUserRowsForEdit,
  isLikelyApiUserPayload,
  buildUserEditInitialFields,
  validateUserIdentityFields,
  buildUserEditPatchPayload,
} from '../utils/profilesUserFields.js';
import { UserEditModal } from './profiles/UserEditModal.jsx';
import { DeleteUserConfirmModal } from './profiles/DeleteUserConfirmModal.jsx';
import { CreateUserPanel } from './profiles/CreateUserPanel.jsx';
import { StudentImportPanel } from './profiles/StudentImportPanel.jsx';
import { StudentDeletePanel } from './profiles/StudentDeletePanel.jsx';
import { ProfilesRoleList } from './profiles/ProfilesRoleList.jsx';
import { ProfilesPermissionRows } from './profiles/ProfilesPermissionRows.jsx';
import { ProfilesUserAssignmentList } from './profiles/ProfilesUserAssignmentList.jsx';
import { ProfilesRoleQuickConfig } from './profiles/ProfilesRoleQuickConfig.jsx';
import { ProfilesRoleProgressionConfig } from './profiles/ProfilesRoleProgressionConfig.jsx';
import {
  isN3beurTierConfigurableProfile as isN3beurTierConfigurableRole,
  sortRolesForDisplay,
  deriveProfilesCapabilities,
  normalizeRoleEditFields,
  buildRoleReorderPatches,
  parseMaxConcurrentTasksLimit,
  parseMinDoneTasksThreshold,
} from '../utils/profilesRbacHelpers.js';
import {
  promptRoleDetailsPatch,
  promptNewRoleProfile,
  promptDuplicateRoleProfile,
} from '../utils/profilesRolePrompts.js';

function ProfilesAdminView({ onImpersonationApplied, maps = [] }) {
  const publicSettings = usePublicSettings();
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const affiliationOptions = useMemo(() => buildAffiliationSelectOptions(maps), [maps]);
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({
    publicSettings,
    isTeacher: true,
  });
  const helpProfiles = HELP_PANELS.profiles;
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [confirmStudent, setConfirmStudent] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [dryRunImport, setDryRunImport] = useState(false);
  const [authPerms, setAuthPerms] = useState([]);
  const [authElevated, setAuthElevated] = useState(false);
  const [authNativePrivileged, setAuthNativePrivileged] = useState(false);
  const [authRoleSlug, setAuthRoleSlug] = useState('');
  const [createRole, setCreateRole] = useState('eleve_novice');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPseudo, setCreatePseudo] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAffiliation, setCreateAffiliation] = useState('both');
  const [createLoading, setCreateLoading] = useState(false);
  const [roleEmoji, setRoleEmoji] = useState('');
  const [roleMinDoneTasks, setRoleMinDoneTasks] = useState('');
  const [roleDisplayOrder, setRoleDisplayOrder] = useState('');
  const [roleMaxConcurrentTasks, setRoleMaxConcurrentTasks] = useState('');
  const [progressionByTasksEnabled, setProgressionByTasksEnabled] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPseudo, setEditPseudo] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAffiliation, setEditAffiliation] = useState('both');
  const [editPassword, setEditPassword] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUserLoadState, setEditUserLoadState] = useState('idle');
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const affiliationOptionsForEdit = useMemo(() => {
    const base = affiliationOptions;
    if (!editAffiliation || base.some((o) => o.value === editAffiliation)) return base;
    return [...base, { value: editAffiliation, label: `${editAffiliation} (valeur en base)` }];
  }, [affiliationOptions, editAffiliation]);

  const load = async () => {
    setErr('');
    const auth = await api('/api/auth/me').catch(() => null);
    const perms = Array.isArray(auth?.auth?.permissions) ? auth.auth.permissions : [];
    const elevated = !!auth?.auth?.elevated;
    const nativePrivileged = !!auth?.auth?.nativePrivileged;
    const roleSlug = String(auth?.auth?.roleSlug || '').toLowerCase();
    setAuthPerms(perms);
    setAuthElevated(elevated);
    setAuthNativePrivileged(nativePrivileged);
    setAuthRoleSlug(roleSlug);

    const canManageProfiles = perms.includes('admin.roles.manage') || perms.includes('admin.users.assign_roles');
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
      setRoles(normalized.map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] })));
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

  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const selectedRole = useMemo(
    () => roles.find((r) => Number(r.id) === Number(selectedRoleId)) || null,
    [roles, selectedRoleId]
  );
  /** Paliers n3beur : slug eleve_* ou profil perso. avec rang strictement inférieur à 400 (n3boss) ; exclus admin, n3boss, visiteur. */
  const isN3beurTierConfigurableProfile = useMemo(
    () => isN3beurTierConfigurableRole(selectedRole),
    [selectedRole]
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
  } = deriveProfilesCapabilities({ authPerms, authElevated, authNativePrivileged, authRoleSlug });

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
    return students.filter((s) => `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase().includes(needle));
  }, [students, searchStudent]);

  useEffect(() => {
    const fields = normalizeRoleEditFields(selectedRole);
    setRoleEmoji(fields.emoji);
    setRoleMinDoneTasks(fields.minDoneTasks);
    setRoleDisplayOrder(fields.displayOrder);
    setRoleMaxConcurrentTasks(fields.maxConcurrentTasks);
  }, [selectedRole]);

  const saveRoleDetails = async (role) => {
    const result = promptRoleDetailsPatch(role, { roleEmoji, roleMinDoneTasks, roleDisplayOrder });
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
          : 'Montée de niveau automatique : désactivée. Les profils affichés restent ceux attribués manuellement.'
      );
    } catch (e) {
      setErr(e.message || 'Erreur lors de l’enregistrement du réglage');
    }
    setLoading(false);
  };

  const saveMaxConcurrentTasks = async () => {
    if (!selectedRole) return;
    const parsed = parseMaxConcurrentTasksLimit(roleMaxConcurrentTasks);
    if (parsed.error) {
      setErr(parsed.error);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', { max_concurrent_tasks: parsed.value });
      setMsg(parsed.message);
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement du plafond');
    }
    setLoading(false);
  };

  const saveStudentMinDoneThreshold = async () => {
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

  const saveProfileEmoji = async () => {
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
        ? [...current, { key: permissionKey, requires_elevation: false }]
        : current.filter((p) => p.key !== permissionKey);
      await api(`/api/rbac/profiles/${selectedRole.id}/permissions`, 'PUT', { permissions: next });
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur permissions');
    }
    setLoading(false);
  };

  const togglePermissionElevation = async (permissionKey, checked) => {
    if (!selectedRole) return;
    setLoading(true);
    setErr('');
    try {
      const current = selectedRole.permissions || [];
      const next = current.map((p) => (p.key === permissionKey ? { ...p, requires_elevation: checked } : p));
      await api(`/api/rbac/profiles/${selectedRole.id}/permissions`, 'PUT', { permissions: next });
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur permissions');
    }
    setLoading(false);
  };

  const savePin = async () => {
    if (!selectedRole) return;
    if (!/^\d{4,12}$/.test(pin.trim())) return setErr('PIN invalide (4 à 12 chiffres)');
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}/pin`, 'PUT', { pin: pin.trim() });
      setPin('');
      setMsg('PIN du profil mis à jour');
    } catch (e) {
      setErr(e.message || 'Erreur mise à jour PIN');
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
    setEditPassword('');
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
      const s = buildUserEditInitialFields(merged);
      setEditingUser(merged);
      setEditFirstName(s.firstName);
      setEditLastName(s.lastName);
      setEditPseudo(s.pseudo);
      setEditEmail(s.email);
      setEditDescription(s.description);
      setEditAffiliation(s.affiliation);
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
    setEditPassword('');
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

  const saveEditUser = async () => {
    if (!editingUser) return;
    const fieldError = validateUserIdentityFields({
      firstName: editFirstName,
      lastName: editLastName,
      pseudo: editPseudo,
      email: editEmail,
      description: editDescription,
    });
    if (fieldError) {
      setErr(fieldError);
      return;
    }
    setEditLoading(true);
    setErr('');
    try {
      const payload = buildUserEditPatchPayload({
        firstName: editFirstName,
        lastName: editLastName,
        pseudo: editPseudo,
        email: editEmail,
        description: editDescription,
        affiliation: editAffiliation,
        password: editPassword,
        isStudent: editingUser.user_type === 'student',
      });
      await api(
        `/api/rbac/users/${String(editingUser.user_type || '').toLowerCase()}/${encodeURIComponent(String(editingUser.id))}`,
        'PATCH',
        payload
      );
      setMsg(`Compte mis à jour : ${editFirstName.trim()} ${editLastName.trim()}`);
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
      await api(`/api/rbac/profiles/${roleId}`, 'PATCH', { forum_participate: forumParticipate ? 1 : 0 });
      setRoles((prev) => prev.map((r) => (
        Number(r.id) === Number(roleId) ? { ...r, forum_participate: forumParticipate ? 1 : 0 } : r
      )));
      setUsers((prev) => prev.map((u) => {
        if (u.user_type !== 'student' || Number(u.role_id) !== Number(roleId)) return u;
        return { ...u, forum_participate: forumParticipate };
      }));
      setMsg(forumParticipate ? 'Participation au forum activée pour ce profil.' : 'Forum en lecture seule pour ce profil.');
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
      setRoles((prev) => prev.map((r) => (
        Number(r.id) === Number(roleId) ? { ...r, context_comment_participate: contextCommentParticipate ? 1 : 0 } : r
      )));
      setUsers((prev) => prev.map((u) => {
        if (u.user_type !== 'student' || Number(u.role_id) !== Number(roleId)) return u;
        return { ...u, context_comment_participate: contextCommentParticipate };
      }));
      setMsg(contextCommentParticipate ? 'Commentaires contextuels autorisés pour ce profil.' : 'Commentaires contextuels en lecture seule pour ce profil.');
    } catch (e) {
      setErr(e.message || 'Erreur réglage commentaires');
    }
    setLoading(false);
  };

  const createUser = async () => {
    const fieldError = validateUserIdentityFields({
      firstName: createFirstName,
      lastName: createLastName,
      pseudo: createPseudo,
      email: createEmail,
      description: createDescription,
      password: createPassword,
      requirePassword: true,
    });
    if (fieldError) {
      setErr(fieldError);
      return;
    }
    if (createRole === 'admin' && !isAdmin) {
      setErr('Seul un admin peut créer un admin');
      return;
    }
    setCreateLoading(true);
    setErr('');
    try {
      const result = await api('/api/rbac/users', 'POST', {
        role_slug: createRole,
        first_name: createFirstName.trim(),
        last_name: createLastName.trim(),
        password: createPassword,
        pseudo: createPseudo.trim() || null,
        email: createEmail.trim() || null,
        description: createDescription.trim() || null,
        affiliation: createAffiliation,
      });
      setMsg(`Utilisateur créé : ${result.first_name} ${result.last_name} (${result.role_display_name || result.role_slug})`);
      setCreateFirstName('');
      setCreateLastName('');
      setCreatePassword('');
      setCreatePseudo('');
      setCreateEmail('');
      setCreateDescription('');
      setCreateAffiliation('both');
      if (!isAdmin && createRole === 'admin') setCreateRole('prof');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur création utilisateur');
    }
    setCreateLoading(false);
  };

  const downloadStudentsTemplate = async (format) => {
    try {
      const token = getAuthToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', 'Bearer ' + token);
      const res = await fetch(`${API}/api/students/import/template?format=${encodeURIComponent(format)}`, { headers });
      if (!res.ok) throw new Error('Téléchargement impossible');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'xlsx' ? 'foretmap-modele-n3beurs.xlsx' : 'foretmap-modele-n3beurs.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || 'Erreur lors du téléchargement du modèle');
    }
  };

  const importStudents = async () => {
    if (!importFile) {
      setErr('Choisissez un fichier CSV ou XLSX');
      return;
    }
    setImportLoading(true);
    setImportReport(null);
    setErr('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
        reader.readAsDataURL(importFile);
      });
      const result = await api('/api/students/import', 'POST', {
        fileName: importFile.name,
        fileDataBase64: base64,
        dryRun: dryRunImport,
      });
      setImportReport(result.report || null);
      if ((result.report?.totals?.created || 0) > 0) {
        setMsg(`${result.report.totals.created} ${roleTerms.studentSingular}(s) créé(s)`);
      } else if (dryRunImport) {
        setMsg('Simulation terminée');
      } else {
        setMsg('Import terminé');
      }
      await load();
    } catch (e) {
      setErr('Erreur import: ' + (e.message || 'inconnue'));
    }
    setImportLoading(false);
  };

  const exportStats = async () => {
    try {
      const token = getAuthToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', 'Bearer ' + token);
      const response = await fetch(`${API}/api/stats/export`, { headers });
      if (!response.ok) throw new Error('Export impossible');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `foretmap-stats-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>🛡️ Profils & utilisateurs</h2>
        {isHelpEnabled && (
          <HelpPanel
            sectionId="profiles"
            title={helpProfiles.title}
            entries={helpProfiles.items}
            isTeacher
            isPulsing={!hasSeenSection('profiles')}
            onMarkSeen={markSectionSeen}
            onOpen={trackPanelOpen}
            onDismiss={trackPanelDismiss}
          />
        )}
      </div>
      <p className="section-sub">Gestion des profils, des comptes et des opérations {roleTerms.studentPlural} (création, import, export, suppression).</p>
      {err && !(editModalOpen && editUserLoadState === 'ready') && (
        <div className="auth-error">⚠️ {err}</div>
      )}
      {msg && <div className="auth-success">{msg}</div>}

      <UserEditModal
        editModalOpen={editModalOpen}
        editUserLoadState={editUserLoadState}
        editingUser={editingUser}
        err={err}
        editFirstName={editFirstName}
        editLastName={editLastName}
        editPseudo={editPseudo}
        editEmail={editEmail}
        editDescription={editDescription}
        editAffiliation={editAffiliation}
        editPassword={editPassword}
        editLoading={editLoading}
        impersonateLoading={impersonateLoading}
        affiliationOptionsForEdit={affiliationOptionsForEdit}
        authPerms={authPerms}
        setEditFirstName={setEditFirstName}
        setEditLastName={setEditLastName}
        setEditPseudo={setEditPseudo}
        setEditEmail={setEditEmail}
        setEditDescription={setEditDescription}
        setEditAffiliation={setEditAffiliation}
        setEditPassword={setEditPassword}
        closeEditUser={closeEditUser}
        saveEditUser={saveEditUser}
        startImpersonation={startImpersonation}
      />

      <DeleteUserConfirmModal
        confirmStudent={confirmStudent}
        roleTerms={roleTerms}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmStudent(null)}
      />

      {canManageProfiles && (
        <>
          <div className="profiles-admin-grid">
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
              <ProfilesRoleList
                roles={sortedRoles}
                loading={loading}
                selectedRoleId={selectedRoleId}
                canEditRoleDefinition={canEditRoleDefinition}
                onCreate={createRoleProfile}
                onSelect={setSelectedRoleId}
                onReorder={reorderRole}
                onEditDetails={saveRoleDetails}
                onDuplicate={duplicateRoleProfile}
              />
              {selectedRole && (
                <ProfilesRoleQuickConfig
                  role={selectedRole}
                  roleEmoji={roleEmoji}
                  onRoleEmojiChange={setRoleEmoji}
                  onSaveEmoji={saveProfileEmoji}
                  pin={pin}
                  onPinChange={setPin}
                  onSavePin={savePin}
                  loading={loading}
                  roleTerms={roleTerms}
                />
              )}
            </div>

            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Permissions</h3>
              {!selectedRole && <p style={{ margin: 0 }}>Choisis un profil dans la liste.</p>}
              {selectedRole && (
                <>
                  <ProfilesRoleProgressionConfig
                    role={selectedRole}
                    loading={loading}
                    roleTerms={roleTerms}
                    isTier={isN3beurTierConfigurableProfile}
                    canEditRoleDefinition={canEditRoleDefinition}
                    progressionEnabled={progressionByTasksEnabled}
                    onToggleProgression={toggleProgressionByValidatedTasks}
                    minDoneTasks={roleMinDoneTasks}
                    onMinDoneTasksChange={setRoleMinDoneTasks}
                    onSaveMinDoneThreshold={saveStudentMinDoneThreshold}
                    proposeEntry={tasksProposeEntry}
                    onTogglePermission={togglePermission}
                    onTogglePermissionElevation={togglePermissionElevation}
                    onSetForumParticipate={setRoleForumParticipate}
                    onSetContextCommentParticipate={setRoleContextCommentParticipate}
                    maxConcurrentTasks={roleMaxConcurrentTasks}
                    onMaxConcurrentChange={setRoleMaxConcurrentTasks}
                    onSaveMaxConcurrent={saveMaxConcurrentTasks}
                  />
                  <ProfilesPermissionRows
                    catalog={catalog}
                    rolePermissions={selectedRole.permissions}
                    loading={loading}
                    hideTasksPropose={isN3beurTierConfigurableProfile}
                    onToggle={togglePermission}
                    onToggleElevation={togglePermissionElevation}
                  />
                </>
              )}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Attribution des profils</h3>
            <p style={{ margin: '0 0 10px', fontSize: '.78rem', color: '#64748b', lineHeight: 1.45 }}>
              Choisir le profil principal définit notamment forum et commentaires contextuels (réglés par profil dans la colonne de gauche, section Permissions). L’attribution peut exiger une session élevée (PIN) selon les droits du compte administrateur. Utilisez « Modifier » pour changer prénom, nom, pseudo, email, description, affiliation ou mot de passe.
            </p>
            <ProfilesUserAssignmentList
              users={users}
              roles={sortedRoles}
              loading={loading}
              editUserLoadState={editUserLoadState}
              isAdmin={isAdmin}
              onAssignRole={assignRole}
              onOpenEditUser={openEditUser}
            />
          </div>
        </>
      )}

      {canManageProfiles && <GroupsAdminView />}

      {canManageStudents && (
        <>
          <div className="export-row" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" disabled={!canExport} onClick={exportStats}>
              📥 Exporter CSV {canExport ? '' : '(PIN requis)'}
            </button>
          </div>

          <CreateUserPanel
            roleTerms={roleTerms}
            affiliationOptions={affiliationOptions}
            isAdmin={isAdmin}
            canCreateUsers={canCreateUsers}
            createRole={createRole}
            createFirstName={createFirstName}
            createLastName={createLastName}
            createPassword={createPassword}
            createPseudo={createPseudo}
            createEmail={createEmail}
            createDescription={createDescription}
            createAffiliation={createAffiliation}
            createLoading={createLoading}
            setCreateRole={setCreateRole}
            setCreateFirstName={setCreateFirstName}
            setCreateLastName={setCreateLastName}
            setCreatePassword={setCreatePassword}
            setCreatePseudo={setCreatePseudo}
            setCreateEmail={setCreateEmail}
            setCreateDescription={setCreateDescription}
            setCreateAffiliation={setCreateAffiliation}
            createUser={createUser}
          />

          <StudentImportPanel
            roleTerms={roleTerms}
            canImport={canImport}
            importFile={importFile}
            importLoading={importLoading}
            importReport={importReport}
            dryRunImport={dryRunImport}
            setImportFile={setImportFile}
            setImportReport={setImportReport}
            setDryRunImport={setDryRunImport}
            downloadStudentsTemplate={downloadStudentsTemplate}
            importStudents={importStudents}
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
          <p>Aucune permission disponible pour gérer les profils ou les {roleTerms.studentPlural}.</p>
        </div>
      )}
    </div>
  );
}

export { ProfilesAdminView };
