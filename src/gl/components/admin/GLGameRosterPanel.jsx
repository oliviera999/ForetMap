import React, { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

export function GLGameRosterPanel({ gameId, teams, refreshKey, onRosterChanged }) {
  const [rows, setRows] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState({});
  const [busy, setBusy] = useState(false);
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
        }, {})
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
              <th>Nouvelle équipe</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{`${item.firstName || ''} ${item.lastName || ''}`.trim() || '—'}</td>
                <td>{item.pseudo}</td>
                <td>{item.teamName || 'Non assigné'}</td>
                <td>
                  <GLSelect
                    value={selectedTeams[item.id] || ''}
                    onChange={(event) => setSelectedTeams((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  >
                    <option value="">Choisir</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </GLSelect>
                </td>
                <td className="gl-admin-actions-cell">
                  <GLButton type="button" size="sm" onClick={() => assignPlayer(item.id)} disabled={busy || !selectedTeams[item.id]}>
                    Assigner
                  </GLButton>
                  <GLButton type="button" size="sm" variant="secondary" onClick={() => unassignPlayer(item.id)} disabled={busy || !item.teamId}>
                    Retirer
                  </GLButton>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>Aucun joueur dans la classe de cette partie.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
