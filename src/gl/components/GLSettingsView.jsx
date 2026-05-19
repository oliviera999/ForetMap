import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLSettingsView() {
  const [settings, setSettings] = useState({});
  const [title, setTitle] = useState('Gnomes & Licornes');
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await apiGL('/api/gl/admin/settings');
      setSettings(data?.settings || {});
      setTitle(String(data?.settings?.['platform.title'] || 'Gnomes & Licornes'));
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      await apiGL('/api/gl/admin/settings/platform.title', 'PUT', { value: title });
      await load();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    }
  }

  return (
    <section className="gl-panel">
      <h2>Reglages plateforme</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <form onSubmit={save} className="gl-form">
        <label>
          Titre plateforme
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button type="submit">Enregistrer</button>
      </form>
      <pre>{JSON.stringify(settings, null, 2)}</pre>
    </section>
  );
}
