import { useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';
import { useDebouncedAutoSave } from '../../../shared/hooks/useDebouncedAutoSave.js';
import { GLBadge } from '../ui/GLBadge.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GL_TEAM_POLICIES, GL_TEAM_POLICY_BY_ID } from '../../utils/glTeamCompositionRecipes.js';

const DEFAULT_TEAM_POLICY = 'reshuffle_each';
const DEFAULT_TEAM_SIZE = 4;

function policyLabel(item) {
  const policy = GL_TEAM_POLICY_BY_ID[item.team_policy]?.label || 'Rebrasser à chaque partie';
  const size = Number(item.team_size_default) || DEFAULT_TEAM_SIZE;
  return `${policy} · ${size} par équipe`;
}

export function GLClassesPanel({ classes, onReload }) {
  const { confirm } = useAppDialogs();
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSchool, setEditSchool] = useState('');
  const [editTeamPolicy, setEditTeamPolicy] = useState(DEFAULT_TEAM_POLICY);
  const [editTeamSize, setEditTeamSize] = useState(String(DEFAULT_TEAM_SIZE));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function createClass(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/admin/classes', 'POST', { name, school });
      setName('');
      setSchool('');
      setInfo('Classe créée.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item) {
    setEditId(Number(item.id));
    setEditName(item.name || '');
    setEditSchool(item.school || '');
    setEditTeamPolicy(
      GL_TEAM_POLICY_BY_ID[item.team_policy] ? item.team_policy : DEFAULT_TEAM_POLICY,
    );
    setEditTeamSize(String(Number(item.team_size_default) || DEFAULT_TEAM_SIZE));
    setError('');
    setInfo('');
  }

  const editTeamSizeValid = (() => {
    const n = Number(editTeamSize);
    return Number.isInteger(n) && n >= 2 && n <= 12;
  })();

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/classes/${editId}`, 'PUT', {
        name: editName,
        school: editSchool || null,
        teamPolicy: editTeamPolicy,
        teamSizeDefault: Number(editTeamSize),
      });
      setEditId(null);
      setEditName('');
      setEditSchool('');
      setInfo('Classe mise à jour.');
      await onReload?.();
      return {
        name: editName,
        school: editSchool,
        teamPolicy: editTeamPolicy,
        teamSizeDefault: editTeamSize,
      };
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const editDraft = {
    name: editName,
    school: editSchool,
    teamPolicy: editTeamPolicy,
    teamSizeDefault: editTeamSize,
  };
  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: editDraft,
    resetKey: editId,
    enabled: Boolean(editId) && String(editName || '').trim().length > 0 && editTeamSizeValid,
    onSave: saveEdit,
  });

  async function toggleActive(item) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const next = !Number(item.is_active);
      await apiGL(`/api/gl/admin/classes/${item.id}`, 'PUT', { isActive: next });
      setInfo(next ? 'Classe activée.' : 'Classe désactivée.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Action impossible');
    } finally {
      setBusy(false);
    }
  }

  async function deleteClass(item) {
    const ok = await confirm({ message: `Supprimer la classe « ${item.name} » ?`, danger: true });
    if (!ok) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/classes/${item.id}`, 'DELETE');
      setInfo('Classe supprimée.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Classes</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {saveError ? <p className="gl-error">{saveError}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <form className="gl-form" onSubmit={createClass}>
        <GLField label="Nom">
          <GLInput value={name} onChange={(event) => setName(event.target.value)} required />
        </GLField>
        <GLField label="Établissement">
          <GLInput value={school} onChange={(event) => setSchool(event.target.value)} />
        </GLField>
        <GLButton type="submit" disabled={busy}>
          Créer la classe
        </GLButton>
      </form>

      <GLDataList
        columns={[
          { key: 'name', label: 'Classe' },
          { key: 'school', label: 'Établissement' },
          { key: 'players', label: 'Joueurs' },
          { key: 'teams', label: 'Équipes' },
          { key: 'foretmap', label: 'Groupe ForetMap' },
          { key: 'status', label: 'Statut' },
          { key: 'actions', label: 'Actions' },
        ]}
        emptyLabel="Aucune classe."
        rows={classes.map((item) => {
          const isEditing = editId === Number(item.id);
          const actions = isEditing ? (
            <>
              <AutoSaveStatus status={saveStatus} className="gl-hint" />
              <GLButton
                type="button"
                variant="secondary"
                onClick={() => setEditId(null)}
                disabled={busy}
              >
                Annuler
              </GLButton>
            </>
          ) : (
            <>
              <GLButton type="button" onClick={() => startEdit(item)} disabled={busy}>
                Modifier
              </GLButton>
              <GLButton
                type="button"
                variant="secondary"
                onClick={() => toggleActive(item)}
                disabled={busy}
              >
                {Number(item.is_active) ? 'Désactiver' : 'Activer'}
              </GLButton>
              <GLButton
                type="button"
                variant="danger"
                onClick={() => deleteClass(item)}
                disabled={busy}
              >
                Supprimer
              </GLButton>
            </>
          );
          const statusLabel = Number(item.is_active) ? 'Actif' : 'Inactif';
          return {
            key: item.id,
            desktopCells: (
              <>
                <td>
                  {isEditing ? (
                    <GLInput value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    item.name
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <GLInput value={editSchool} onChange={(e) => setEditSchool(e.target.value)} />
                  ) : (
                    item.school || '—'
                  )}
                </td>
                <td>{Number(item.players_count || 0)}</td>
                <td>
                  {isEditing ? (
                    <div className="gl-class-team-policy-edit">
                      <GLSelect
                        value={editTeamPolicy}
                        onChange={(e) => setEditTeamPolicy(e.target.value)}
                        aria-label="Politique d’équipes"
                      >
                        {GL_TEAM_POLICIES.map((policy) => (
                          <option key={policy.id} value={policy.id} title={policy.summary}>
                            {policy.label}
                          </option>
                        ))}
                      </GLSelect>
                      <GLInput
                        type="number"
                        min="2"
                        max="12"
                        value={editTeamSize}
                        onChange={(e) => setEditTeamSize(e.target.value)}
                        aria-label="Taille d’équipe par défaut"
                        aria-invalid={!editTeamSizeValid}
                      />
                    </div>
                  ) : (
                    <span className="gl-hint">{policyLabel(item)}</span>
                  )}
                </td>
                <td>
                  {item.foretmap_group_id ? (
                    <span className="gl-hint" title={item.foretmap_group_name || ''}>
                      Groupe FM
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <GLBadge tone={Number(item.is_active) ? 'success' : 'danger'}>
                    {statusLabel}
                  </GLBadge>
                </td>
                <td className="gl-admin-actions-cell">{actions}</td>
              </>
            ),
            mobileCells: (
              <>
                <div className="gl-data-card-row">
                  <span className="gl-data-card-label">Classe</span>
                  <strong>{item.name}</strong>
                </div>
                <div className="gl-data-card-row">
                  <span className="gl-data-card-label">Établissement</span>
                  <span>{item.school || '—'}</span>
                </div>
                <div className="gl-data-card-row">
                  <span className="gl-data-card-label">Joueurs</span>
                  <span>{Number(item.players_count || 0)}</span>
                </div>
                <div className="gl-data-card-row">
                  <span className="gl-data-card-label">Équipes</span>
                  <span>{policyLabel(item)}</span>
                </div>
                <div className="gl-data-card-row">
                  <span className="gl-data-card-label">Groupe ForetMap</span>
                  <span>{item.foretmap_group_id ? item.foretmap_group_name || 'Lié' : '—'}</span>
                </div>
                <div className="gl-data-card-row">
                  <span className="gl-data-card-label">Statut</span>
                  <GLBadge tone={Number(item.is_active) ? 'success' : 'danger'}>
                    {statusLabel}
                  </GLBadge>
                </div>
                <div className="gl-data-card-actions">{actions}</div>
              </>
            ),
          };
        })}
      />
    </section>
  );
}
