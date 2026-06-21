import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLMascotPackWysiwygEditor } from './GLMascotPackWysiwygEditor.jsx';
import { GLMascotPackPreviewPanel } from './GLMascotPackPreviewPanel.jsx';
import { useGLMascotCatalog } from '../context/GLMascotCatalogContext.jsx';
import MascotPackArchiveImportDialog from '../../shared/mascot-pack/MascotPackArchiveImportDialog.jsx';
import { downloadApiFile } from '../../utils/downloadApiFile.js';

export function GLMascotPackManager() {
  const { reload: reloadMascotCatalog } = useGLMascotCatalog();
  const [packs, setPacks] = useState([]);
  const [selectedId, setSelectedId] = useState('new');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function loadPacks() {
    try {
      const data = await apiGL('/api/gl/mascots/packs');
      setPacks(Array.isArray(data?.packs) ? data.packs : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement packs impossible');
    }
  }

  React.useEffect(() => {
    loadPacks();
  }, []);

  const selectedPack = React.useMemo(
    () => packs.find((pack) => String(pack.id) === String(selectedId)) || null,
    [packs, selectedId],
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
      await reloadMascotCatalog();
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
      await reloadMascotCatalog();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  async function exportZip() {
    if (!selectedPack?.id) return;
    setBusy(true);
    setError('');
    try {
      const slug = String(selectedPack.name || 'pack')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .slice(0, 40);
      await downloadApiFile(
        `/api/gl/mascots/packs/${selectedPack.id}/export.zip`,
        `gl-mascot-pack-${slug || 'pack'}.zip`,
      );
    } catch (err) {
      setError(err.message || 'Export ZIP impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveImported(result) {
    const id = result?.pack?.id ?? result?.id;
    if (id != null) setSelectedId(String(id));
    setInfo('Pack importé depuis ZIP.');
    await loadPacks();
    await reloadMascotCatalog();
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !selectedPack?.id}
          onClick={() => void exportZip()}
        >
          Exporter ZIP
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setImportOpen(true)}
        >
          Importer ZIP…
        </button>
      </div>
      <GLMascotPackWysiwygEditor
        initialPack={selectedPack}
        onSave={savePack}
        onDelete={deletePack}
      />
      <GLMascotPackPreviewPanel pack={selectedPack} />
      <MascotPackArchiveImportDialog
        open={importOpen}
        variant="gl"
        chapterId={selectedPack?.chapter_id ?? null}
        targetPackId={selectedPack?.id ?? null}
        targetPackLabel={selectedPack?.name ?? ''}
        onClose={() => setImportOpen(false)}
        onImported={(result) => void onArchiveImported(result)}
      />
    </section>
  );
}
