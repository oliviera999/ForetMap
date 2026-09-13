import { useMemo, useState } from 'react';
import { api } from '../../services/api';
import { validateUserIdentityFields } from '../../utils/profilesUserFields.js';
import {
  buildUnitaryCreateRoleOptions,
  isStudentUnitaryCreateRole,
} from '../../utils/createUserRoleOptions.js';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';

/**
 * Panneau « Création unitaire d'utilisateur » (administration des profils).
 * Autonome (§6.1) : possède l'état du formulaire et l'appel `POST /api/rbac/users`.
 * Le parent ne fournit que le contexte (`roleTerms`, `affiliationOptions`, droits)
 * et les retours (`setErr`/`setMsg` vers les bandeaux, `onCreated()` → rechargement).
 */
function CreateUserPanel({
  roleTerms,
  affiliationOptions,
  roles = [],
  groupOptions = [],
  isAdmin,
  canCreateTeacherRoles = false,
  canCreateUsers,
  setErr,
  setMsg,
  onCreated,
}) {
  const roleOptions = useMemo(
    () =>
      buildUnitaryCreateRoleOptions({
        roles,
        isAdmin,
        canCreateTeacherRoles: canCreateTeacherRoles || isAdmin,
      }),
    [roles, isAdmin, canCreateTeacherRoles],
  );
  const [createRole, setCreateRole] = useState(() => roleOptions[0]?.value || 'eleve_novice');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPseudo, setCreatePseudo] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAffiliation, setCreateAffiliation] = useState('both');
  const [createGroupId, setCreateGroupId] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const isStudentRole = isStudentUnitaryCreateRole(createRole);
  const showGroupField = isStudentRole && Array.isArray(groupOptions) && groupOptions.length > 0;

  const createUser = async () => {
    const fieldError = validateUserIdentityFields({
      firstName: createFirstName,
      lastName: createLastName,
      pseudo: createPseudo,
      email: createEmail,
      description: createDescription,
      password: createPassword,
      requirePassword: true,
    });
    if (fieldError) {
      setErr(fieldError);
      return;
    }
    if (createRole === 'admin' && !isAdmin) {
      setErr('Seul un admin peut créer un admin');
      return;
    }
    if (
      (createRole === 'prof' || createRole === 'prof_classe') &&
      !isAdmin &&
      !canCreateTeacherRoles
    ) {
      setErr('Seuls n3boss et administrateur peuvent créer un compte enseignant');
      return;
    }
    setCreateLoading(true);
    setErr('');
    try {
      const body = {
        role_slug: createRole,
        first_name: createFirstName.trim(),
        last_name: createLastName.trim(),
        password: createPassword,
        pseudo: createPseudo.trim() || null,
        email: createEmail.trim() || null,
        description: createDescription.trim() || null,
        affiliation: isStudentRole ? createAffiliation : 'both',
      };
      if (isStudentRole && createGroupId) {
        body.group_id = createGroupId;
      }
      const result = await api('/api/rbac/users', 'POST', body);
      setMsg(
        `Utilisateur créé : ${result.first_name} ${result.last_name} (${result.role_display_name || result.role_slug})`,
      );
      setCreateFirstName('');
      setCreateLastName('');
      setCreatePassword('');
      setCreatePseudo('');
      setCreateEmail('');
      setCreateDescription('');
      setCreateAffiliation('both');
      setCreateGroupId('');
      if (!roleOptions.some((o) => o.value === createRole)) {
        setCreateRole(roleOptions[0]?.value || 'eleve_novice');
      }
      await onCreated();
    } catch (e) {
      setErr(e.message || 'Erreur création utilisateur');
    }
    setCreateLoading(false);
  };

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
      <h3 style={{ margin: '0 0 8px', fontSize: 'var(--text-base)', color: 'var(--forest)' }}>
        Création unitaire d&apos;utilisateur
      </h3>
      <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
        Créez un compte sans import. Action réservée aux profils disposant de la permission de
        gestion des utilisateurs. Tous les profils ForetMap sont proposés (selon vos droits).
      </p>
      <div className="profiles-admin-create-grid">
        <div className="field" style={{ margin: 0 }}>
          <label>Profil</label>
          <select
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value)}
            disabled={!canCreateUsers || createLoading}
          >
            {roleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
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
            disabled={!canCreateUsers || createLoading || !isStudentRole}
          >
            {affiliationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {showGroupField && (
          <div className="field" style={{ margin: 0 }}>
            <label>Groupe (recommandé / requis hors vue globale)</label>
            <select
              value={createGroupId}
              onChange={(e) => setCreateGroupId(e.target.value)}
              disabled={!canCreateUsers || createLoading}
            >
              <option value="">— Aucun —</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.slug || g.id}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={createUser}
          disabled={!canCreateUsers || createLoading}
        >
          {createLoading ? 'Création…' : `Créer ${canCreateUsers ? '' : '(permission requise)'}`}
        </button>
      </div>
    </div>
  );
}

export { CreateUserPanel };
