import React from 'react';

/**
 * Lignes de permissions d'un profil — extraites de `ProfilesAdminView` (O5/O6).
 *
 * Rend le catalogue de permissions (hors `tasks.propose` masqué pour les paliers n3beur configurables,
 * réglé ailleurs), chaque ligne avec une case « Actif » (`onToggle(key, checked)`). Toute permission
 * active est accordée directement au rôle (plus de dimension d'élévation/PIN). Présentation pure.
 */
export function ProfilesPermissionRows({
  catalog = [],
  rolePermissions = [],
  loading = false,
  hideTasksPropose = false,
  onToggle,
}) {
  return catalog
    .filter((perm) => !(hideTasksPropose && perm.key === 'tasks.propose'))
    .map((perm) => {
      const current = (rolePermissions || []).find((p) => p.key === perm.key);
      return (
        <div className="profiles-admin-perm-row" key={perm.key}>
          <div>
            <div style={{ fontSize: '.86rem', fontWeight: 600 }}>{perm.label}</div>
            <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{perm.key}</div>
          </div>
          <label style={{ fontSize: '.8rem' }}>
            <input
              type="checkbox"
              checked={!!current}
              onChange={(e) => onToggle(perm.key, e.target.checked)}
              disabled={loading}
            />{' '}
            Actif
          </label>
        </div>
      );
    });
}
