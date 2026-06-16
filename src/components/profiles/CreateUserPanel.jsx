import React from 'react';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';

/**
 * Panneau « Création unitaire d'utilisateur » (administration des profils).
 * Extrait de profiles-views.jsx (O6) — présentationnel pur : tout l’état et les
 * handlers sont fournis par ProfilesAdminView via les props. Comportement inchangé.
 */
function CreateUserPanel({
  roleTerms,
  affiliationOptions,
  isAdmin,
  canCreateUsers,
  createRole,
  createFirstName,
  createLastName,
  createPassword,
  createPseudo,
  createEmail,
  createDescription,
  createAffiliation,
  createLoading,
  setCreateRole,
  setCreateFirstName,
  setCreateLastName,
  setCreatePassword,
  setCreatePseudo,
  setCreateEmail,
  setCreateDescription,
  setCreateAffiliation,
  createUser,
}) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
        opacity: canCreateUsers ? 1 : 0.65,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--forest)' }}>
        Création unitaire d&apos;utilisateur
      </h3>
      <p style={{ margin: '0 0 10px', fontSize: '.85rem', color: '#6b7280' }}>
        Créez un compte sans import. Action réservée aux sessions élevées (PIN).
      </p>
      <div className="profiles-admin-create-grid">
        <div className="field" style={{ margin: 0 }}>
          <label>Profil</label>
          <select
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          >
            <option value="eleve_novice">{roleTerms.studentSingular}</option>
            <option value="prof">{roleTerms.teacherShort}</option>
            {isAdmin && <option value="admin">Admin</option>}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Prénom</label>
          <input
            value={createFirstName}
            onChange={(e) => setCreateFirstName(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Nom</label>
          <input
            value={createLastName}
            onChange={(e) => setCreateLastName(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Mot de passe</label>
          <input
            type="password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Pseudo (optionnel)</label>
          <input
            value={createPseudo}
            onChange={(e) => setCreatePseudo(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Email (optionnel)</label>
          <input
            type="email"
            value={createEmail}
            onChange={(e) => setCreateEmail(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Description (optionnel)</label>
          <MarkdownTextarea
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            disabled={!canCreateUsers || createLoading}
            rows={2}
            maxLength={300}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Affiliation {roleTerms.studentSingular}</label>
          <select
            value={createAffiliation}
            onChange={(e) => setCreateAffiliation(e.target.value)}
            disabled={!canCreateUsers || createLoading || createRole !== 'eleve_novice'}
          >
            {affiliationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={createUser}
          disabled={!canCreateUsers || createLoading}
        >
          {createLoading ? 'Création…' : `Créer ${canCreateUsers ? '' : '(PIN requis)'}`}
        </button>
      </div>
    </div>
  );
}

export { CreateUserPanel };
