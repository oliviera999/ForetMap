import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

function ProfilesAdminView() {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setErr('');
    const [profileRows, userRows] = await Promise.all([
      api('/api/rbac/profiles'),
      api('/api/rbac/users'),
    ]);
    const normalized = Array.isArray(profileRows) ? profileRows : [];
    setRoles(normalized.map((r) => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] })));
    setCatalog(normalized[0]?.catalog || []);
    setUsers(Array.isArray(userRows) ? userRows : []);
    setSelectedRoleId((prev) => prev ?? normalized[0]?.id ?? null);
  };

  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const selectedRole = useMemo(
    () => roles.find((r) => Number(r.id) === Number(selectedRoleId)) || null,
    [roles, selectedRoleId]
  );

  const saveRoleName = async (role) => {
    const displayName = window.prompt('Nouveau nom du profil', role.display_name || '');
    if (!displayName || !displayName.trim()) return;
    setLoading(true);
    setErr('');
    try {
      await api(`/api/rbac/profiles/${role.id}`, 'PATCH', { display_name: displayName.trim(), rank: role.rank });
      setMsg('Nom du profil mis à jour');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur mise à jour profil');
    }
    setLoading(false);
  };

  const createRole = async () => {
    const slug = window.prompt('Slug du nouveau profil (ex: eleve_mentor)', '');
    if (!slug || !slug.trim()) return;
    const displayName = window.prompt('Nom du profil', slug.trim());
    if (!displayName || !displayName.trim()) return;
    setLoading(true);
    setErr('');
    try {
      await api('/api/rbac/profiles', 'POST', { slug: slug.trim(), display_name: displayName.trim(), rank: 150 });
      setMsg('Profil créé');
      await load();
    } catch (e) {
      setErr(e.message || 'Erreur création profil');
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

  return (
    <div className="fade-in">
      <h2 className="section-title">🛡️ Gestionnaire de profils</h2>
      <p className="section-sub">Admin : profils, permissions, PIN et attribution utilisateurs.</p>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {msg && <div className="auth-success">{msg}</div>}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Profils</h3>
          <button className="btn btn-secondary btn-sm" onClick={createRole} disabled={loading} style={{ marginBottom: 10 }}>
            + Créer un profil
          </button>
          {roles.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <button className={`btn btn-sm ${Number(selectedRoleId) === Number(r.id) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedRoleId(r.id)}>
                {r.display_name}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => saveRoleName(r)} disabled={loading}>Renommer</button>
            </div>
          ))}
          {selectedRole && (
            <div style={{ marginTop: 8 }}>
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
          {selectedRole && catalog.map((perm) => {
            const current = (selectedRole.permissions || []).find((p) => p.key === perm.key);
            return (
              <div key={perm.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', marginBottom: 6 }}>
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
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Attribution des profils</h3>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {users.map((u) => (
            <div key={`${u.user_type}-${u.id}`} style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div>
                <strong>{u.display_name}</strong> <span style={{ color: '#6b7280' }}>({u.user_type})</span>
              </div>
              <select value={u.role_id || ''} onChange={(e) => assignRole(u.user_type, u.id, parseInt(e.target.value, 10))} disabled={loading}>
                <option value="">Aucun profil</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { ProfilesAdminView };
