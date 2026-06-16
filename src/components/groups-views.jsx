import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { HelpPanel } from './HelpPanel';
import { HELP_PANELS } from '../constants/help';

function normalizeIds(values = []) {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

function GroupMembersEditor({ group, users, maps, projects, onClose, onSaved }) {
  const [memberIds, setMemberIds] = useState([]);
  const [managerIds, setManagerIds] = useState([]);
  const [scopeMapIds, setScopeMapIds] = useState([]);
  const [scopeProjectIds, setScopeProjectIds] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const members = Array.isArray(group?.members) ? group.members : [];
    setMemberIds(
      normalizeIds(members.filter((m) => m.role_in_group !== 'manager').map((m) => m.user_id)),
    );
    setManagerIds(
      normalizeIds(members.filter((m) => m.role_in_group === 'manager').map((m) => m.user_id)),
    );
    const scopes = Array.isArray(group?.scopes) ? group.scopes : [];
    setScopeMapIds(normalizeIds(scopes.map((s) => s.map_id).filter(Boolean)));
    setScopeProjectIds(normalizeIds(scopes.map((s) => s.project_id).filter(Boolean)));
  }, [group]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      String(u.display_name || '')
        .toLowerCase()
        .includes(q),
    );
  }, [users, search]);

  const toggleId = (setter, current, id, checked) => {
    if (checked) setter(normalizeIds([...current, id]));
    else setter(current.filter((x) => x !== id));
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await api(`/api/groups/${encodeURIComponent(group.id)}/members`, 'PUT', {
        member_user_ids: normalizeIds(memberIds.filter((id) => !managerIds.includes(id))),
        manager_user_ids: normalizeIds(managerIds),
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
      {err && <div className="auth-error">⚠️ {err}</div>}
      <div className="field" style={{ marginBottom: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un utilisateur..."
        />
      </div>
      <div
        style={{
          maxHeight: 220,
          overflow: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 8,
        }}
      >
        {filteredUsers.map((u) => {
          const uid = String(u.id);
          const memberChecked = memberIds.includes(uid) || managerIds.includes(uid);
          const managerChecked = managerIds.includes(uid);
          return (
            <div
              key={uid}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 8,
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: '.86rem' }}>
                {u.display_name} <span style={{ color: '#64748b' }}>({u.user_type})</span>
              </div>
              <label style={{ fontSize: '.78rem' }}>
                <input
                  type="checkbox"
                  checked={memberChecked}
                  onChange={(e) => toggleId(setMemberIds, memberIds, uid, e.target.checked)}
                />{' '}
                membre
              </label>
              <label style={{ fontSize: '.78rem' }}>
                <input
                  type="checkbox"
                  checked={managerChecked}
                  onChange={(e) => toggleId(setManagerIds, managerIds, uid, e.target.checked)}
                />{' '}
                manager
              </label>
            </div>
          );
        })}
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Périmètre cartes</label>
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
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

export function GroupsAdminView() {
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [maps, setMaps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const helpGroups = HELP_PANELS.groups;

  const load = async () => {
    setErr('');
    const [groupPayload, userRows, mapsRows, projectRows] = await Promise.all([
      api('/api/groups'),
      api('/api/rbac/users'),
      api('/api/maps'),
      api('/api/task-projects'),
    ]);
    setGroups(Array.isArray(groupPayload?.groups) ? groupPayload.groups : []);
    setUsers(Array.isArray(userRows) ? userRows : []);
    setMaps(Array.isArray(mapsRows) ? mapsRows : []);
    setProjects(Array.isArray(projectRows) ? projectRows : []);
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message || 'Erreur chargement groupes'));
  }, []);

  const createGroup = async () => {
    const name = window.prompt('Nom du groupe (ex: 2nde A)');
    if (!name || !name.trim()) return;
    const slug = window.prompt(
      'Slug technique (optionnel)',
      String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-'),
    );
    const kind = window.prompt('Type (class|team|unit|club)', 'class');
    setLoading(true);
    setErr('');
    try {
      await api('/api/groups', 'POST', {
        name: name.trim(),
        slug: slug || undefined,
        kind: kind || 'class',
      });
      setMsg('Groupe créé');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur création groupe');
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
    const ok = window.confirm(`Supprimer le groupe « ${g.name} » ?`);
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
      <p style={{ marginTop: 0, fontSize: '.84rem', color: '#64748b' }}>
        Module dédié: structure pédagogique, membres, responsables et périmètre carte/projet.
      </p>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {msg && <div className="auth-success">{msg}</div>}
      <button className="btn btn-secondary btn-sm" onClick={createGroup} disabled={loading}>
        + Nouveau groupe
      </button>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        {groups.map((g) => (
          <div key={g.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{g.name}</strong>
                <span style={{ color: '#64748b' }}> · {g.kind}</span>
                {g.parent_group_id && <span style={{ color: '#94a3b8' }}> · sous-groupe</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingGroup(g)}>
                  Membres
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleGroupActive(g)}>
                  {g.is_active ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteGroup(g)}
                  disabled={loading}
                >
                  Supprimer
                </button>
              </div>
            </div>
            <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 4 }}>
              {Array.isArray(g.members) ? `${g.members.length} membre(s)` : '0 membre'} ·{' '}
              {Array.isArray(g.scopes) ? `${g.scopes.length} scope(s)` : '0 scope'}
            </div>
          </div>
        ))}
      </div>
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
    </div>
  );
}
