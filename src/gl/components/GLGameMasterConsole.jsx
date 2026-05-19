import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLGameMasterConsole({
  chapters,
  gameState,
  onGameStateChange,
  onReloadGame,
}) {
  const [name, setName] = useState('Partie découverte');
  const [chapterId, setChapterId] = useState('');
  const [classId, setClassId] = useState('1');
  const [eventLog, setEventLog] = useState('');

  async function createGame(event) {
    event.preventDefault();
    const payload = {
      name,
      chapterId: Number(chapterId),
      classId: Number(classId),
    };
    const created = await apiGL('/api/gl/games', 'POST', payload);
    onGameStateChange(created);
    setEventLog('Partie créée.');
  }

  async function setStatus(nextStatus) {
    if (!gameState?.game?.id) return;
    await apiGL(`/api/gl/games/${gameState.game.id}/${nextStatus}`, 'POST');
    await onReloadGame?.();
    setEventLog(`Statut: ${nextStatus}`);
  }

  async function addTeam(type) {
    if (!gameState?.game?.id) return;
    const label = type === 'gnome' ? 'Equipe Gnomes' : 'Equipe Licornes';
    const mascotId = type === 'gnome' ? 'gnome-foret-rive' : 'tan-bird-spritesheet';
    await apiGL(`/api/gl/games/${gameState.game.id}/teams`, 'POST', {
      name: `${label} ${Date.now().toString().slice(-3)}`,
      type,
      mascotId,
      color: type === 'gnome' ? '#65a30d' : '#a855f7',
    });
    await onReloadGame?.();
    setEventLog(`Equipe ${type} ajoutée.`);
  }

  return (
    <section className="gl-panel">
      <h2>Console MJ</h2>
      <form onSubmit={createGame} className="gl-form">
        <label>
          Nom de partie
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Classe ID
          <input value={classId} onChange={(event) => setClassId(event.target.value)} />
        </label>
        <label>
          Chapitre
          <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
            <option value="">Choisir</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
            ))}
          </select>
        </label>
        <button type="submit">Creer une partie</button>
      </form>

      <div className="gl-inline-actions">
        <button type="button" onClick={() => setStatus('start')}>Demarrer</button>
        <button type="button" onClick={() => setStatus('pause')}>Pause</button>
        <button type="button" onClick={() => setStatus('end')}>Terminer</button>
      </div>
      <div className="gl-inline-actions">
        <button type="button" onClick={() => addTeam('gnome')}>Ajouter equipe Gnome</button>
        <button type="button" onClick={() => addTeam('unicorn')}>Ajouter equipe Licorne</button>
      </div>
      {eventLog ? <p>{eventLog}</p> : null}
    </section>
  );
}
