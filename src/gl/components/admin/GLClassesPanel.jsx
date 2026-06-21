import React, { useCallback, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLBadge } from '../ui/GLBadge.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';

export function GLClassesPanel({ classes, onReload }) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSchool, setEditSchool] = useState('');
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
    setError('');
    setInfo('');
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/classes/${editId}`, 'PUT', {
        name: editName,
        school: editSchool || null,
      });
      setEditId(null);
      setEditName('');
      setEditSchool('');
      setInfo('Classe mise à jour.');
      await onReload?.();
      return { name: editName, school: editSchool };
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const editDraft = { name: editName, school: editSchool };
  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: editDraft,
    resetKey: editId,
    enabled: Boolean(editId) && String(editName || '').trim().length > 0,
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
    const ok = window.confirm(`Supprimer la classe « ${item.name} » ?`);
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
