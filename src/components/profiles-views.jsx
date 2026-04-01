import React, { useEffect, useMemo, useState } from 'react';
import { API, api, getAuthToken } from '../services/api';
import { getRoleTerms } from '../utils/n3-terminology';

function ProfilesAdminView({ isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
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
      const rows = await api('/api/stats/all');
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
  const isN3beurTierConfigurableProfile = useMemo(() => {
    if (!selectedRole) return false;
    const slug = String(selectedRole.slug || '').trim().toLowerCase();
    if (slug === 'admin' || slug === 'prof' || slug === 'visiteur') return false;
    if (/^eleve_/i.test(String(selectedRole.slug || ''))) return true;
    const r = Number(selectedRole.rank);
    return Number.isFinite(r) && r < 400;
  }, [selectedRole]);
  const tasksProposeEntry = useMemo(() => {
    if (!selectedRole) return null;
    return (selectedRole.permissions || []).find((p) => p.key === 'tasks.propose') || null;
  }, [selectedRole]);
  const canManageProfiles = authPerms.includes('admin.roles.manage') || authPerms.includes('admin.users.assign_roles');
  const canEditRoleDefinition = authPerms.includes('admin.roles.manage');
  const effectiveElevated = authElevated || authNativePrivileged;
  const canExport = authPerms.includes('stats.export') && effectiveElevated;
  const canImport = authPerms.includes('students.import') && effectiveElevated;
  const canDelete = authPerms.includes('students.delete') && effectiveElevated;
  const canCreateUsers = authPerms.includes('users.create') && effectiveElevated;
  const canReadAllStats = authPerms.includes('stats.read.all');
  const isAdmin = authRoleSlug === 'admin';
  const canManageStudents = canExport || canImport || canDelete || canCreateUsers;
  const canDeleteUi = canDelete && canReadAllStats;

  /** Même tri que GET /api/rbac/profiles (affichage cohérent avec la progression n3beur côté serveur). */
  const sortedRoles = useMemo(() => {
    const copy = [...roles];
    copy.sort((a, b) => {
      const ao = Number(a.display_order) || 0;
      const bo = Number(b.display_order) || 0;
      if (ao !== bo) return ao - bo;
      const ar = Number(a.rank) || 0;
      const br = Number(b.rank) || 0;
      if (ar !== br) return br - ar;
      return Number(a.id) - Number(b.id);
    });
    return copy;
  }, [roles]);

  const reorderRole = async (roleId, direction) => {
    const idx = sortedRoles.findIndex((r) => Number(r.id) === Number(roleId));
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sortedRoles.length) return;
    const arr = [...sortedRoles];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    const nextOrders = arr.map((r, i) => ({ id: r.id, display_order: i }));
    setLoading(true);
    setErr('');
    try {
      for (const { id, display_order } of nextOrders) {
        if (id == null || display_order === undefined) continue;
        const prev = sortedRoles.find((x) => Number(x.id) === Number(id));
        if (Number(prev?.display_order) === display_order) continue;
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
    if (!selectedRole) {
      setRoleEmoji('');
      setRoleMinDoneTasks('');
      setRoleDisplayOrder('');
      setRoleMaxConcurrentTasks('');
      return;
    }
    setRoleEmoji(String(selectedRole.emoji || ''));
    setRoleMinDoneTasks(
      selectedRole.min_done_tasks == null || Number.isNaN(Number(selectedRole.min_done_tasks))
        ? ''
        : String(Math.max(0, Math.floor(Number(selectedRole.min_done_tasks))))
    );
    setRoleDisplayOrder(
      selectedRole.display_order == null || Number.isNaN(Number(selectedRole.display_order))
        ? '0'
        : String(Math.max(0, Math.floor(Number(selectedRole.display_order))))
    );
    setRoleMaxConcurrentTasks(
      selectedRole.max_concurrent_tasks == null || selectedRole.max_concurrent_tasks === ''
        ? ''
        : String(Math.max(0, Math.floor(Number(selectedRole.max_concurrent_tasks))))
    );
  }, [selectedRole]);

  const saveRoleDetails = async (role) => {
    const displayName = window.prompt('Nom du profil', role.display_name || '');
    if (!displayName || !displayName.trim()) return;
    const emojiInput = window.prompt('Emoji du profil', (roleEmoji || role.emoji || '').trim());
    if (emojiInput == null) return;
    const minDoneInput = window.prompt(
      'Niveau requis (nombre de tâches validées)',
      roleMinDoneTasks || (role.min_done_tasks == null ? '' : String(role.min_done_tasks))
    );
    if (minDoneInput == null) return;
    const displayOrderInput = window.prompt(
      "Ordre d'affichage (entier >= 0, plus petit = plus haut)",
      roleDisplayOrder || String(role.display_order ?? 0)
    );
    if (displayOrderInput == null) return;
    const parsedMinDone = minDoneInput.trim() === '' ? null : parseInt(minDoneInput, 10);
    const parsedDisplayOrder = parseInt(displayOrderInput, 10);
    if (minDoneInput.trim() !== '' && (!Number.isFinite(parsedMinDone) || parsedMinDone < 0)) {
      setErr('Niveau requis invalide (entier >= 0)');
      return;
    }
    if (!Number.isFinite(parsedDisplayOrder) || parsedDisplayOrder < 0) {
      setErr("Ordre d'affichage invalide (entier >= 0)");
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${role.id}`, 'PATCH', {
        display_name: displayName.trim(),
        rank: role.rank,
        emoji: emojiInput.trim() || null,
        min_done_tasks: parsedMinDone,
        display_order: parsedDisplayOrder,
      });
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
    const raw = String(roleMaxConcurrentTasks || '').trim();
    if (raw === '') {
      setLoading(true);
      setErr('');
      try {
        await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', { max_concurrent_tasks: null });
        setMsg('Plafond d’inscriptions : héritage du réglage global (Paramètres n3boss) enregistré');
        await load();
      } catch (e) {
        setErr(e.message || 'Erreur enregistrement du plafond');
      }
      setLoading(false);
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 99) {
      setErr('Plafond invalide : entier entre 0 et 99 (0 = pas de limite pour ce profil), ou champ vide pour hériter du réglage global');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', { max_concurrent_tasks: n });
      setMsg(
        n === 0
          ? 'Pas de limite d’inscriptions pour ce profil (0) : enregistré.'
          : `Plafond d’inscriptions simultanées : ${n} tâche(s) non validée(s) — enregistré.`
      );
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement du plafond');
    }
    setLoading(false);
  };

  const saveStudentMinDoneThreshold = async () => {
    if (!selectedRole) return;
    const s = String(selectedRole.slug || '').trim().toLowerCase();
    if (s === 'admin' || s === 'prof' || s === 'visiteur') return;
    if (!/^eleve_/i.test(String(selectedRole.slug || ''))) {
      const r = Number(selectedRole.rank);
      if (!Number.isFinite(r) || r >= 400) return;
    }
    const parsed = roleMinDoneTasks.trim() === '' ? NaN : parseInt(roleMinDoneTasks, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setErr('Seuil invalide : indiquez un entier ≥ 0');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${selectedRole.id}`, 'PATCH', { min_done_tasks: parsed });
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
    const slug = window.prompt(
      'Slug technique du profil (ex. eleve_mentor, n3boss_lycee). Réservés et interdits : admin, prof, visiteur, eleve_novice, eleve_avance, eleve_chevronne. Le nom affiché peut être « Admin » ou « n3boss » avec un autre slug.',
      ''
    );
    if (!slug || !slug.trim()) return;
    const displayName = window.prompt('Nom du profil', slug.trim());
    if (!displayName || !displayName.trim()) return;
    const emojiInput = window.prompt("Emoji du profil (obligatoire pour un profil n3beur)", '');
    if (emojiInput == null) return;
    const minDoneInput = window.prompt(
      'Niveau requis pour atteindre ce profil (nombre de tâches validées)',
      ''
    );
    if (minDoneInput == null) return;
    const displayOrderInput = window.prompt(
      "Ordre d'affichage (entier >= 0, plus petit = plus haut)",
      '100'
    );
    if (displayOrderInput == null) return;
    const normalizedSlug = slug.trim().toLowerCase();
    const parsedMinDone = minDoneInput.trim() === '' ? null : parseInt(minDoneInput, 10);
    const parsedDisplayOrder = parseInt(displayOrderInput, 10);
    if (normalizedSlug.startsWith('eleve_') && !emojiInput.trim()) {
      setErr('Un profil n3beur doit avoir un emoji');
      return;
    }
    if (normalizedSlug.startsWith('eleve_') && parsedMinDone == null) {
      setErr('Un profil n3beur doit avoir un niveau requis');
      return;
    }
    if (minDoneInput.trim() !== '' && (!Number.isFinite(parsedMinDone) || parsedMinDone < 0)) {
      setErr('Niveau requis invalide (entier >= 0)');
      return;
    }
    if (!Number.isFinite(parsedDisplayOrder) || parsedDisplayOrder < 0) {
      setErr("Ordre d'affichage invalide (entier >= 0)");
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const created = await api('/api/rbac/profiles', 'POST', {
        slug: normalizedSlug,
        display_name: displayName.trim(),
        rank: 150,
        emoji: emojiInput.trim() || null,
        min_done_tasks: parsedMinDone,
        display_order: parsedDisplayOrder,
      });
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
    const suggestedSlug = `${String(role.slug || 'profil').replace(/[^a-z0-9_]+/gi, '_')}_copie`;
    const slugInput = window.prompt(
      'Slug technique (unique). Ne pas utiliser : admin, prof, visiteur, eleve_novice, eleve_avance, eleve_chevronne — préférez ex. prof_copie_lycee. Le nom affiché est demandé ensuite.',
      suggestedSlug
    );
    if (!slugInput || !slugInput.trim()) return;
    const displayNameInput = window.prompt(
      'Nom affiché du nouveau profil',
      `${role.display_name || slugInput.trim()} (copie)`
    );
    if (!displayNameInput || !displayNameInput.trim()) return;
    const normalizedSlug = slugInput.trim().toLowerCase();
    setLoading(true);
    setErr('');
    try {
      const created = await api(`/api/rbac/profiles/${role.id}/duplicate`, 'POST', {
        slug: normalizedSlug,
        display_name: displayNameInput.trim(),
      });
      setMsg(`Profil dupliqué : ${created.display_name || normalizedSlug}`);
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
    if (!createFirstName.trim() || !createLastName.trim() || !createPassword) {
      setErr('Prénom, nom et mot de passe sont requis');
      return;
    }
    if (createPseudo.trim() && !/^[A-Za-z0-9_.-]{3,30}$/.test(createPseudo.trim())) {
      setErr('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
      return;
    }
    if (createEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createEmail.trim())) {
      setErr('Email invalide');
      return;
    }
    if (createDescription.trim().length > 300) {
      setErr('Description trop longue (max 300 caractères)');
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

  return (
    <div className="fade-in profiles-admin">
      <h2 className="section-title">🛡️ Profils & utilisateurs</h2>
      <p className="section-sub">Gestion des profils, des comptes et des opérations {roleTerms.studentPlural} (création, import, export, suppression).</p>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {msg && <div className="auth-success">{msg}</div>}

      {confirmStudent && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmStudent(null)}>
          <div className="log-modal fade-in" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>Supprimer le/la {roleTerms.studentSingular} ?</h3>
            <p style={{ fontSize: '.95rem', color: '#444', marginBottom: 6, lineHeight: 1.5 }}>
              <strong>{confirmStudent.first_name} {confirmStudent.last_name}</strong>
            </p>
            <p style={{ fontSize: '.85rem', color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
              Ses assignations de tâches seront également supprimées.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={confirmDelete}>Supprimer</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmStudent(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {canManageProfiles && (
        <>
          <div className="profiles-admin-grid">
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Profils</h3>
              <p style={{ margin: '0 0 10px', fontSize: '.8rem', color: '#6b7280', lineHeight: 1.45 }}>
                Utilisez ↑ ↓ pour définir l’ordre d’affichage (liste ci-dessous, menus d’attribution et progression n3beur alignés sur cet ordre).
              </p>
              <button className="btn btn-secondary btn-sm" onClick={createRoleProfile} disabled={loading} style={{ marginBottom: 10 }}>
                + Créer un profil
              </button>
              {sortedRoles.map((r, idx) => (
                <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ minHeight: 28, padding: '2px 8px', lineHeight: 1.1 }}
                      aria-label={`Monter « ${r.display_name} » dans la liste`}
                      title="Monter"
                      disabled={loading || idx === 0}
                      onClick={() => reorderRole(r.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ minHeight: 28, padding: '2px 8px', lineHeight: 1.1 }}
                      aria-label={`Descendre « ${r.display_name} » dans la liste`}
                      title="Descendre"
                      disabled={loading || idx === sortedRoles.length - 1}
                      onClick={() => reorderRole(r.id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                  <button className={`btn btn-sm ${Number(selectedRoleId) === Number(r.id) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedRoleId(r.id)}>
                    {(r.emoji ? `${r.emoji} ` : '') + r.display_name}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => saveRoleDetails(r)} disabled={loading}>Modifier</button>
                  {canEditRoleDefinition && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => duplicateRoleProfile(r)}
                      disabled={loading}
                      title="Copier permissions et réglages vers un nouveau profil (slug et nom distincts ; PIN non copié)"
                    >
                      Dupliquer
                    </button>
                  )}
                  <span style={{ fontSize: '.72rem', color: '#6b7280' }}>
                    ordre {Number.isFinite(Number(r.display_order)) ? Number(r.display_order) : 0}
                  </span>
                </div>
              ))}
              {selectedRole && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '.78rem', color: '#6b7280', marginBottom: 6 }}>
                    Progression: emoji {selectedRole.emoji || '—'} · niveau requis {selectedRole.min_done_tasks ?? '—'} · ordre {selectedRole.display_order ?? 0}
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="profile-emoji-input">Emoji du profil</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <input
                        id="profile-emoji-input"
                        type="text"
                        value={roleEmoji}
                        onChange={(e) => setRoleEmoji(e.target.value)}
                        maxLength={16}
                        disabled={loading}
                        placeholder="ex. 🌿"
                        autoComplete="off"
                        style={{
                          width: 120,
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          fontSize: '1.2rem',
                          lineHeight: 1.2,
                        }}
                        aria-label={`Emoji pour le profil ${selectedRole.display_name}`}
                      />
                      <span style={{ fontSize: '1.5rem', lineHeight: 1 }} title="Aperçu" aria-hidden>
                        {roleEmoji.trim() || '—'}
                      </span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={saveProfileEmoji} disabled={loading}>
                        Enregistrer l’emoji
                      </button>
                    </div>
                    <p style={{ fontSize: '.72rem', color: '#6b7280', margin: '6px 0 0', lineHeight: 1.4 }}>
                      {/^eleve_/i.test(String(selectedRole.slug || ''))
                        ? `Obligatoire pour un profil ${roleTerms.studentSingular} (max. 16 caractères).`
                        : 'Optionnel pour les autres profils (max. 16 caractères).'}
                    </p>
                  </div>
                  <div className="field">
                    <label>PIN du profil {selectedRole.display_name}</label>
                    <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Nouveau PIN" />
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={savePin} disabled={loading}>Enregistrer PIN</button>
                </div>
              )}
            </div>

            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Permissions</h3>
              {!selectedRole && <p style={{ margin: 0 }}>Sélectionnez un profil.</p>}
              {selectedRole && (
                <>
                  <div
                    className="profiles-admin-progression-block"
                    style={{
                      border: '1px solid #e0e7ff',
                      background: '#f8fafc',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>
                      Progression par tâches validées
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.84rem', cursor: loading ? 'default' : 'pointer', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={progressionByTasksEnabled}
                        onChange={(e) => toggleProgressionByValidatedTasks(e.target.checked)}
                        disabled={loading}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        Activer la montée de niveau automatique : le profil {roleTerms.studentSingular} suit le nombre de tâches validées selon les seuils définis pour chaque palier.
                      </span>
                    </label>
                    <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                      Si cette option est désactivée, aucun changement automatique de profil ne s’applique : utilisez la section « Attribution des profils » pour les niveaux.
                    </p>
                    {isN3beurTierConfigurableProfile && (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                        <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                          Seuil pour « {selectedRole.display_name} »
                        </div>
                        <label style={{ fontSize: '.76rem', color: '#64748b', display: 'block', marginBottom: 6 }}>
                          Nombre de tâches validées requises pour atteindre ce niveau (palier suivant = seuil supérieur ou égal).
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={roleMinDoneTasks}
                            onChange={(e) => setRoleMinDoneTasks(e.target.value)}
                            disabled={loading}
                            style={{ width: 110, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                            aria-label={`Tâches validées requises pour ${selectedRole.display_name}`}
                          />
                          <button type="button" className="btn btn-secondary btn-sm" onClick={saveStudentMinDoneThreshold} disabled={loading}>
                            Enregistrer le seuil
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {isN3beurTierConfigurableProfile && (
                      <div
                        className="profiles-admin-propose-block"
                        style={{
                          border: '1px solid #d8f3dc',
                          background: '#f1fcf4',
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1b4332', marginBottom: 8 }}>
                          Proposition de tâches
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.84rem', cursor: loading ? 'default' : 'pointer', marginBottom: 8 }}>
                          <input
                            type="checkbox"
                            checked={!!tasksProposeEntry}
                            onChange={(e) => togglePermission('tasks.propose', e.target.checked)}
                            disabled={loading}
                            style={{ marginTop: 3 }}
                          />
                          <span>
                            Autoriser les {roleTerms.studentPlural} de ce profil à proposer de nouvelles tâches (statut « proposée », validation par un {roleTerms.teacherShort}).
                          </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.8rem', color: '#374151', cursor: loading || !tasksProposeEntry ? 'default' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!tasksProposeEntry?.requires_elevation}
                            onChange={(e) => togglePermissionElevation('tasks.propose', e.target.checked)}
                            disabled={!tasksProposeEntry || loading}
                            style={{ marginTop: 2 }}
                          />
                          <span>Exiger le PIN du profil pour accéder à la proposition (élévation).</span>
                        </label>
                        <p style={{ fontSize: '.72rem', color: '#64748b', margin: '10px 0 0', lineHeight: 1.45 }}>
                          Correspond à la permission <code style={{ fontSize: '.7rem' }}>tasks.propose</code> (retirée de la liste ci-dessous pour éviter le doublon).
                        </p>
                      </div>
                  )}
                  {isN3beurTierConfigurableProfile && (
                    <div
                      style={{
                        border: '1px solid #e0e7ff',
                        background: '#f8fafc',
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>
                        Forum et commentaires (tâches, zones…)
                      </div>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.84rem', cursor: loading || !canEditRoleDefinition ? 'default' : 'pointer', marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={Number(selectedRole.forum_participate) !== 0}
                          onChange={(e) => setRoleForumParticipate(selectedRole.id, e.target.checked)}
                          disabled={loading || !canEditRoleDefinition}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          Permettre la <strong>participation au forum</strong> (publier, répondre, réagir, etc.) pour les {roleTerms.studentPlural} de ce profil ; décoché = lecture seule.
                        </span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.84rem', cursor: loading || !canEditRoleDefinition ? 'default' : 'pointer', marginBottom: 0 }}>
                        <input
                          type="checkbox"
                          checked={Number(selectedRole.context_comment_participate) !== 0}
                          onChange={(e) => setRoleContextCommentParticipate(selectedRole.id, e.target.checked)}
                          disabled={loading || !canEditRoleDefinition}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          Permettre les <strong>commentaires contextuels</strong> sur les tâches, projets et zones ; décoché = lecture seule sur ces fils (le forum reste régi par la case ci-dessus).
                        </span>
                      </label>
                      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '10px 0 0', lineHeight: 1.45 }}>
                        Réglages communs à tous les comptes ayant ce profil principal. Le profil visiteur reste sans accès forum / commentaires de contexte.
                      </p>
                    </div>
                  )}
                  {isN3beurTierConfigurableProfile && (
                    <div
                      style={{
                        border: '1px solid #fde68a',
                        background: '#fffbeb',
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                        Inscriptions simultanées aux tâches
                      </div>
                      <p style={{ fontSize: '.76rem', color: '#78350f', margin: '0 0 10px', lineHeight: 1.45 }}>
                        Nombre maximum de tâches <strong>non validées</strong> auxquelles un {roleTerms.studentSingular} peut s’inscrire en même temps (toutes cartes).
                        Une tâche <strong>validée</strong> par un {roleTerms.teacherShort} ne compte plus : le compteur se libère.
                        Champ vide = utiliser le plafond défini dans <strong>Paramètres n3boss</strong> (
                        <code style={{ fontSize: '.72rem' }}>tasks.student_max_active_assignments</code>
                        ). <strong>0</strong> = pas de limite pour ce profil (même si le réglage global est actif).
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          step={1}
                          value={roleMaxConcurrentTasks}
                          onChange={(e) => setRoleMaxConcurrentTasks(e.target.value)}
                          disabled={loading}
                          placeholder="Hériter du réglage global"
                          style={{ width: 200, padding: '6px 8px', borderRadius: 8, border: '1px solid #d97706' }}
                          aria-label={`Plafond d'inscriptions simultanées pour ${selectedRole.display_name}`}
                        />
                        <button type="button" className="btn btn-secondary btn-sm" onClick={saveMaxConcurrentTasks} disabled={loading}>
                          Enregistrer le plafond
                        </button>
                      </div>
                    </div>
                  )}
                  {catalog
                    .filter(
                      (perm) =>
                        !(isN3beurTierConfigurableProfile && perm.key === 'tasks.propose')
                    )
                    .map((perm) => {
                    const current = (selectedRole.permissions || []).find((p) => p.key === perm.key);
                    return (
                      <div className="profiles-admin-perm-row" key={perm.key}>
                        <div>
                          <div style={{ fontSize: '.86rem', fontWeight: 600 }}>{perm.label}</div>
                          <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{perm.key}</div>
                        </div>
                        <label style={{ fontSize: '.8rem' }}>
                          <input type="checkbox" checked={!!current} onChange={(e) => togglePermission(perm.key, e.target.checked)} disabled={loading} /> Actif
                        </label>
                        <label style={{ fontSize: '.8rem' }}>
                          <input type="checkbox" checked={!!current?.requires_elevation} onChange={(e) => togglePermissionElevation(perm.key, e.target.checked)} disabled={!current || loading} /> PIN
                        </label>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Attribution des profils</h3>
            <p style={{ margin: '0 0 10px', fontSize: '.78rem', color: '#64748b', lineHeight: 1.45 }}>
              Choisir le profil principal définit notamment forum et commentaires contextuels (réglés par profil dans la colonne de gauche, section Permissions). L’attribution peut exiger une session élevée (PIN) selon les droits du compte administrateur.
            </p>
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              {users.map((u) => (
                <div className="profiles-admin-user-row" key={`${u.user_type}-${u.id}`} style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <strong>{u.display_name}</strong> <span style={{ color: '#6b7280' }}>({u.user_type})</span>
                  </div>
                  <select value={u.role_id || ''} onChange={(e) => assignRole(u.user_type, u.id, parseInt(e.target.value, 10))} disabled={loading}>
                    <option value="">Aucun profil</option>
                    {sortedRoles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {canManageStudents && (
        <>
          <div className="export-row" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" disabled={!canExport} onClick={exportStats}>
              📥 Exporter CSV {canExport ? '' : '(PIN requis)'}
            </button>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12, opacity: canCreateUsers ? 1 : 0.65 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--forest)' }}>Création unitaire d&apos;utilisateur</h3>
            <p style={{ margin: '0 0 10px', fontSize: '.85rem', color: '#6b7280' }}>
              Créez un compte sans import. Action réservée aux sessions élevées (PIN).
            </p>
            <div className="profiles-admin-create-grid">
              <div className="field" style={{ margin: 0 }}>
                <label>Profil</label>
                <select value={createRole} onChange={(e) => setCreateRole(e.target.value)} disabled={!canCreateUsers || createLoading}>
                  <option value="eleve_novice">{roleTerms.studentSingular}</option>
                  <option value="prof">{roleTerms.teacherShort}</option>
                  {isAdmin && <option value="admin">Admin</option>}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Prénom</label>
                <input value={createFirstName} onChange={(e) => setCreateFirstName(e.target.value)} disabled={!canCreateUsers || createLoading} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Nom</label>
                <input value={createLastName} onChange={(e) => setCreateLastName(e.target.value)} disabled={!canCreateUsers || createLoading} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} disabled={!canCreateUsers || createLoading} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Pseudo (optionnel)</label>
                <input value={createPseudo} onChange={(e) => setCreatePseudo(e.target.value)} disabled={!canCreateUsers || createLoading} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Email (optionnel)</label>
                <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} disabled={!canCreateUsers || createLoading} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Description (optionnel)</label>
                <input value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} disabled={!canCreateUsers || createLoading} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Affiliation {roleTerms.studentSingular}</label>
                <select value={createAffiliation} onChange={(e) => setCreateAffiliation(e.target.value)} disabled={!canCreateUsers || createLoading || createRole !== 'eleve_novice'}>
                  <option value="both">N3 + Forêt comestible</option>
                  <option value="n3">N3 uniquement</option>
                  <option value="foret">Forêt comestible uniquement</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={createUser} disabled={!canCreateUsers || createLoading}>
                {createLoading ? 'Création…' : `Créer ${canCreateUsers ? '' : '(PIN requis)'}`}
              </button>
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12, opacity: canImport ? 1 : 0.65 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--forest)' }}>Import {roleTerms.studentPlural} (CSV / XLSX)</h3>
            <p style={{ margin: '0 0 10px', fontSize: '.85rem', color: '#6b7280' }}>
              Téléchargez un modèle vierge, complétez-le puis importez le fichier.
            </p>
            <p style={{ margin: '0 0 10px', fontSize: '.8rem', color: '#9a3412' }}>
              Le modèle contient une ligne d&apos;exemple: pensez à la remplacer ou la supprimer avant l&apos;import.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadStudentsTemplate('csv')}>
                📄 Modèle CSV
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadStudentsTemplate('xlsx')}>
                📗 Modèle XLSX
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportReport(null);
                }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.85rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={dryRunImport}
                  onChange={(e) => setDryRunImport(e.target.checked)}
                />
                Simulation (sans création)
              </label>
              <button className="btn btn-primary btn-sm" onClick={importStudents} disabled={importLoading || !canImport}>
                {importLoading ? 'Import…' : 'Importer'}
              </button>
            </div>
            {importFile && (
              <p style={{ margin: '8px 0 0', fontSize: '.8rem', color: '#6b7280' }}>
                Fichier sélectionné: <strong>{importFile.name}</strong>
              </p>
            )}
            {importReport && (
              <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '.85rem', color: '#1f2937', marginBottom: 4 }}>
                  Reçus: <strong>{importReport.totals?.received || 0}</strong> ·
                  Valides: <strong>{importReport.totals?.valid || 0}</strong> ·
                  Créés: <strong>{importReport.totals?.created || 0}</strong> ·
                  Déjà existants: <strong>{importReport.totals?.skipped_existing || 0}</strong> ·
                  Invalides: <strong>{importReport.totals?.skipped_invalid || 0}</strong>
                </div>
                {Array.isArray(importReport.errors) && importReport.errors.length > 0 && (
                  <div style={{ maxHeight: 120, overflow: 'auto', fontSize: '.8rem', color: '#991b1b' }}>
                    {importReport.errors.slice(0, 15).map((item, idx) => (
                      <div key={`${item.row}-${item.field}-${idx}`}>
                        Ligne {item.row} ({item.field}): {item.error}
                      </div>
                    ))}
                    {importReport.errors.length > 15 && (
                      <div>… {importReport.errors.length - 15} erreur(s) supplémentaire(s)</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {canReadAllStats && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12, opacity: canDeleteUi ? 1 : 0.65 }}>
            <h3 style={{ marginTop: 0 }}>Suppression de {roleTerms.studentPlural}</h3>
            <div className="field" style={{ marginBottom: 10 }}>
              <input
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                placeholder={`🔍 Rechercher un(e) ${roleTerms.studentSingular}...`}
                style={{ background: 'white' }}
              />
            </div>
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              {filteredStudents.length === 0 ? (
                <p style={{ margin: 0, color: '#6b7280' }}>
                  {searchStudent ? `Aucun(e) ${roleTerms.studentSingular} trouvé(e).` : `Aucun(e) ${roleTerms.studentSingular} disponible.`}
                </p>
              ) : (
                filteredStudents.map((s) => (
                  <div className="profiles-admin-delete-row" key={s.id}>
                    <div>
                      <strong>{s.first_name} {s.last_name}</strong>
                      <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                        {s.stats?.done || 0} validée(s) · {s.stats?.pending || 0} en cours
                      </div>
                    </div>
                    <button className="btn btn-danger btn-sm" disabled={!canDeleteUi} onClick={() => setConfirmStudent(s)}>
                      🗑️ Supprimer
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
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
