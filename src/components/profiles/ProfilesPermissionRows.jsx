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
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)' }}>
              {perm.label}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{perm.key}</div>
          </div>
          <label style={{ fontSize: 'var(--text-sm)' }}>
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
