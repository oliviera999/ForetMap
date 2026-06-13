import React, { useMemo, useState } from 'react';
import { DialogShell } from '../../../components/DialogShell.jsx';
import { apiGL } from '../../services/apiGL.js';
import { GLBadge } from '../ui/GLBadge.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import {
  toBool,
  buildClassesById,
  playerClassName,
  playerDisplayName,
} from '../../utils/glPlayersPanel.js';

export function GLPlayersPanel({
  classes,
  players,
  classFilter,
  onClassFilterChange,
  onReload,
  canImpersonate = false,
  onImpersonationApplied = null,
  impersonateGameId = null,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ firstName: '', lastName: '', pseudo: '', classId: '' });
  const [resetPlayer, setResetPlayer] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [create, setCreate] = useState({
    firstName: '',
    lastName: '',
    pseudo: '',
    classId: '',
    password: '',
    passwordMustReset: false,
  });

  const classesById = useMemo(() => buildClassesById(classes), [classes]);

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

  async function resetPlayerPassword(player) {
    const next = String(resetPasswordValue || '').trim();
    if (!next) {
      setError('Le nouveau mot de passe est requis.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/admin/players/${player.id}/reset-pin`, 'POST', { pin: next });
      setInfo('Mot de passe réinitialisé.');
      setResetPlayer(null);
      setResetPasswordValue('');
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

  async function impersonatePlayer(player) {
    if (!canImpersonate) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const body = {
        userType: 'gl_player',
        userId: String(player.id),
      };
      const gameId = impersonateGameId != null ? Number(impersonateGameId) : null;
      if (Number.isFinite(gameId) && gameId > 0) {
        body.gameId = gameId;
      }
      const payload = await apiGL('/api/gl/auth/admin/impersonate', 'POST', body);
      if (!payload?.authToken) {
        setError('Réponse serveur invalide');
        return;
      }
      if (typeof onImpersonationApplied === 'function') {
        onImpersonationApplied(payload);
      }
      setInfo(`Prise de contrôle active: ${player.pseudo}`);
    } catch (err) {
      setError(err.message || 'Prise de contrôle impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Joueurs</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <form className="gl-form" onSubmit={createPlayer}>
        <div className="gl-admin-grid-2">
          <GLField label="Prénom">
            <GLInput value={create.firstName} onChange={(e) => setCreate((p) => ({ ...p, firstName: e.target.value }))} required />
          </GLField>
          <GLField label="Nom">
            <GLInput value={create.lastName} onChange={(e) => setCreate((p) => ({ ...p, lastName: e.target.value }))} required />
          </GLField>
          <GLField label="Pseudo">
            <GLInput value={create.pseudo} onChange={(e) => setCreate((p) => ({ ...p, pseudo: e.target.value }))} required />
          </GLField>
          <GLField label="Classe">
            <GLSelect value={create.classId} onChange={(e) => setCreate((p) => ({ ...p, classId: e.target.value }))} required>
              <option value="">Choisir</option>
              {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </GLSelect>
          </GLField>
          <GLField label="Mot de passe (optionnel)">
            <GLInput value={create.password} onChange={(e) => setCreate((p) => ({ ...p, password: e.target.value }))} />
          </GLField>
          <GLField label="Forcer changement mot de passe">
            <GLSelect
              value={create.passwordMustReset ? 'yes' : 'no'}
              onChange={(e) => setCreate((p) => ({ ...p, passwordMustReset: e.target.value === 'yes' }))}
            >
              <option value="no">Non</option>
              <option value="yes">Oui</option>
            </GLSelect>
          </GLField>
        </div>
        <GLButton type="submit" disabled={busy}>Créer le joueur</GLButton>
      </form>

      <div className="gl-inline-actions">
        <GLField label="Filtrer par classe">
          <GLSelect value={classFilter || ''} onChange={(e) => onClassFilterChange?.(e.target.value)}>
            <option value="">Toutes</option>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </GLSelect>
        </GLField>
      </div>

      <GLDataList
        columns={[
          { key: 'pseudo', label: 'Pseudo' },
          { key: 'nom', label: 'Nom' },
          { key: 'classe', label: 'Classe' },
          { key: 'actif', label: 'Actif' },
          { key: 'reset', label: 'Reset mdp' },
          { key: 'actions', label: 'Actions' },
        ]}
        emptyLabel="Aucun joueur."
        rows={players.map((player) => {
          const isEditing = editId === Number(player.id);
          const className = playerClassName(player, classesById);
          const displayName = playerDisplayName(player);
          const actionButtons = isEditing ? (
            <>
              <GLButton type="button" onClick={saveEdit} disabled={busy}>Enregistrer</GLButton>
              <GLButton type="button" variant="secondary" onClick={() => setEditId(null)} disabled={busy}>Annuler</GLButton>
            </>
          ) : (
            <>
              <GLButton type="button" onClick={() => startEdit(player)} disabled={busy}>Modifier</GLButton>
              <GLButton type="button" variant="secondary" onClick={() => toggleActive(player)} disabled={busy}>
                {toBool(player.is_active) ? 'Désactiver' : 'Activer'}
              </GLButton>
              <GLButton type="button" variant="secondary" onClick={() => setResetPlayer(player)} disabled={busy}>Reset mdp</GLButton>
              {canImpersonate ? (
                <GLButton type="button" variant="secondary" onClick={() => impersonatePlayer(player)} disabled={busy}>
                  Voir comme
                </GLButton>
              ) : null}
              <GLButton type="button" variant="danger" onClick={() => deletePlayer(player)} disabled={busy}>Supprimer</GLButton>
            </>
          );

          return {
            key: player.id,
            desktopCells: (
              <>
                <td>{isEditing ? <GLInput value={edit.pseudo} onChange={(e) => setEdit((p) => ({ ...p, pseudo: e.target.value }))} /> : player.pseudo}</td>
                <td>
                  {isEditing ? (
                    <div className="gl-admin-inline-edit">
                      <GLInput value={edit.firstName} onChange={(e) => setEdit((p) => ({ ...p, firstName: e.target.value }))} />
                      <GLInput value={edit.lastName} onChange={(e) => setEdit((p) => ({ ...p, lastName: e.target.value }))} />
                    </div>
                  ) : (
                    displayName
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <GLSelect value={edit.classId} onChange={(e) => setEdit((p) => ({ ...p, classId: e.target.value }))}>
                      {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                    </GLSelect>
                  ) : (
                    className
                  )}
                </td>
                <td><GLBadge tone={toBool(player.is_active) ? 'success' : 'danger'}>{toBool(player.is_active) ? 'Oui' : 'Non'}</GLBadge></td>
                <td><GLBadge tone={toBool(player.password_must_reset) ? 'info' : 'neutral'}>{toBool(player.password_must_reset) ? 'Oui' : 'Non'}</GLBadge></td>
                <td className="gl-admin-actions-cell">{actionButtons}</td>
              </>
            ),
            mobileCells: (
              <>
                <div className="gl-data-card-row"><span className="gl-data-card-label">Pseudo</span><strong>{player.pseudo}</strong></div>
                <div className="gl-data-card-row"><span className="gl-data-card-label">Nom</span><span>{displayName}</span></div>
                <div className="gl-data-card-row"><span className="gl-data-card-label">Classe</span><span>{className}</span></div>
                <div className="gl-data-card-row"><span className="gl-data-card-label">Actif</span><GLBadge tone={toBool(player.is_active) ? 'success' : 'danger'}>{toBool(player.is_active) ? 'Oui' : 'Non'}</GLBadge></div>
                <div className="gl-data-card-row"><span className="gl-data-card-label">Reset mdp</span><GLBadge tone={toBool(player.password_must_reset) ? 'info' : 'neutral'}>{toBool(player.password_must_reset) ? 'Oui' : 'Non'}</GLBadge></div>
                <div className="gl-data-card-actions">{actionButtons}</div>
              </>
            ),
          };
        })}
      />

      <DialogShell
        open={!!resetPlayer}
        onClose={() => {
          setResetPlayer(null);
          setResetPasswordValue('');
        }}
        overlayClassName="fm-modal-overlay"
        dialogClassName="fm-modal-panel animate-pop gl-action-modal-body"
        ariaLabel="Réinitialiser mot de passe joueur"
      >
        <h4>Réinitialiser {resetPlayer?.pseudo}</h4>
        <GLField label="Nouveau mot de passe">
          <GLInput
            type="password"
            value={resetPasswordValue}
            onChange={(event) => setResetPasswordValue(event.target.value)}
            autoComplete="new-password"
          />
        </GLField>
        <div className="gl-inline-actions">
          <GLButton type="button" onClick={() => resetPlayerPassword(resetPlayer)}>
            Valider
          </GLButton>
          <GLButton
            type="button"
            variant="secondary"
            onClick={() => {
              setResetPlayer(null);
              setResetPasswordValue('');
            }}
          >
            Annuler
          </GLButton>
        </div>
      </DialogShell>
    </section>
  );
}
