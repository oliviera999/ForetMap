import React from 'react';

/**
 * Lignes de permissions d'un profil (matrice Actif/PIN) — extraites de `ProfilesAdminView` (O5/O6).
 *
 * Rend le catalogue de permissions (hors `tasks.propose` masqué pour les paliers n3beur configurables,
 * réglé ailleurs), chaque ligne avec une case « Actif » (`onToggle(key, checked)`) et « PIN »
 * (`onToggleElevation(key, checked)`, désactivée si la permission n'est pas active). Présentation pure.
 */
export function ProfilesPermissionRows({
  catalog = [],
  rolePermissions = [],
  loading = false,
  hideTasksPropose = false,
  onToggle,
  onToggleElevation,
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
          <label style={{ fontSize: '.8rem' }}>
            <input
              type="checkbox"
              checked={!!current?.requires_elevation}
              onChange={(e) => onToggleElevation(perm.key, e.target.checked)}
              disabled={!current || loading}
            />{' '}
            PIN
          </label>
        </div>
      );
    });
}
