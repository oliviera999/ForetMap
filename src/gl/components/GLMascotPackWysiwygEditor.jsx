import React, { useEffect, useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';

export function GLMascotPackWysiwygEditor({ initialPack, onSave, onDelete }) {
  const [name, setName] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const pack = initialPack || null;
    setName(pack?.name || '');
    setChapterId(pack?.chapter_id == null ? '' : String(pack.chapter_id));
    setJsonText(JSON.stringify(pack?.payload || {
      id: 'gl-pack',
      name: 'Nouveau pack GL',
      renderer: 'sprite_cut',
      assets: [],
      states: [{ key: 'idle', frames: [0] }],
    }, null, 2));
    setError('');
  }, [initialPack]);

  function submit(event) {
    event.preventDefault();
    try {
      const payload = JSON.parse(jsonText);
      onSave?.({
        id: initialPack?.id || null,
        name: String(name || '').trim() || 'Pack GL',
        chapterId: chapterId ? Number(chapterId) : null,
        payload,
      });
      setError('');
    } catch (err) {
      setError(err?.message || 'JSON invalide');
    }
  }

  return (
    <form className="gl-form" onSubmit={submit}>
      <label>
        Nom du pack
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Chapter ID (optionnel)
        <input value={chapterId} onChange={(event) => setChapterId(event.target.value)} />
      </label>
      <label>
        JSON pack
        <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={14} />
      </label>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-inline-actions">
        <GLButton type="submit">Enregistrer le pack</GLButton>
        {initialPack?.id ? (
          <GLButton type="button" variant="danger" onClick={() => onDelete?.(initialPack.id)}>
            Supprimer le pack
          </GLButton>
        ) : null}
      </div>
    </form>
  );
}
