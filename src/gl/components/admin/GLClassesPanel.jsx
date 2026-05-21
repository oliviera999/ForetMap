import React, { useState } from 'react';
import { apiGL } from '../../services/apiGL.js';

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
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
    } finally {
      setBusy(false);
    }
  }

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
    <section className="gl-admin-section">
      <h3>Classes</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <form className="gl-form" onSubmit={createClass}>
        <label>
          Nom
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Établissement
          <input value={school} onChange={(event) => setSchool(event.target.value)} />
        </label>
        <button type="submit" disabled={busy}>Créer la classe</button>
      </form>

      <div className="gl-admin-table-wrap">
        <table className="gl-admin-table">
          <thead>
            <tr>
              <th>Classe</th>
              <th>Établissement</th>
              <th>Joueurs</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((item) => {
              const isEditing = editId === Number(item.id);
              return (
                <tr key={item.id}>
                  <td>{isEditing ? <input value={editName} onChange={(e) => setEditName(e.target.value)} /> : item.name}</td>
                  <td>{isEditing ? <input value={editSchool} onChange={(e) => setEditSchool(e.target.value)} /> : (item.school || '—')}</td>
                  <td>{Number(item.players_count || 0)}</td>
                  <td>{Number(item.is_active) ? 'Actif' : 'Inactif'}</td>
                  <td className="gl-admin-actions-cell">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={saveEdit} disabled={busy}>Enregistrer</button>
                        <button type="button" className="gl-btn-secondary" onClick={() => setEditId(null)} disabled={busy}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(item)} disabled={busy}>Modifier</button>
                        <button type="button" className="gl-btn-secondary" onClick={() => toggleActive(item)} disabled={busy}>
                          {Number(item.is_active) ? 'Désactiver' : 'Activer'}
                        </button>
                        <button type="button" className="gl-btn-danger" onClick={() => deleteClass(item)} disabled={busy}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {classes.length === 0 ? (
              <tr>
                <td colSpan={5}>Aucune classe.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
