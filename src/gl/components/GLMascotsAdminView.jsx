import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';

const TYPE_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'gnome', label: 'Gnomes' },
  { id: 'unicorn', label: 'Licornes' },
];

export function GLMascotsAdminView({ gameState, onReloadGame }) {
  const [mascots, setMascots] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const gameId = gameState?.game?.id || null;
  const teams = useMemo(() => (Array.isArray(gameState?.teams) ? gameState.teams : []), [gameState]);

  async function loadCatalog() {
    try {
      const url = gameId ? `/api/gl/mascots?gameId=${encodeURIComponent(gameId)}` : '/api/gl/mascots';
      const data = await apiGL(url);
      setMascots(Array.isArray(data?.mascots) ? data.mascots : []);
      setAssignments(Array.isArray(data?.assignments) ? data.assignments : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement catalogue mascotte impossible');
    }
  }

  useEffect(() => {
    loadCatalog();
  }, [gameId]);

  useEffect(() => {
    if (teams.length > 0 && !teams.some((t) => String(t.id) === String(selectedTeamId))) {
      setSelectedTeamId(String(teams[0].id));
    }
  }, [teams, selectedTeamId]);

  function isAssigned(mascotId) {
    return assignments.find((a) => String(a.mascot_id) === String(mascotId));
  }

  function isAssignedToOther(mascotId) {
    const a = isAssigned(mascotId);
    if (!a) return false;
    return String(a.team_id) !== String(selectedTeamId);
  }

  async function assign(mascot) {
    if (!gameId) {
      setError('Aucune partie active : créez ou sélectionnez une partie depuis la console MJ.');
      return;
    }
    if (!selectedTeamId) {
      setError('Sélectionnez une équipe avant d\'assigner une mascotte.');
      return;
    }
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/mascots/assign', 'POST', {
        gameId: Number(gameId),
        teamId: Number(selectedTeamId),
        mascotId: mascot.id,
      });
      setInfo(`Mascotte « ${mascot.label} » assignée.`);
      await loadCatalog();
      if (typeof onReloadGame === 'function') await onReloadGame();
    } catch (err) {
      setError(err.message || 'Assignation impossible');
    }
  }

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return mascots;
    return mascots.filter((m) => m.type === typeFilter);
  }, [mascots, typeFilter]);

  return (
    <section className="gl-panel">
      <h2>Gestion mascottes</h2>
      <p>Catalogue G&amp;L (gnomes / licornes). Sélectionnez une équipe puis cliquez sur « Assigner » pour la lier à une mascotte.</p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-info">{info}</p> : null}

      <div className="gl-mascots-controls">
        <label>
          Équipe
          <select
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            disabled={teams.length === 0}
          >
            {teams.length === 0 ? <option value="">Aucune équipe</option> : null}
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.type})
              </option>
            ))}
          </select>
        </label>
        <div className="gl-mascots-filters" role="group" aria-label="Filtres">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={typeFilter === f.id ? 'is-active' : ''}
              onClick={() => setTypeFilter(f.id)}
              data-filter={f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="gl-mascot-grid">
        {filtered.map((mascot) => {
          const assignedRow = isAssigned(mascot.id);
          const assignedToOther = isAssignedToOther(mascot.id);
          const isMine = assignedRow && String(assignedRow.team_id) === String(selectedTeamId);
          return (
            <li
              key={mascot.id}
              className={`gl-mascot-card ${assignedToOther ? 'is-taken' : ''} ${isMine ? 'is-mine' : ''}`}
              data-mascot-id={mascot.id}
              data-mascot-type={mascot.type}
            >
              <GLMascotAvatar mascotId={mascot.id} size={72} />
              <div className="gl-mascot-card-body">
                <strong>{mascot.label}</strong>
                <span className="gl-hint">{mascot.type === 'gnome' ? 'Gnome' : 'Licorne'}</span>
                <p>{mascot.description}</p>
                <button
                  type="button"
                  onClick={() => assign(mascot)}
                  disabled={assignedToOther || !selectedTeamId || !gameId}
                  title={assignedToOther ? 'Déjà utilisée par une autre équipe de cette partie' : ''}
                >
                  {isMine ? 'Assignée à cette équipe' : 'Assigner à l\'équipe sélectionnée'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
