import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLMascotRenderer } from './GLMascotRenderer.jsx';
import { GL_MASCOT_STATE } from '../hooks/useGLMascotStateMachine.js';
import { GLMascotPackManager } from './GLMascotPackManager.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { useGLMascotCatalog } from '../context/GLMascotCatalogContext.jsx';

const TYPE_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'gnome', label: 'Gnomes' },
  { id: 'unicorn', label: 'Licornes' },
];

const SOURCE_FILTERS = [
  { id: 'all', label: 'Toutes sources' },
  { id: 'gl', label: 'G&L' },
  { id: 'foretmap', label: 'ForetMap' },
];

function supportsAnimatedPreview(mascot) {
  if (!mascot) return false;
  if (mascot.renderer && mascot.renderer !== 'fallback') return true;
  return !(typeof mascot.id === 'string' && mascot.id.startsWith('gl-'));
}

export function GLMascotsAdminView({ gameState, onReloadGame, mascotPacksEnabled = false }) {
  const { mascots: catalogMascots, reload: reloadCatalog } = useGLMascotCatalog();
  const [assignments, setAssignments] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [previewState, setPreviewState] = useState(GL_MASCOT_STATE.IDLE);

  const gameId = gameState?.game?.id || null;
  const teams = useMemo(
    () => (Array.isArray(gameState?.teams) ? gameState.teams : []),
    [gameState],
  );

  const mascots = useMemo(
    () => (Array.isArray(catalogMascots) ? catalogMascots : []),
    [catalogMascots],
  );

  const previewEligibleCount = useMemo(
    () => mascots.filter((m) => supportsAnimatedPreview(m)).length,
    [mascots],
  );

  async function loadCatalog() {
    try {
      const gameId = gameState?.game?.id || null;
      if (gameId) {
        const url = `/api/gl/mascots?gameId=${encodeURIComponent(gameId)}`;
        const data = await apiGL(url);
        setAssignments(Array.isArray(data?.assignments) ? data.assignments : []);
      } else {
        setAssignments([]);
      }
      await reloadCatalog();
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
      setError("Sélectionnez une équipe avant d'assigner une mascotte.");
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
    return mascots.filter((m) => {
      const sourceOk = sourceFilter === 'all' ? true : m.source === sourceFilter;
      const typeOk = typeFilter === 'all' ? true : m.type === typeFilter;
      return sourceOk && typeOk;
    });
  }, [mascots, typeFilter, sourceFilter]);

  return (
    <section className="gl-panel">
      <h2>Gestion mascottes</h2>
      <p>
        Catalogue unifié (G&amp;L, ForetMap, packs). Sélectionnez une équipe puis assignez une
        mascotte. Les gnomes et licornes SVG (`gl-*`) n&apos;animent pas les états preview ; seules
        les mascottes animées (ForetMap, packs `sprite_cut`, etc.) réagissent au sélecteur
        d&apos;état.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-info">{info}</p> : null}

      <section className="gl-panel" aria-labelledby="gl-mascot-assign-heading">
        <h3 id="gl-mascot-assign-heading">Assignation catalogue</h3>

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
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={sourceFilter === f.id ? 'is-active' : ''}
                onClick={() => setSourceFilter(f.id)}
                data-source-filter={f.id}
              >
                {f.label}
              </button>
            ))}
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
          <label>
            État preview
            <select
              value={previewState}
              onChange={(event) => setPreviewState(event.target.value)}
              disabled={previewEligibleCount === 0}
              title={previewEligibleCount === 0 ? 'Aucune mascotte animée dans le catalogue' : ''}
            >
              <option value={GL_MASCOT_STATE.IDLE}>Idle</option>
              <option value={GL_MASCOT_STATE.WALKING}>Walking</option>
              <option value={GL_MASCOT_STATE.TALKING}>Talking</option>
              <option value={GL_MASCOT_STATE.HAPPY}>Happy</option>
              <option value={GL_MASCOT_STATE.SAD}>Sad</option>
            </select>
          </label>
        </div>

        <ul className="gl-mascot-grid">
          {filtered.map((mascot) => {
            const assignedRow = isAssigned(mascot.id);
            const assignedToOther = isAssignedToOther(mascot.id);
            const isMine = assignedRow && String(assignedRow.team_id) === String(selectedTeamId);
            const cardPreviewState = supportsAnimatedPreview(mascot)
              ? previewState
              : GL_MASCOT_STATE.IDLE;
            return (
              <li
                key={mascot.id}
                className={`gl-mascot-card ${assignedToOther ? 'is-taken' : ''} ${isMine ? 'is-mine' : ''}`}
                data-mascot-id={mascot.id}
                data-mascot-type={mascot.type}
              >
                <GLMascotRenderer mascotId={mascot.id} mascotState={cardPreviewState} size={72} />
                <div className="gl-mascot-card-body">
                  <strong>{mascot.label}</strong>
                  <span className="gl-hint">
                    {mascot.source === 'foretmap'
                      ? 'ForetMap'
                      : mascot.type === 'gnome'
                        ? 'Gnome'
                        : 'Licorne'}
                    {!supportsAnimatedPreview(mascot) ? ' · SVG statique' : ''}
                  </span>
                  <p>{mascot.description}</p>
                  <GLButton
                    type="button"
                    size="sm"
                    variant={isMine ? 'secondary' : 'primary'}
                    onClick={() => assign(mascot)}
                    disabled={assignedToOther || !selectedTeamId || !gameId}
                    title={
                      assignedToOther ? 'Déjà utilisée par une autre équipe de cette partie' : ''
                    }
                  >
                    {isMine ? 'Assignée à cette équipe' : "Assigner à l'équipe sélectionnée"}
                  </GLButton>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {mascotPacksEnabled ? (
        <GLMascotPackManager />
      ) : (
        <p className="gl-hint">
          Le studio packs mascottes est désactivé (réglages → module « Studio mascottes »).
        </p>
      )}
    </section>
  );
}
