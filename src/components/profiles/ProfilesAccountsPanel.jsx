import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildUserGroupIdsFromUsers,
  filterProfilesUsers,
  hasActiveAccountsFilters,
  normalizePageSize,
  normalizeProfilesSort,
  paginateList,
  parseAccountsFilters,
  profilesUserKey,
  serializeAccountsFilters,
  sortProfilesUsers,
  DEFAULT_PROFILES_PAGE_SIZE,
  EMPTY_ACCOUNTS_FILTERS,
} from '../../utils/profilesUserListFilters.js';
import { isSensitiveRole } from '../../utils/profilesUserGroups.js';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../../shared/platform/browserStorage.js';
import { ProfilesUserAssignmentList } from './ProfilesUserAssignmentList.jsx';
import { AccountsFiltersToolbar } from './AccountsFiltersToolbar.jsx';
import { AccountsBulkBar } from './AccountsBulkBar.jsx';
import { ConfirmRoleChangeModal } from './ConfirmRoleChangeModal.jsx';
import { CreateUserPanel } from './CreateUserPanel.jsx';

const PAGE_SIZE_STORAGE_KEY = 'foretmap.profiles.pageSize';

const cardStyle = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
  marginTop: 12,
};

function readInitialFilters() {
  if (typeof window === 'undefined') return { ...EMPTY_ACCOUNTS_FILTERS };
  return parseAccountsFilters(window.location.search);
}

/**
 * Sous-onglet Comptes : liste unique des comptes (recherche, filtres, tri, pagination,
 * actions unitaires et groupées) et création unitaire.
 *
 * La seconde liste « Suppression de … », qui doublait celle-ci avec sa propre recherche, a été
 * fusionnée ici (P1 de l'audit UX) : Supprimer et Dupliquer sont des actions de ligne.
 */
export function ProfilesAccountsPanel({
  roles = [],
  users = [],
  loading = false,
  isAdmin = false,
  canCreateUsers = false,
  canCreateTeacherRoles = false,
  canManageProfiles = false,
  canManageGroups = false,
  groupOptions = [],
  canDeleteUi = false,
  canDuplicateStudents = false,
  roleTerms,
  affiliationOptions = [],
  setErr,
  setMsg,
  onCreated,
  onAssignRole,
  onBulkAssignRole,
  onBulkAddToGroup,
  onDeleteUser,
  onDuplicateUser,
  onOpenEditUser,
  onFilteredCountChange,
  onTotalCountChange,
}) {
  const [filters, setFilters] = useState(readInitialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    normalizePageSize(safeLocalStorageGetItem(PAGE_SIZE_STORAGE_KEY, DEFAULT_PROFILES_PAGE_SIZE)),
  );
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const [rowStatus, setRowStatus] = useState(() => new Map());
  const [pendingRoleChange, setPendingRoleChange] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const statusTimers = useRef(new Map());

  // P7 — les filtres vivent dans l'URL : un rechargement ne les perd plus, et une vue filtrée
  // se transmet par simple copie du lien.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const next = `${window.location.pathname}${serializeAccountsFilters(filters)}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', next);
    }
  }, [filters]);

  useEffect(() => {
    const timers = statusTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const userGroupIdsByUserId = useMemo(() => buildUserGroupIdsFromUsers(users), [users]);

  const filteredUsers = useMemo(() => {
    const matched = filterProfilesUsers(users, {
      query: filters.query,
      roleId: filters.roleId,
      userType: filters.userType,
      groupId: filters.groupId,
      userGroupIdsByUserId,
    });
    return sortProfilesUsers(matched, normalizeProfilesSort(filters.sort));
  }, [users, filters, userGroupIdsByUserId]);

  useEffect(() => {
    if (typeof onFilteredCountChange === 'function') onFilteredCountChange(filteredUsers.length);
  }, [filteredUsers.length, onFilteredCountChange]);

  useEffect(() => {
    if (typeof onTotalCountChange === 'function') onTotalCountChange(users.length);
  }, [users.length, onTotalCountChange]);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  const pageData = useMemo(
    () => paginateList(filteredUsers, page, pageSize),
    [filteredUsers, page, pageSize],
  );

  const changePageSize = (next) => {
    const size = normalizePageSize(next);
    setPageSize(size);
    safeLocalStorageSetItem(PAGE_SIZE_STORAGE_KEY, String(size));
  };

  const clearFilters = () => setFilters({ ...EMPTY_ACCOUNTS_FILTERS });

  /** Statut transitoire affiché sur la ligne (P4) : le bandeau de tête est hors écran. */
  const flagRow = useCallback((key, state, message) => {
    setRowStatus((prev) => new Map(prev).set(key, { state, message }));
    const timers = statusTimers.current;
    if (timers.has(key)) clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(
        () => {
          setRowStatus((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          timers.delete(key);
        },
        state === 'error' ? 8000 : 4000,
      ),
    );
  }, []);

  const withRowBusy = useCallback(
    async (key, run, successMessage) => {
      setBusyKeys((prev) => new Set(prev).add(key));
      try {
        await run();
        if (successMessage) flagRow(key, 'done', successMessage);
      } catch (e) {
        flagRow(key, 'error', e?.message || 'Opération impossible');
      } finally {
        setBusyKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [flagRow],
  );

  const roleById = useCallback(
    (roleId) => roles.find((r) => String(r.id) === String(roleId)) || null,
    [roles],
  );

  const applyRoleToUser = useCallback(
    (user, roleId) =>
      withRowBusy(profilesUserKey(user), () => onAssignRole(user, roleId), 'Profil enregistré'),
    [onAssignRole, withRowBusy],
  );

  /**
   * P3 — une attribution sensible (admin, prof), ou le retrait d'un tel profil, passe par une
   * confirmation. Le reste s'applique directement, comme avant.
   */
  const requestRoleChange = (user, rawRoleId) => {
    const roleId = rawRoleId === '' ? '' : parseInt(rawRoleId, 10);
    const nextRole = roleId === '' ? null : roleById(roleId);
    const grantsSensitive = isSensitiveRole(nextRole);
    const revokesSensitive = isSensitiveRole(user.role_slug) && !isSensitiveRole(nextRole);
    if (grantsSensitive || revokesSensitive) {
      setPendingRoleChange({
        mode: 'single',
        users: [user],
        role: nextRole,
        roleId,
        reason: grantsSensitive ? 'grant' : 'revoke',
      });
      return;
    }
    applyRoleToUser(user, roleId);
  };

  const selectedUsers = useMemo(
    () => filteredUsers.filter((u) => selectedKeys.has(profilesUserKey(u))),
    [filteredUsers, selectedKeys],
  );

  const toggleSelect = (user) => {
    const key = profilesUserKey(user);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runBulkRole = async (targets, roleId) => {
    setBulkBusy(true);
    try {
      await onBulkAssignRole(targets, roleId);
      setSelectedKeys(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const requestBulkRole = (rawRoleId) => {
    const roleId = parseInt(rawRoleId, 10);
    const nextRole = roleById(roleId);
    if (!nextRole || selectedUsers.length === 0) return;
    const touchesSensitive =
      isSensitiveRole(nextRole) || selectedUsers.some((u) => isSensitiveRole(u.role_slug));
    if (touchesSensitive) {
      setPendingRoleChange({
        mode: 'bulk',
        users: selectedUsers,
        role: nextRole,
        roleId,
        reason: 'grant',
      });
      return;
    }
    runBulkRole(selectedUsers, roleId);
  };

  const confirmPendingRoleChange = async () => {
    const pending = pendingRoleChange;
    if (!pending) return;
    // Le mode vient de l'intention de départ, pas du nombre de lignes : une action groupée
    // portant sur un seul compte reste un appel groupé (compte rendu et journal identiques).
    if (pending.mode === 'single') {
      setPendingRoleChange(null);
      await applyRoleToUser(pending.users[0], pending.roleId);
      return;
    }
    await runBulkRole(pending.users, pending.roleId);
    setPendingRoleChange(null);
  };

  const runBulkGroup = async (groupId) => {
    const students = selectedUsers.filter(
      (u) => String(u.user_type || '').toLowerCase() === 'student',
    );
    if (students.length === 0) {
      setErr('Aucun compte élève dans la sélection — le rattachement ne concerne que les élèves.');
      return;
    }
    setBulkBusy(true);
    try {
      await onBulkAddToGroup(students, groupId);
      setSelectedKeys(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const filtersActive = hasActiveAccountsFilters(filters);

  return (
    <>
      {canManageProfiles && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Comptes</h3>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-soft)',
              lineHeight: 'var(--lh-normal)',
            }}
          >
            Le profil principal définit notamment forum et commentaires contextuels. « Modifier »
            ouvre la fiche du compte (identité, droits et groupes). Cochez plusieurs lignes pour
            attribuer un profil ou rattacher à un groupe en une fois.
          </p>

          <AccountsFiltersToolbar
            filters={filters}
            roles={roles}
            groupOptions={groupOptions}
            pageSize={pageSize}
            onChange={setFilters}
            onChangePageSize={changePageSize}
          />

          <p
            style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}
            data-testid="accounts-page-summary"
            role="status"
          >
            {pageData.total === 0
              ? 'Aucun compte'
              : `${pageData.from}–${pageData.to} sur ${pageData.total}`}
            {filtersActive && users.length > 0 && ` (${users.length} au total)`}
          </p>

          <AccountsBulkBar
            selectedCount={selectedUsers.length}
            totalCount={filteredUsers.length}
            roles={roles}
            groupOptions={groupOptions}
            busy={bulkBusy}
            canAssignRoles={canManageProfiles}
            canManageGroups={canManageGroups}
            onAssignRole={requestBulkRole}
            onAddToGroup={runBulkGroup}
            onSelectAll={() =>
              setSelectedKeys(new Set(filteredUsers.map((u) => profilesUserKey(u))))
            }
            onClear={() => setSelectedKeys(new Set())}
          />

          {pageData.total === 0 ? (
            <div className="empty" data-testid="accounts-empty">
              <p>
                {filtersActive
                  ? 'Aucun compte ne correspond à ces filtres.'
                  : 'Aucun compte à afficher.'}
              </p>
              {filtersActive && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <ProfilesUserAssignmentList
              users={pageData.items}
              roles={roles}
              loading={loading}
              busyKeys={busyKeys}
              rowStatus={rowStatus}
              selectedKeys={selectedKeys}
              isAdmin={isAdmin}
              canDelete={canDeleteUi}
              canDuplicate={canDuplicateStudents}
              onToggleSelect={toggleSelect}
              onAssignRole={requestRoleChange}
              onOpenEditUser={onOpenEditUser}
              onDeleteUser={onDeleteUser}
              onDuplicateUser={(user) =>
                withRowBusy(profilesUserKey(user), () => onDuplicateUser(user), 'Compte dupliqué')
              }
            />
          )}

          {pageData.pageCount > 1 && (
            <div className="profiles-admin-pagination">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pageData.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Précédent
              </button>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
                Page {pageData.page} / {pageData.pageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pageData.page >= pageData.pageCount}
                onClick={() => setPage((p) => Math.min(pageData.pageCount, p + 1))}
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmRoleChangeModal
        pending={pendingRoleChange}
        saving={bulkBusy}
        onConfirm={confirmPendingRoleChange}
        onCancel={() => setPendingRoleChange(null)}
      />

      <CreateUserPanel
        roleTerms={roleTerms}
        affiliationOptions={affiliationOptions}
        roles={roles}
        groupOptions={groupOptions}
        isAdmin={isAdmin}
        canCreateTeacherRoles={canCreateTeacherRoles}
        canCreateUsers={canCreateUsers}
        setErr={setErr}
        setMsg={setMsg}
        onCreated={onCreated}
      />
    </>
  );
}
