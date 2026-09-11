import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import {
  buildUserGroupIdsMap,
  filterProfilesUsers,
  normalizePageSize,
  paginateList,
  DEFAULT_PROFILES_PAGE_SIZE,
  PROFILES_PAGE_SIZES,
} from '../../utils/profilesUserListFilters.js';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../../shared/platform/browserStorage.js';
import { ProfilesUserAssignmentList } from './ProfilesUserAssignmentList.jsx';
import { CreateUserPanel } from './CreateUserPanel.jsx';
import { StudentDeletePanel } from './StudentDeletePanel.jsx';

const PAGE_SIZE_STORAGE_KEY = 'foretmap.profiles.pageSize';

const cardStyle = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
  marginTop: 12,
};

/**
 * Sous-onglet Comptes : attribution des profils (recherche / filtres / pagination),
 * création unitaire et suppression / duplication.
 */
export function ProfilesAccountsPanel({
  roles = [],
  users = [],
  loading = false,
  editUserLoadState = 'idle',
  isAdmin = false,
  canCreateUsers = false,
  canManageProfiles = false,
  canReadAllStats = false,
  canDeleteUi = false,
  canDuplicateStudents = false,
  roleTerms,
  affiliationOptions = [],
  searchStudent,
  filteredStudents,
  setSearchStudent,
  setConfirmStudent,
  duplicateStudent,
  setErr,
  setMsg,
  onCreated,
  onAssignRole,
  onOpenEditUser,
  onFilteredCountChange,
}) {
  const [query, setQuery] = useState('');
  const [roleId, setRoleId] = useState('');
  const [userType, setUserType] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groupOptions, setGroupOptions] = useState([]);
  const [userGroupIdsByUserId, setUserGroupIdsByUserId] = useState(() => new Map());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    normalizePageSize(safeLocalStorageGetItem(PAGE_SIZE_STORAGE_KEY, DEFAULT_PROFILES_PAGE_SIZE)),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [opts, detailed] = await Promise.all([
          api('/api/groups/options').catch(() => ({ groups: [] })),
          api('/api/groups').catch(() => ({ groups: [] })),
        ]);
        if (cancelled) return;
        const options = Array.isArray(opts?.groups) ? opts.groups : [];
        setGroupOptions(options);
        const groups = Array.isArray(detailed?.groups) ? detailed.groups : [];
        setUserGroupIdsByUserId(buildUserGroupIdsMap(groups));
      } catch {
        if (!cancelled) {
          setGroupOptions([]);
          setUserGroupIdsByUserId(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredUsers = useMemo(
    () =>
      filterProfilesUsers(users, {
        query,
        roleId,
        userType,
        groupId,
        userGroupIdsByUserId,
      }),
    [users, query, roleId, userType, groupId, userGroupIdsByUserId],
  );

  useEffect(() => {
    if (typeof onFilteredCountChange === 'function') {
      onFilteredCountChange(filteredUsers.length);
    }
  }, [filteredUsers.length, onFilteredCountChange]);

  useEffect(() => {
    setPage(1);
  }, [query, roleId, userType, groupId, pageSize]);

  const pageData = useMemo(
    () => paginateList(filteredUsers, page, pageSize),
    [filteredUsers, page, pageSize],
  );

  const changePageSize = (next) => {
    const size = normalizePageSize(next);
    setPageSize(size);
    safeLocalStorageSetItem(PAGE_SIZE_STORAGE_KEY, String(size));
  };

  return (
    <>
      {canManageProfiles && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Attribution des profils</h3>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-soft)',
              lineHeight: 'var(--lh-normal)',
            }}
          >
            Choisir le profil principal définit notamment forum et commentaires contextuels.
            Utilisez « Modifier » pour changer prénom, nom, pseudo, email, description, affiliation
            ou mot de passe.
          </p>
          <div className="profiles-admin-list-toolbar">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, pseudo, e-mail…)"
              aria-label="Rechercher un compte"
            />
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              aria-label="Filtrer par profil"
            >
              <option value="">Tous les profils</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name || r.slug}
                </option>
              ))}
            </select>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
              aria-label="Filtrer par type de compte"
            >
              <option value="">Tous les types</option>
              <option value="student">Élèves</option>
              <option value="teacher">Enseignants</option>
            </select>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-label="Filtrer par groupe"
            >
              <option value="">Tous les groupes</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <label className="profiles-admin-page-size">
              <span>Par page</span>
              <select
                value={pageSize}
                onChange={(e) => changePageSize(e.target.value)}
                aria-label="Nombre de comptes par page"
              >
                {PROFILES_PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-soft)',
            }}
            data-testid="accounts-page-summary"
          >
            {pageData.total === 0
              ? 'Aucun compte'
              : `${pageData.from}–${pageData.to} sur ${pageData.total}`}
          </p>
          <ProfilesUserAssignmentList
            users={pageData.items}
            roles={roles}
            loading={loading}
            editUserLoadState={editUserLoadState}
            isAdmin={isAdmin}
            onAssignRole={onAssignRole}
            onOpenEditUser={onOpenEditUser}
          />
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

      <CreateUserPanel
        roleTerms={roleTerms}
        affiliationOptions={affiliationOptions}
        isAdmin={isAdmin}
        canCreateUsers={canCreateUsers}
        setErr={setErr}
        setMsg={setMsg}
        onCreated={onCreated}
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
  );
}
