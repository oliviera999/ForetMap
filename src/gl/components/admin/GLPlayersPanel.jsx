import React, { useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';

function toBool(value) {
  return !!Number(value);
}

export function GLPlayersPanel({ classes, players, classFilter, onClassFilterChange, onReload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ firstName: '', lastName: '', pseudo: '', classId: '' });
  const [create, setCreate] = useState({
    firstName: '',
    lastName: '',
    pseudo: '',
    classId: '',
    password: '',
    passwordMustReset: false,
  });

  const classesById = useMemo(() => {
    const next = new Map();
    for (const cls of classes) next.set(Number(cls.id), cls);
    return next;
  }, [classes]);

  async function createPlayer(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/admin/players', 'POST', {
        classId: Number(create.classId),
        firstName: create.firstName,
        lastName: create.lastName,
        pseudo: create.pseudo,
        password: create.password || undefined,
        passwordMustReset: create.passwordMustReset,
      });
      setCreate({ firstName: '', lastName: '', pseudo: '', classId: create.classId, password: '', passwordMustReset: false });
      setInfo('Joueur créé.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(player) {
    setEditId(Number(player.id));
    setEdit({
      firstName: player.first_name || '',
      lastName: player.last_name || '',
      pseudo: player.pseudo || '',
      classId: String(player.class_id || ''),
    });
    setError('');
    setInfo('');
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/players/${editId}`, 'PUT', {
        firstName: edit.firstName,
        lastName: edit.lastName,
        pseudo: edit.pseudo,
        classId: Number(edit.classId),
      });
      setEditId(null);
      setInfo('Joueur mis à jour.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(player) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/players/${player.id}`, 'PUT', {
        isActive: !toBool(player.is_active),
      });
      setInfo(toBool(player.is_active) ? 'Joueur désactivé.' : 'Joueur activé.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Action impossible');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(player) {
    const next = window.prompt(`Nouveau mot de passe pour ${player.pseudo}`, '');
    if (!next) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/players/${player.id}/reset-pin`, 'POST', { pin: next });
      setInfo('Mot de passe réinitialisé.');
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function deletePlayer(player) {
    const ok = window.confirm(`Supprimer le joueur « ${player.pseudo} » ?`);
    if (!ok) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/players/${player.id}`, 'DELETE');
      setInfo('Joueur supprimé.');
      await onReload?.();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gl-admin-section">
      <h3>Joueurs</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <form className="gl-form" onSubmit={createPlayer}>
        <div className="gl-admin-grid-2">
          <label>
            Prénom
            <input value={create.firstName} onChange={(e) => setCreate((p) => ({ ...p, firstName: e.target.value }))} required />
          </label>
          <label>
            Nom
            <input value={create.lastName} onChange={(e) => setCreate((p) => ({ ...p, lastName: e.target.value }))} required />
          </label>
          <label>
            Pseudo
            <input value={create.pseudo} onChange={(e) => setCreate((p) => ({ ...p, pseudo: e.target.value }))} required />
          </label>
          <label>
            Classe
            <select value={create.classId} onChange={(e) => setCreate((p) => ({ ...p, classId: e.target.value }))} required>
              <option value="">Choisir</option>
              {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
          </label>
          <label>
            Mot de passe (optionnel)
            <input value={create.password} onChange={(e) => setCreate((p) => ({ ...p, password: e.target.value }))} />
          </label>
          <label>
            Forcer changement mot de passe
            <select
              value={create.passwordMustReset ? 'yes' : 'no'}
              onChange={(e) => setCreate((p) => ({ ...p, passwordMustReset: e.target.value === 'yes' }))}
            >
              <option value="no">Non</option>
              <option value="yes">Oui</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={busy}>Créer le joueur</button>
      </form>

      <div className="gl-inline-actions">
        <label>
          Filtrer par classe
          <select value={classFilter || ''} onChange={(e) => onClassFilterChange?.(e.target.value)}>
            <option value="">Toutes</option>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </select>
        </label>
      </div>

      <div className="gl-admin-table-wrap">
        <table className="gl-admin-table">
          <thead>
            <tr>
              <th>Pseudo</th>
              <th>Nom</th>
              <th>Classe</th>
              <th>Actif</th>
              <th>Reset mdp</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const isEditing = editId === Number(player.id);
              return (
                <tr key={player.id}>
                  <td>{isEditing ? <input value={edit.pseudo} onChange={(e) => setEdit((p) => ({ ...p, pseudo: e.target.value }))} /> : player.pseudo}</td>
                  <td>
                    {isEditing ? (
                      <div className="gl-admin-inline-edit">
                        <input value={edit.firstName} onChange={(e) => setEdit((p) => ({ ...p, firstName: e.target.value }))} />
                        <input value={edit.lastName} onChange={(e) => setEdit((p) => ({ ...p, lastName: e.target.value }))} />
                      </div>
                    ) : (
                      `${player.first_name || ''} ${player.last_name || ''}`.trim() || '—'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select value={edit.classId} onChange={(e) => setEdit((p) => ({ ...p, classId: e.target.value }))}>
                        {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                      </select>
                    ) : (
                      classesById.get(Number(player.class_id))?.name || player.class_name || '—'
                    )}
                  </td>
                  <td>{toBool(player.is_active) ? 'Oui' : 'Non'}</td>
                  <td>{toBool(player.password_must_reset) ? 'Oui' : 'Non'}</td>
                  <td className="gl-admin-actions-cell">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={saveEdit} disabled={busy}>Enregistrer</button>
                        <button type="button" className="gl-btn-secondary" onClick={() => setEditId(null)} disabled={busy}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(player)} disabled={busy}>Modifier</button>
                        <button type="button" className="gl-btn-secondary" onClick={() => toggleActive(player)} disabled={busy}>
                          {toBool(player.is_active) ? 'Désactiver' : 'Activer'}
                        </button>
                        <button type="button" className="gl-btn-secondary" onClick={() => resetPassword(player)} disabled={busy}>Reset mdp</button>
                        <button type="button" className="gl-btn-danger" onClick={() => deletePlayer(player)} disabled={busy}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {players.length === 0 ? (
              <tr>
                <td colSpan={6}>Aucun joueur.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
