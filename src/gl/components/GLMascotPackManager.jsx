import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLMascotPackWysiwygEditor } from './GLMascotPackWysiwygEditor.jsx';
import { GLMascotPackPreviewPanel } from './GLMascotPackPreviewPanel.jsx';

export function GLMascotPackManager() {
  const [packs, setPacks] = useState([]);
  const [selectedId, setSelectedId] = useState('new');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function loadPacks() {
    try {
      const data = await apiGL('/api/gl/mascots/packs');
      setPacks(Array.isArray(data?.packs) ? data.packs : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement packs impossible');
    }
  }

  useEffect(() => {
    loadPacks();
  }, []);

  const selectedPack = useMemo(
    () => packs.find((pack) => String(pack.id) === String(selectedId)) || null,
    [packs, selectedId]
  );

  async function savePack(next) {
    try {
      if (next.id) {
        await apiGL(`/api/gl/mascots/packs/${next.id}`, 'PUT', next);
        setInfo('Pack mis à jour.');
      } else {
        await apiGL('/api/gl/mascots/packs', 'POST', next);
        setInfo('Pack créé.');
      }
      await loadPacks();
    } catch (err) {
      setError(err.message || 'Sauvegarde impossible');
    }
  }

  async function deletePack(id) {
    try {
      await apiGL(`/api/gl/mascots/packs/${id}`, 'DELETE');
      setSelectedId('new');
      setInfo('Pack supprimé.');
      await loadPacks();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  return (
    <section className="gl-panel">
      <h3>Studio packs mascottes (WYSIWYG JSON)</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-info">{info}</p> : null}
      <label>
        Pack
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="new">Nouveau pack</option>
          {packs.map((pack) => (
            <option key={pack.id} value={pack.id}>
              #{pack.id} - {pack.name}
            </option>
          ))}
        </select>
      </label>
      <GLMascotPackWysiwygEditor initialPack={selectedPack} onSave={savePack} onDelete={deletePack} />
      <GLMascotPackPreviewPanel pack={selectedPack} />
    </section>
  );
}
