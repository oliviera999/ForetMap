import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { HelpPanel } from './HelpPanel';
import { resolveHelpPanelSection } from '../utils/helpResolve';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { DialogShell } from './DialogShell';
import { slugify } from '../utils/slugify';
import { GROUP_KIND_LABELS } from '../utils/profilesRoleForm.js';
import {
  normalizeProfilesPayload,
  filterGroupDefaultRoles,
} from '../utils/groupDefaultRoleOptions.js';
import { IconClock, IconWarning } from '../shared/icons.jsx';
import {
  buildGroupForest,
  filterGroupMemberCandidates,
  filterGroupsList,
  parentGroupCandidates,
  GROUP_KINDS,
} from '../utils/groupsAdminListFilters.js';
import { userTypeLabel } from '../utils/profilesUserGroups.js';
import {
  normalizePageSize,
  paginateList,
  DEFAULT_PROFILES_PAGE_SIZE,
  PROFILES_PAGE_SIZES,
} from '../utils/profilesUserListFilters.js';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../shared/platform/browserStorage.js';

const GROUPS_HIDE_INACTIVE_KEY = 'foretmap.groups.hideInactive';
const GROUPS_PAGE_SIZE_KEY = 'foretmap.profiles.pageSize';

const EMPTY_CREATE_DRAFT = { name: '', slug: '', kind: 'class' };

function normalizeIds(values = []) {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

function GroupSettingsPanel({
  group,
  groups = [],
  roles,
  rolesUnavailable = false,
  canManageDefaultRole = true,
  onClose,
  onSaved,
}) {
  const [defaultRoleId, setDefaultRoleId] = useState('');
  const [forceDefaultRole, setForceDefaultRole] = useState(false);
  const [parentGroupId, setParentGroupId] = useState('');
  const [pedagoLevel, setPedagoLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [classCode, setClassCode] = useState(group?.class_code || null);

  useEffect(() => {
    setDefaultRoleId(group?.default_role_id != null ? String(group.default_role_id) : '');
    setForceDefaultRole(!!group?.force_default_role);
    setParentGroupId(group?.parent_group_id != null ? String(group.parent_group_id) : '');
    setPedagoLevel(group?.pedago_level || '');
    setClassCode(group?.class_code || null);
  }, [group]);

  const parentOptions = useMemo(() => parentGroupCandidates(groups, group?.id), [groups, group]);

  const updateClassCode = async (action) => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const result = await api(`/api/groups/${encodeURIComponent(group.id)}/class-code`, 'POST', {
        action,
      });
      setClassCode(result?.class_code || null);
      setMsg(action === 'clear' ? 'Code de classe supprimé' : 'Nouveau code de classe généré');
      await onSaved();
    } catch (e) {
      setErr(e.message || 'Erreur code de classe');
    }
    setSaving(false);
  };

  const groupRoles = useMemo(() => filterGroupDefaultRoles(roles), [roles]);

  const saveSettings = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const body = {
        parent_group_id: parentGroupId || null,
        pedago_level: pedagoLevel || null,
      };
      if (canManageDefaultRole) {
        body.default_role_id = defaultRoleId ? Number(defaultRoleId) : null;
        // Une case cochée sans profil choisi serait refusée par l'API : le `select` la décoche
        // déjà, on ne renvoie donc jamais la combinaison impossible.
        body.force_default_role = defaultRoleId ? forceDefaultRole : false;
      }
      const saved = await api(`/api/groups/${encodeURIComponent(group.id)}`, 'PATCH', body);
      const applied = Number(saved?.roles_recomputed ?? 0);
      setMsg(
        applied > 0
          ? `Paramètres enregistrés — profil recalculé pour ${applied} membre(s)`
          : 'Paramètres enregistrés',
      );
      await onSaved();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement');
    }
    setSaving(false);
  };

  return (
    <div className="log-modal fade-in" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Réglages — {group.name}</h3>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', marginTop: 0 }}>
        Le profil du groupe s’ajoute au profil de chaque membre : c’est le plus élevé des deux qui
        s’applique. Sans profil, le groupe ne change rien aux droits de ses membres.
      </p>
      {group?.gl_class_id && (
        <p style={{ fontSize: 'var(--text-sm)', color: '#0f766e' }}>
          Lié GL : classe #{group.gl_class_id}
          {group.gl_class_name ? ` (${group.gl_class_name})` : ''}
        </p>
      )}
      {err && (
        <div className="auth-error">
          <IconWarning size={14} /> {err}
        </div>
      )}
      {msg && <div className="auth-success">{msg}</div>}
      <div className="field" data-testid="group-parent-select">
        <label>Groupe parent</label>
        <select value={parentGroupId} onChange={(e) => setParentGroupId(e.target.value)}>
          <option value="">— Aucun (groupe de premier niveau) —</option>
          {parentOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <small style={{ display: 'block', opacity: 0.75, marginTop: 4 }}>
          Un sous-groupe hérite du périmètre cartes de sa classe et reste visible par ses
          responsables. Choisir « Aucun » le détache.
        </small>
      </div>
      <div className="field" data-testid="group-pedago-level">
        <label>Niveau pédagogique biodiversité</label>
        <select value={pedagoLevel} onChange={(e) => setPedagoLevel(e.target.value)}>
          <option value="">— Hériter (défaut site / carte) —</option>
          <option value="college">Collège</option>
          <option value="lycee">Lycée</option>
          <option value="universite">Université</option>
        </select>
        <small style={{ display: 'block', opacity: 0.75, marginTop: 4 }}>
          Adapte l’affichage biodiversité pour les membres de ce groupe. Si plusieurs groupes fixent
          un niveau, le plus simple l’emporte.
        </small>
      </div>
      <div className="field">
        <label>Profil conféré par le groupe</label>
        <select
          value={defaultRoleId}
          disabled={!canManageDefaultRole}
          onChange={(e) => {
            setDefaultRoleId(e.target.value);
            if (!e.target.value) setForceDefaultRole(false);
          }}
        >
          <option value="">— Aucun (visiteur, sans effet) —</option>
          {groupRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name || r.slug}
            </option>
          ))}
        </select>
        {!canManageDefaultRole && (
          <small style={{ display: 'block', opacity: 0.75, marginTop: 4 }}>
            Seuls un administrateur ou un n3boss règlent le profil conféré par un groupe.
          </small>
        )}
        {groupRoles.length === 0 && (
          <p
            data-testid="group-default-role-empty"
            style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--ink-warning)' }}
          >
            {rolesUnavailable
              ? 'Liste des profils indisponible : ton profil n’a pas le droit de lire les profils RBAC. Demande « Gestion des profils RBAC » à un administrateur.'
              : 'Aucun profil disponible.'}
          </p>
        )}
      </div>
      <label
        style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)' }}
        data-testid="group-force-default-role"
      >
        <input
          type="checkbox"
          checked={forceDefaultRole}
          disabled={!defaultRoleId || !canManageDefaultRole}
          onChange={(e) => setForceDefaultRole(e.target.checked)}
        />
        Imposer ce profil aux élèves du groupe
      </label>
      <p style={{ margin: '4px 0 0 24px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
        {defaultRoleId
          ? 'Sans cette case, « le plus élevé l’emporte » : un élève garde un profil attribué plus haut, et les tâches validées peuvent le faire monter. Cochée, le profil du groupe s’applique aux comptes élèves même en baisse (classe de passage tenue en « Visiteur »). Les comptes enseignants ne sont jamais rétrogradés.'
          : 'Choisissez d’abord un profil : il n’y a rien à imposer tant que le groupe n’en confère aucun.'}
      </p>
      <div style={{ marginTop: 12, fontSize: 'var(--text-sm)' }} data-testid="group-class-code">
        <strong>Code de classe (inscription autonome)</strong>
        <p style={{ margin: '4px 0 6px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          Un élève qui saisit ce code à l'inscription rejoint directement ce groupe (et devient
          n3beur si le groupe le confère). Régénérer le code invalide l'ancien.
        </p>
        {classCode ? (
          <p style={{ margin: '0 0 6px' }}>
            Code actuel : <code style={{ fontSize: 'var(--text-base)' }}>{classCode}</code>
          </p>
        ) : (
          <p style={{ margin: '0 0 6px', color: 'var(--ink-soft)' }}>Aucun code actif.</p>
        )}
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => updateClassCode('generate')}
          >
            {classCode ? 'Régénérer le code' : 'Générer un code'}
          </button>
          {classCode && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => updateClassCode('clear')}
            >
              Supprimer le code
            </button>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveSettings}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function GroupMembersEditor({ group, users, maps, projects, onClose, onSaved }) {
  const [memberIds, setMemberIds] = useState([]);
  const [scopeMapIds, setScopeMapIds] = useState([]);
  const [scopeProjectIds, setScopeProjectIds] = useState([]);
  const [search, setSearch] = useState('');
  const [membershipFilter, setMembershipFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    normalizePageSize(safeLocalStorageGetItem(GROUPS_PAGE_SIZE_KEY, DEFAULT_PROFILES_PAGE_SIZE)),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const members = Array.isArray(group?.members) ? group.members : [];
    setMemberIds(normalizeIds(members.map((m) => m.user_id)));
    const scopes = Array.isArray(group?.scopes) ? group.scopes : [];
    setScopeMapIds(normalizeIds(scopes.map((s) => s.map_id).filter(Boolean)));
    setScopeProjectIds(normalizeIds(scopes.map((s) => s.project_id).filter(Boolean)));
  }, [group]);

  const memberOrManagerIds = useMemo(() => new Set(memberIds.map(String)), [memberIds]);

  const filteredUsers = useMemo(
    () =>
      filterGroupMemberCandidates(users, {
        query: search,
        membershipFilter,
        memberOrManagerIds,
      }),
    [users, search, membershipFilter, memberOrManagerIds],
  );

  useEffect(() => {
    setPage(1);
  }, [search, membershipFilter, pageSize]);

  const pageData = useMemo(
    () => paginateList(filteredUsers, page, pageSize),
    [filteredUsers, page, pageSize],
  );

  const toggleId = (setter, current, id, checked) => {
    if (checked) setter(normalizeIds([...current, id]));
    else setter(current.filter((x) => x !== id));
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await api(`/api/groups/${encodeURIComponent(group.id)}/members`, 'PUT', {
        member_user_ids: normalizeIds(memberIds),
        scope_map_ids: normalizeIds(scopeMapIds),
        scope_project_ids: normalizeIds(scopeProjectIds),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || 'Erreur enregistrement groupe');
    }
    setSaving(false);
  };

  return (
    <div className="log-modal fade-in" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Membres et périmètre — {group.name}</h3>
      {err && (
        <div className="auth-error">
          <IconWarning size={14} /> {err}
        </div>
      )}
      <div className="profiles-admin-list-toolbar" style={{ marginBottom: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un utilisateur…"
          aria-label="Rechercher un utilisateur"
        />
        <select
          value={membershipFilter}
          onChange={(e) => setMembershipFilter(e.target.value)}
          aria-label="Filtrer membres"
        >
          <option value="all">Tous</option>
          <option value="members">Déjà membres</option>
          <option value="non_members">Non membres</option>
        </select>
        <label className="profiles-admin-page-size">
          <span>Par page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const size = normalizePageSize(e.target.value);
              setPageSize(size);
              safeLocalStorageSetItem(GROUPS_PAGE_SIZE_KEY, String(size));
            }}
            aria-label="Nombre d’utilisateurs par page"
          >
            {PROFILES_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
        {pageData.total === 0
          ? 'Aucun utilisateur'
          : `${pageData.from}–${pageData.to} sur ${pageData.total}`}
      </p>
      <div
        style={{
          maxHeight: 280,
          overflow: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 8,
        }}
      >
        {pageData.items.map((u) => {
          const uid = String(u.id);
          const memberChecked = memberIds.includes(uid);
          return (
            <div
              key={uid}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 'var(--text-sm)' }}>
                {u.display_name}{' '}
                <span style={{ color: 'var(--ink-soft)' }}>({userTypeLabel(u.user_type)})</span>
              </div>
              <label style={{ fontSize: 'var(--text-sm)' }}>
                <input
                  type="checkbox"
                  checked={memberChecked}
                  onChange={(e) => toggleId(setMemberIds, memberIds, uid, e.target.checked)}
                />{' '}
                membre
              </label>
            </div>
          );
        })}
      </div>
      {pageData.pageCount > 1 && (
        <div className="profiles-admin-pagination" style={{ marginTop: 8 }}>
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
      <div className="field" style={{ marginTop: 10 }}>
        <label>Périmètre cartes</label>
        <small style={{ display: 'block', opacity: 0.75, marginBottom: 4 }}>
          Vide = toutes les cartes. Sinon les membres du groupe (et de ses sous-groupes) ne voient
          plus que ces cartes — sauf s’ils appartiennent aussi à un groupe sans périmètre. Sans
          effet sur les professeurs.
        </small>
        <select
          multiple
          value={scopeMapIds}
          onChange={(e) =>
            setScopeMapIds(normalizeIds([...e.target.selectedOptions].map((opt) => opt.value)))
          }
          style={{ minHeight: 90 }}
        >
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Périmètre projets</label>
        <select
          multiple
          value={scopeProjectIds}
          onChange={(e) =>
            setScopeProjectIds(normalizeIds([...e.target.selectedOptions].map((opt) => opt.value)))
          }
          style={{ minHeight: 110 }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save} style={{ flex: 1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function GroupTreeNode({
  node,
  depth,
  collapsedIds,
  onToggleCollapse,
  loading,
  onSettings,
  onMembers,
  onToggleActive,
  onDelete,
}) {
  const id = String(node.id);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const collapsed = collapsedIds.has(id);
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 16 }}>
      <div
        style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginBottom: 8 }}
        data-testid={`group-row-${id}`}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {hasChildren ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Déplier le sous-groupe' : 'Replier le sous-groupe'}
                onClick={() => onToggleCollapse(id)}
                style={{ minWidth: 44, padding: '4px 8px' }}
              >
                {collapsed ? '▸' : '▾'}
              </button>
            ) : (
              <span style={{ width: 28, display: 'inline-block' }} aria-hidden />
            )}
            <div>
              <strong>{node.name}</strong>
              <span style={{ color: 'var(--ink-soft)' }}>
                {' '}
                · {GROUP_KIND_LABELS[node.kind] || node.kind}
              </span>
              {node.parent_group_id && (
                <span style={{ color: 'var(--ink-dim)' }}> · sous-groupe</span>
              )}
              {Number(node.is_active) === 0 && (
                <span style={{ color: '#b45309', fontSize: 'var(--text-xs)' }}> · inactif</span>
              )}
              {node.gl_class_id && (
                <span style={{ color: '#0f766e', fontSize: 'var(--text-xs)' }}> · Lié GL</span>
              )}
              {node.default_role_display_name && (
                <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                  {' '}
                  · Profil : {node.default_role_display_name}
                </span>
              )}
              {node.force_default_role && (
                <span
                  style={{ color: '#b45309', fontSize: 'var(--text-xs)' }}
                  title="Profil imposé aux élèves du groupe, même en baisse"
                >
                  {' '}
                  · imposé
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onSettings(node)}>
              Réglages
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onMembers(node)}>
              Membres
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onToggleActive(node)}>
              {node.is_active ? 'Désactiver' : 'Activer'}
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onDelete(node)}
              disabled={loading}
            >
              Supprimer
            </button>
          </div>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 4 }}>
          {Array.isArray(node.members) ? `${node.members.length} membre(s)` : '0 membre'} ·{' '}
          {Array.isArray(node.scopes) ? `${node.scopes.length} scope(s)` : '0 scope'}
        </div>
      </div>
      {hasChildren &&
        !collapsed &&
        node.children.map((child) => (
          <GroupTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
            loading={loading}
            onSettings={onSettings}
            onMembers={onMembers}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

export function GroupsAdminView({ onPendingCountChange } = {}) {
  const publicSettings = usePublicSettings();
  const { confirm } = useAppDialogs();
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [maps, setMaps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null);
  const [settingsGroup, setSettingsGroup] = useState(null);
  const [roles, setRoles] = useState([]);
  /** Chargement des profils refusé (droits) : le sélecteur le dit plutôt que de rester vide. */
  const [rolesUnavailable, setRolesUnavailable] = useState(false);
  /** Profil conféré / imposé : réservés à l'administrateur et au n3boss (règle serveur). */
  const [canManageDefaultRole, setCanManageDefaultRole] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pendingVisitors, setPendingVisitors] = useState([]);
  const [pendingTargetGroup, setPendingTargetGroup] = useState('');
  const [selectedPendingIds, setSelectedPendingIds] = useState(() => new Set());
  const [groupQuery, setGroupQuery] = useState('');
  const [groupKind, setGroupKind] = useState('');
  const [hideInactive, setHideInactive] = useState(() => {
    const raw = safeLocalStorageGetItem(GROUPS_HIDE_INACTIVE_KEY, '1');
    return raw !== '0';
  });
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE_DRAFT);
  const [slugTouched, setSlugTouched] = useState(false);
  const helpGroups = resolveHelpPanelSection('groups', publicSettings);

  const load = async () => {
    setErr('');
    const [groupPayload, userRows, mapsRows, projectRows, roleRows, pendingRows] =
      await Promise.all([
        api('/api/groups'),
        api('/api/rbac/users').catch(() => []),
        api('/api/maps'),
        api('/api/task-projects').catch(() => []),
        api('/api/rbac/profiles').catch(() => null),
        api('/api/groups/pending-visitors').catch(() => []),
      ]);
    setGroups(Array.isArray(groupPayload?.groups) ? groupPayload.groups : []);
    setCanManageDefaultRole(!!groupPayload?.can_manage_default_role);
    setUsers(Array.isArray(userRows) ? userRows : []);
    setMaps(Array.isArray(mapsRows) ? mapsRows : []);
    setProjects(Array.isArray(projectRows) ? projectRows : []);
    // `null` distingue l'échec de chargement (droits manquants) d'une réponse vide, pour
    // pouvoir le dire à l'utilisateur au lieu de le taire.
    setRoles(normalizeProfilesPayload(roleRows));
    setRolesUnavailable(roleRows == null);
    const pending = Array.isArray(pendingRows) ? pendingRows : [];
    setPendingVisitors(pending);
    setSelectedPendingIds(new Set());
    if (typeof onPendingCountChange === 'function') {
      onPendingCountChange(pending.length);
    }
  };

  const attachPendingVisitor = async (student) => {
    if (!pendingTargetGroup) {
      setErr('Choisis d’abord le groupe de rattachement.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api(
        `/api/groups/${encodeURIComponent(pendingTargetGroup)}/members/${encodeURIComponent(student.id)}`,
        'POST',
      );
      setMsg(`${student.first_name} ${student.last_name} rattaché(e) au groupe.`);
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur de rattachement');
    }
    setLoading(false);
  };

  const attachSelectedPending = async () => {
    if (!pendingTargetGroup) {
      setErr('Choisis d’abord le groupe de rattachement.');
      return;
    }
    const selected = pendingVisitors.filter((v) => selectedPendingIds.has(String(v.id)));
    if (selected.length === 0) {
      setErr('Sélectionne au moins un compte à rattacher.');
      return;
    }
    setLoading(true);
    setErr('');
    let ok = 0;
    const errors = [];
    try {
      // Même appel que la barre d'actions groupées de l'onglet Comptes : un seul aller-retour.
      const result = await api(
        `/api/groups/${encodeURIComponent(pendingTargetGroup)}/members/bulk`,
        'POST',
        { user_ids: selected.map((v) => String(v.id)) },
      );
      ok = Number(result?.added || 0);
      const byId = new Map(selected.map((v) => [String(v.id), v]));
      for (const row of Array.isArray(result?.results) ? result.results : []) {
        if (row.ok) continue;
        const student = byId.get(String(row.user_id)) || {};
        errors.push(
          `${student.first_name || ''} ${student.last_name || ''}: ${row.error || 'échec'}`.trim(),
        );
      }
    } catch (e) {
      errors.push(e.message || 'échec du rattachement');
    }
    if (ok > 0) {
      setMsg(`${ok} compte${ok > 1 ? 's' : ''} rattaché${ok > 1 ? 's' : ''} au groupe.`);
    }
    if (errors.length > 0) {
      setErr(errors.slice(0, 3).join(' · '));
    }
    await load();
    setLoading(false);
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message || 'Erreur chargement groupes'));
  }, []);

  const filteredGroups = useMemo(
    () =>
      filterGroupsList(groups, {
        query: groupQuery,
        kind: groupKind,
        hideInactive,
      }),
    [groups, groupQuery, groupKind, hideInactive],
  );

  const forest = useMemo(() => buildGroupForest(filteredGroups), [filteredGroups]);

  const openCreateGroup = () => {
    setCreateDraft(EMPTY_CREATE_DRAFT);
    setSlugTouched(false);
    setCreateOpen(true);
  };

  const closeCreateGroup = () => {
    setCreateOpen(false);
    setCreateDraft(EMPTY_CREATE_DRAFT);
    setSlugTouched(false);
  };

  const updateCreateName = (name) => {
    setCreateDraft((prev) => ({
      ...prev,
      name,
      // slugify() translittère les accents : « 2nde A — Éco » → « 2nde-a-eco »
      // (audit docs/AUDIT_BDD_2026-08.md §5.5).
      slug: slugTouched ? prev.slug : slugify(name),
    }));
  };

  const submitCreateGroup = async (e) => {
    e.preventDefault();
    const name = String(createDraft.name || '').trim();
    if (!name) {
      setErr('Le nom du groupe est requis');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await api('/api/groups', 'POST', {
        name,
        slug: String(createDraft.slug || '').trim() || undefined,
        kind: createDraft.kind || 'class',
      });
      setMsg('Groupe créé');
      closeCreateGroup();
      await load();
    } catch (errCreate) {
      setErr(errCreate.message || 'Erreur création groupe');
    }
    setLoading(false);
  };

  const toggleGroupActive = async (g) => {
    setLoading(true);
    setErr('');
    try {
      await api(`/api/groups/${encodeURIComponent(g.id)}`, 'PATCH', {
        is_active: !g.is_active,
      });
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur mise à jour groupe');
    }
    setLoading(false);
  };

  const deleteGroup = async (g) => {
    if (!g?.id) return;
    const ok = await confirm({ message: `Supprimer le groupe « ${g.name} » ?`, danger: true });
    if (!ok) return;
    setLoading(true);
    setErr('');
    try {
      await api(`/api/groups/${encodeURIComponent(g.id)}`, 'DELETE');
      setMsg('Groupe supprimé');
      if (editingGroup && String(editingGroup.id) === String(g.id)) {
        setEditingGroup(null);
      }
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur suppression groupe');
    }
    setLoading(false);
  };

  const toggleCollapse = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleHideInactive = (checked) => {
    setHideInactive(checked);
    safeLocalStorageSetItem(GROUPS_HIDE_INACTIVE_KEY, checked ? '1' : '0');
  };

  const togglePendingSelection = (id, checked) => {
    setSelectedPendingIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const allPendingSelected =
    pendingVisitors.length > 0 &&
    pendingVisitors.every((v) => selectedPendingIds.has(String(v.id)));

  const toggleSelectAllPending = (checked) => {
    if (checked) {
      setSelectedPendingIds(new Set(pendingVisitors.map((v) => String(v.id))));
    } else {
      setSelectedPendingIds(new Set());
    }
  };

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Groupes & sous-groupes</h3>
        <HelpPanel
          sectionId="groups"
          title={helpGroups.title}
          entries={helpGroups.items}
          isTeacher
        />
      </div>
      <p style={{ marginTop: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
        Structure pédagogique, membres, responsables et périmètre carte/projet.
      </p>

      {pendingVisitors.length > 0 && (
        <div
          data-testid="pending-visitors"
          style={{
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            borderRadius: 10,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <strong>
            <IconClock size={14} /> {pendingVisitors.length} compte
            {pendingVisitors.length > 1 ? 's' : ''} en attente de rattachement
          </strong>
          <p style={{ margin: '4px 0 8px', fontSize: 'var(--text-sm)', color: '#1e3a8a' }}>
            Ces élèves se sont inscrits seuls et n&apos;ont encore accès qu&apos;à la Visite.
            Choisis un groupe puis rattache-les un par un ou en lot (le rôle n3beur est attribué
            automatiquement si le groupe le confère).
          </p>
          <label style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: 8 }}>
            Groupe de rattachement{' '}
            <select
              value={pendingTargetGroup}
              onChange={(e) => setPendingTargetGroup(e.target.value)}
            >
              <option value="">— choisir —</option>
              {groups
                .filter((g) => g.is_active)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <label
              style={{ fontSize: 'var(--text-sm)', display: 'flex', gap: 6, alignItems: 'center' }}
            >
              <input
                type="checkbox"
                checked={allPendingSelected}
                onChange={(e) => toggleSelectAllPending(e.target.checked)}
              />
              Tout sélectionner
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loading || !pendingTargetGroup || selectedPendingIds.size === 0}
              onClick={attachSelectedPending}
            >
              Rattacher la sélection ({selectedPendingIds.size})
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {pendingVisitors.map((v) => (
              <li key={v.id} style={{ marginBottom: 4 }}>
                <label
                  style={{
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    marginRight: 8,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPendingIds.has(String(v.id))}
                    onChange={(e) => togglePendingSelection(v.id, e.target.checked)}
                  />
                  {v.first_name} {v.last_name}
                  {v.pseudo ? ` (${v.pseudo})` : ''}
                </label>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={loading || !pendingTargetGroup}
                  onClick={() => attachPendingVisitor(v)}
                >
                  Rattacher
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && (
        <div className="auth-error">
          <IconWarning size={14} /> {err}
        </div>
      )}
      {msg && <div className="auth-success">{msg}</div>}
      <div className="profiles-admin-list-toolbar" style={{ marginBottom: 10 }}>
        <input
          type="search"
          value={groupQuery}
          onChange={(e) => setGroupQuery(e.target.value)}
          placeholder="Rechercher un groupe (nom ou slug)…"
          aria-label="Rechercher un groupe"
        />
        <select
          value={groupKind}
          onChange={(e) => setGroupKind(e.target.value)}
          aria-label="Filtrer par type de groupe"
        >
          <option value="">Tous les types</option>
          {GROUP_KINDS.map((k) => (
            <option key={k} value={k}>
              {GROUP_KIND_LABELS[k] || k}
            </option>
          ))}
        </select>
        <label
          style={{
            display: 'inline-flex',
            gap: 6,
            alignItems: 'center',
            fontSize: 'var(--text-sm)',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={(e) => toggleHideInactive(e.target.checked)}
          />
          Masquer les inactifs
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-secondary btn-sm" onClick={openCreateGroup} disabled={loading}>
          + Nouveau groupe
        </button>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          {filteredGroups.length} groupe{filteredGroups.length !== 1 ? 's' : ''} affiché
          {filteredGroups.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ marginTop: 10 }}>
        {forest.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
            Aucun groupe ne correspond aux filtres.
          </p>
        ) : (
          forest.map((node) => (
            <GroupTreeNode
              key={node.id}
              node={node}
              depth={0}
              collapsedIds={collapsedIds}
              onToggleCollapse={toggleCollapse}
              loading={loading}
              onSettings={setSettingsGroup}
              onMembers={setEditingGroup}
              onToggleActive={toggleGroupActive}
              onDelete={deleteGroup}
            />
          ))
        )}
      </div>
      {settingsGroup && (
        <div style={{ marginTop: 12 }}>
          <GroupSettingsPanel
            group={settingsGroup}
            groups={groups}
            roles={roles}
            rolesUnavailable={rolesUnavailable}
            canManageDefaultRole={canManageDefaultRole}
            onClose={() => setSettingsGroup(null)}
            onSaved={load}
          />
        </div>
      )}
      {editingGroup && (
        <div style={{ marginTop: 12 }}>
          <GroupMembersEditor
            group={editingGroup}
            users={users}
            maps={maps}
            projects={projects}
            onClose={() => setEditingGroup(null)}
            onSaved={load}
          />
        </div>
      )}

      <DialogShell
        open={createOpen}
        onClose={closeCreateGroup}
        ariaLabel="Créer un groupe"
        showCloseButton
        dialogClassName="log-modal fade-in"
        dialogStyle={{ maxWidth: 440, width: '92vw' }}
      >
        <h3 style={{ marginTop: 0 }}>Créer un groupe</h3>
        <form onSubmit={submitCreateGroup}>
          <label className="field">
            <span>Nom</span>
            <input
              value={createDraft.name}
              onChange={(e) => updateCreateName(e.target.value)}
              placeholder="ex. 2nde A"
              autoComplete="off"
              required
            />
          </label>
          <label className="field">
            <span>Slug technique (optionnel)</span>
            <input
              value={createDraft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setCreateDraft((prev) => ({ ...prev, slug: e.target.value }));
              }}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              value={createDraft.kind}
              onChange={(e) => setCreateDraft((prev) => ({ ...prev, kind: e.target.value }))}
            >
              {GROUP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {GROUP_KIND_LABELS[k] || k}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={closeCreateGroup}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </DialogShell>
    </div>
  );
}
