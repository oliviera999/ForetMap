import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLUsersAdminView() {
  const [classes, setClasses] = useState([]);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');

  async function reload() {
    try {
      const [nextClasses, nextPlayers] = await Promise.all([
        apiGL('/api/gl/admin/classes'),
        apiGL('/api/gl/admin/players'),
      ]);
      setClasses(nextClasses || []);
      setPlayers(nextPlayers || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <section className="gl-panel">
      <h2>Gestion utilisateurs</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <h3>Classes</h3>
      <ul>
        {classes.map((item) => (
          <li key={item.id}>{item.name} ({item.players_count || 0} joueurs)</li>
        ))}
      </ul>
      <h3>Joueurs</h3>
      <ul>
        {players.map((item) => (
          <li key={item.id}>{item.pseudo} — classe {item.class_name || item.class_id}</li>
        ))}
      </ul>
      <button type="button" onClick={reload}>Rafraichir</button>
    </section>
  );
}
