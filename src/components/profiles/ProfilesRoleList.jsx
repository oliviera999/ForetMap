import React from 'react';

/**
 * Liste des profils RBAC (colonne gauche de l'admin des profils) — extraite de `ProfilesAdminView` (O5/O6).
 *
 * Réordonnancement ↑/↓ (`onReorder(id, ±1)`), sélection (`onSelect(id)`), édition rapide
 * (`onEditDetails(role)`), duplication (`onDuplicate(role)`) et création (`onCreate`). Présentation pure :
 * tout l'état et les effets restent dans le composant parent.
 */
export function ProfilesRoleList({
  roles = [],
  loading = false,
  selectedRoleId = null,
  canEditRoleDefinition = false,
  onCreate,
  onSelect,
  onReorder,
  onEditDetails,
  onDuplicate,
}) {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>Profils</h3>
      <p style={{ margin: '0 0 10px', fontSize: '.8rem', color: '#6b7280', lineHeight: 1.45 }}>
        Utilisez ↑ ↓ pour définir l’ordre d’affichage (liste ci-dessous, menus d’attribution et
        progression n3beur alignés sur cet ordre).
      </p>
      <button
        className="btn btn-secondary btn-sm"
        onClick={onCreate}
        disabled={loading}
        style={{ marginBottom: 10 }}
      >
        + Créer un profil
      </button>
      {roles.map((r, idx) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 28, padding: '2px 8px', lineHeight: 1.1 }}
              aria-label={`Monter « ${r.display_name} » dans la liste`}
              title="Monter"
              disabled={loading || idx === 0}
              onClick={() => onReorder(r.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 28, padding: '2px 8px', lineHeight: 1.1 }}
              aria-label={`Descendre « ${r.display_name} » dans la liste`}
              title="Descendre"
              disabled={loading || idx === roles.length - 1}
              onClick={() => onReorder(r.id, 1)}
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            className={`btn btn-sm foretmap-emoji-text-mixed ${Number(selectedRoleId) === Number(r.id) ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onSelect(r.id)}
          >
            {(r.emoji ? `${r.emoji} ` : '') + r.display_name}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onEditDetails(r)}
            disabled={loading}
          >
            Modifier
          </button>
          {canEditRoleDefinition && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onDuplicate(r)}
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
    </>
  );
}
