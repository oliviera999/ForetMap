import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';
import { clonePackDeep, parsePackJson, stringifyPack } from '../utils/mascotPackEditorModel.js';

/**
 * Gestionnaire GUI des packs mascotte serveur (prof élevé, par carte).
 * @param {{ mapId: string, mapLabel?: string, onPacksChanged?: () => void | Promise<void>, onForceLogout?: () => void, variant?: 'modal' | 'page' }} props
 */
export default function VisitMascotPackManager({
  mapId,
  mapLabel = '',
  onPacksChanged,
  onForceLogout,
  variant = 'modal',
}) {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  /** @type {[Record<string, unknown>, React.Dispatch<React.SetStateAction<Record<string, unknown>>>]} */
  const [editorPack, setEditorPack] = useState({});
  const [editorTab, setEditorTab] = useState('visual');
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [labelDraft, setLabelDraft] = useState('');

  const mapTitle = useMemo(() => String(mapLabel || mapId || '').trim() || mapId, [mapLabel, mapId]);

  const loadList = useCallback(async () => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    setLoading(true);
    setListError('');
    try {
      const res = await api(`/api/visit/mascot-packs?map_id=${encodeURIComponent(mid)}`);
      const list = Array.isArray(res?.packs) ? res.packs : [];
      setPacks(list);
      setSelectedId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return null;
      });
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setListError(e.message || 'Impossible de charger les packs');
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, [mapId, onForceLogout]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setEditorTab('visual');
  }, [selectedId]);

  const selectedRow = packs.find((p) => p.id === selectedId);

  useEffect(() => {
    const row = packs.find((p) => p.id === selectedId);
    if (!row) {
      setEditorPack({});
      setLabelDraft('');
      setJsonDraft('{}');
      setJsonError('');
      return;
    }
    setLabelDraft(String(row.label || '').trim());
    const raw = row.pack && typeof row.pack === 'object' ? row.pack : {};
    setEditorPack(clonePackDeep(raw));
    setJsonError('');
  }, [selectedId, packs]);

  const onRefresh = useCallback(async () => {
    await loadList();
    await onPacksChanged?.();
  }, [loadList, onPacksChanged]);

  const applyJsonDraft = useCallback(() => {
    const parsed = parsePackJson(jsonDraft);
    if (!parsed.ok) {
      setJsonError(parsed.error || 'JSON invalide');
      return;
    }
    setJsonError('');
    setEditorPack(clonePackDeep(parsed.pack));
    setEditorTab('visual');
  }, [jsonDraft]);

  const onNewDraft = useCallback(async () => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    setActionBusy(true);
    setActionError('');
    try {
      const created = await api('/api/visit/mascot-packs', 'POST', { map_id: mid, is_published: 0 });
      await onRefresh();
      if (created?.id) setSelectedId(String(created.id));
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionError(e.message || 'Création impossible');
    } finally {
      setActionBusy(false);
    }
  }, [mapId, onRefresh, onForceLogout]);

  const onSave = useCallback(async () => {
    if (!selectedId) {
      setActionError('Sélectionnez un pack dans la liste ou créez un brouillon.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      const row = packs.find((p) => p.id === selectedId);
      const label = String(labelDraft || '').trim() || String(editorPack.label || '').trim() || 'Pack mascotte';
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
        map_id: String(mapId || '').trim(),
        label,
        pack: editorPack,
        is_published: row?.is_published ? 1 : 0,
      });
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionError(e.message || 'Enregistrement impossible');
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, editorPack, packs, mapId, onRefresh, onForceLogout, labelDraft]);

  const onTogglePublish = useCallback(async () => {
    if (!selectedId) return;
    const row = packs.find((p) => p.id === selectedId);
    if (!row) return;
    setActionBusy(true);
    setActionError('');
    try {
      const label = String(labelDraft || '').trim() || String(editorPack.label || '').trim() || 'Pack mascotte';
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
        map_id: String(mapId || '').trim(),
        label,
        pack: editorPack,
        is_published: row.is_published ? 0 : 1,
      });
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionError(e.message || 'Mise à jour impossible');
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, editorPack, packs, mapId, onRefresh, onForceLogout, labelDraft]);

  const onDelete = useCallback(async () => {
    if (!selectedId) return;
    if (!window.confirm('Supprimer définitivement ce pack (y compris les fichiers uploadés) ?')) return;
    setActionBusy(true);
    setActionError('');
    try {
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'DELETE');
      setSelectedId(null);
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionError(e.message || 'Suppression impossible');
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, onRefresh, onForceLogout]);

  return (
    <div
      className={`visit-mascot-pack-manager ${variant === 'page' ? 'visit-mascot-pack-manager--page' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'stretch',
        ...(variant === 'page'
          ? { minHeight: '60vh' }
          : { maxHeight: 'min(85vh, 900px)', overflow: 'auto' }),
      }}
    >
      <aside
        style={{
          flex: '0 0 280px',
          minWidth: 240,
          borderRight: '1px solid rgba(26,71,49,0.15)',
          paddingRight: 12,
        }}
      >
        <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Packs mascotte</h2>
        <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
          Carte : <strong>{mapTitle}</strong>
          <br />
          Les packs <strong>publiés</strong> apparaissent pour tous sur la visite (sélecteur mascotte).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={actionBusy}
            onClick={() => void onNewDraft()}
          >
            Nouveau brouillon
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={actionBusy} onClick={() => void onRefresh()}>
            Actualiser
          </button>
        </div>
        {listError ? (
          <p className="text-danger" role="alert" style={{ fontSize: '0.85rem' }}>{listError}</p>
        ) : null}
        {loading ? <p className="section-sub">Chargement…</p> : null}
        {!loading && packs.length === 0 ? (
          <p className="section-sub">Aucun pack — créez un brouillon.</p>
        ) : null}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {packs.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${selectedId === p.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                aria-pressed={selectedId === p.id}
                aria-label={`Ouvrir le pack ${p.label || p.catalog_id}`}
                onClick={() => setSelectedId(p.id)}
              >
                <span style={{ display: 'block', fontWeight: 600 }}>{p.label || p.catalog_id}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.85 }}>
                  {p.is_published ? 'Publié' : 'Brouillon'}
                  {' · '}
                  {p.catalog_id}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selectedId ? (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label>
              <span className="section-sub" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Libellé (liste)</span>
              <input
                className="form-input"
                value={labelDraft}
                onChange={(ev) => setLabelDraft(ev.target.value)}
                placeholder="Nom du pack"
              />
            </label>
            <button type="button" className="btn btn-primary btn-sm" disabled={actionBusy} onClick={() => void onSave()}>
              Enregistrer sur le serveur
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={actionBusy} onClick={() => void onTogglePublish()}>
              {selectedRow?.is_published ? 'Retirer de la visite publique' : 'Publier sur la visite'}
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={actionBusy} onClick={() => void onDelete()}>
              Supprimer…
            </button>
          </div>
        ) : null}
        {actionError ? (
          <p className="text-danger" role="alert" style={{ fontSize: '0.82rem', marginTop: 10 }}>{actionError}</p>
        ) : null}
      </aside>
      <div style={{ flex: '1 1 420px', minWidth: 300 }}>
        {!selectedId ? (
          <p className="section-sub">Sélectionnez un pack pour l’éditer.</p>
        ) : (
          <>
            <div className="visit-mascot-pack-manager__tabs" role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === 'visual'}
                className={`btn btn-sm ${editorTab === 'visual' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setEditorTab('visual'); setJsonError(''); }}
              >
                Éditeur visuel
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === 'json'}
                className={`btn btn-sm ${editorTab === 'json' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setEditorTab('json'); setJsonDraft(stringifyPack(editorPack, 2)); setJsonError(''); }}
              >
                JSON / export
              </button>
            </div>
            {editorTab === 'visual' ? (
              <MascotPackWysiwygEditor
                pack={editorPack}
                onPackChange={setEditorPack}
                packUuid={selectedId}
                catalogId={selectedRow?.catalog_id || ''}
                onForceLogout={onForceLogout}
              />
            ) : (
              <div className="mascot-pack-json-tab">
                <p className="section-sub" style={{ fontSize: '0.82rem' }}>
                  Modifiez le JSON puis cliquez « Appliquer » pour revenir à l’éditeur visuel avec les changements pris en compte.
                </p>
                <textarea
                  value={jsonDraft}
                  onChange={(ev) => { setJsonDraft(ev.target.value); setJsonError(''); }}
                  spellCheck={false}
                  style={{
                    width: '100%',
                    minHeight: 280,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid rgba(26,71,49,0.25)',
                    padding: 10,
                    boxSizing: 'border-box',
                  }}
                />
                {jsonError ? (
                  <p className="text-danger" role="alert" style={{ fontSize: '0.82rem' }}>{jsonError}</p>
                ) : null}
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={applyJsonDraft}>
                    Appliquer le JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(jsonDraft);
                    }}
                  >
                    Copier
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const blob = new Blob([jsonDraft], { type: 'application/json;charset=utf-8' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = 'mascot-pack.json';
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    Télécharger
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
