import React, { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLVitalityAdjustButtons, GLVitalityCounts } from '../GLVitalityDisplay.jsx';

export function GLGameRosterPanel({
  gameId,
  teams,
  refreshKey,
  onRosterChanged,
  vitalityEnabled = false,
  canImpersonate = false,
  onImpersonationApplied = null,
}) {
  const [rows, setRows] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState({});
  const [busy, setBusy] = useState(false);
  const [vitalityBusyId, setVitalityBusyId] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function loadRoster() {
    if (!gameId) return;
    setError('');
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/roster`);
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setSelectedTeams(
        list.reduce((acc, item) => {
          acc[item.id] = item.teamId ? String(item.teamId) : '';
          return acc;
        }, {}),
      );
    } catch (err) {
      setError(err.message || 'Chargement des effectifs impossible');
    }
  }

  useEffect(() => {
    loadRoster();
  }, [gameId, refreshKey]);

  async function assignPlayer(playerId) {
    const teamId = Number(selectedTeams[playerId] || 0);
    if (!teamId) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/games/${gameId}/roster/assign`, 'POST', {
        playerId: Number(playerId),
        teamId,
      });
      setInfo('Affectation enregistrée.');
      await loadRoster();
      await onRosterChanged?.();
    } catch (err) {
      setError(err.message || 'Affectation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function unassignPlayer(playerId) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/games/${gameId}/roster/unassign`, 'POST', {
        playerId: Number(playerId),
      });
      setInfo('Joueur retiré de l’équipe.');
      await loadRoster();
      await onRosterChanged?.();
    } catch (err) {
      setError(err.message || 'Retrait impossible');
    } finally {
      setBusy(false);
    }
  }

  async function impersonatePlayer(player) {
    if (!canImpersonate || !player?.id) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const body = {
        userType: 'gl_player',
        userId: String(player.id),
      };
      const gid = gameId != null ? Number(gameId) : null;
      if (Number.isFinite(gid) && gid > 0) {
        body.gameId = gid;
      }
      const payload = await apiGL('/api/gl/auth/admin/impersonate', 'POST', body);
      if (!payload?.authToken) {
        setError('Réponse serveur invalide');
        return;
      }
      if (typeof onImpersonationApplied === 'function') {
        onImpersonationApplied(payload);
      }
      setInfo(`Prise de contrôle active : ${player.pseudo}`);
    } catch (err) {
      setError(err.message || 'Prise de contrôle impossible');
    } finally {
      setBusy(false);
    }
  }

  async function adjustPlayerVitality(playerId, deltas) {
    setVitalityBusyId(playerId);
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/games/${gameId}/vitality/player`, 'POST', {
        playerId: Number(playerId),
        ...deltas,
      });
      setInfo('Points mis à jour.');
      await loadRoster();
      await onRosterChanged?.();
    } catch (err) {
      setError(err.message || 'Mise à jour des points impossible');
    } finally {
      setVitalityBusyId(null);
    }
  }

  const colSpan = vitalityEnabled ? (canImpersonate ? 8 : 7) : canImpersonate ? 6 : 5;

  return (
    <section className="gl-gameplay-block">
      <h3>Effectifs de la partie</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}
      <div className="gl-admin-table-wrap">
        <table className="gl-admin-table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Pseudo</th>
              <th>Équipe (cette partie)</th>
              {vitalityEnabled ? (
                <>
                  <th>PV / PP</th>
                  <th>Ajuster</th>
                </>
              ) : null}
              <th>Nouvelle équipe</th>
              {canImpersonate ? <th>Voir comme</th> : null}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{`${item.firstName || ''} ${item.lastName || ''}`.trim() || '—'}</td>
                <td>{item.pseudo}</td>
                <td>{item.teamName || 'Non assigné'}</td>
                {vitalityEnabled ? (
                  <>
                    <td>
                      <GLVitalityCounts health={item.healthPoints} power={item.powerPoints} />
                    </td>
                    <td>
                      <GLVitalityAdjustButtons
                        health={item.healthPoints}
                        power={item.powerPoints}
                        busy={vitalityBusyId === item.id}
                        disabled={busy}
                        onAdjust={(deltas) => adjustPlayerVitality(item.id, deltas)}
                      />
                    </td>
                  </>
                ) : null}
                <td>
                  <GLSelect
                    value={selectedTeams[item.id] || ''}
                    onChange={(event) =>
                      setSelectedTeams((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                  >
                    <option value="">Choisir</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </GLSelect>
                </td>
                {canImpersonate ? (
                  <td>
                    <GLButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => impersonatePlayer(item)}
                      disabled={busy}
                    >
                      Voir comme
                    </GLButton>
                  </td>
                ) : null}
                <td className="gl-admin-actions-cell">
                  <GLButton
                    type="button"
                    size="sm"
                    onClick={() => assignPlayer(item.id)}
                    disabled={busy || !selectedTeams[item.id]}
                  >
                    Assigner
                  </GLButton>
                  <GLButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => unassignPlayer(item.id)}
                    disabled={busy || !item.teamId}
                  >
                    Retirer
                  </GLButton>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>Aucun joueur dans la classe de cette partie.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
