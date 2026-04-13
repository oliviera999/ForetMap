import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { api, AccountDeletedError } from '../services/api';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';
import VisitMapMascotRenderer from './VisitMapMascotRenderer.jsx';
import { clonePackDeep, parsePackJson, stringifyPack } from '../utils/mascotPackEditorModel.js';
import { validateMascotPackV1 } from '../utils/mascotPack.js';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';
import { getVisitMascotCatalog } from '../utils/visitMascotCatalog.js';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import {
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
  VISIT_MASCOT_INTERACTION_LABELS,
  DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE,
} from '../utils/visitMascotInteractionEvents.js';
import useVisitMascotStateMachine from '../hooks/useVisitMascotStateMachine.js';

const RIGHT_TABS = [
  { id: 'detail', label: 'Fiche comportements' },
  { id: 'visual', label: 'Éditeur visuel' },
  { id: 'json', label: 'JSON' },
  { id: 'library', label: 'Bibliothèque sprites' },
  { id: 'interaction', label: 'Comportements visite' },
  { id: 'preview', label: 'Aperçu mascotte' },
];

/** @param {Record<string, unknown>} pack */
function estimateStateDurationMs(pack, stateKey) {
  const sf = pack?.stateFrames && typeof pack.stateFrames === 'object' ? pack.stateFrames[stateKey] : null;
  if (!sf || typeof sf !== 'object') return null;
  const nFiles = Array.isArray(sf.files) ? sf.files.length : (Array.isArray(sf.srcs) ? sf.srcs.length : 0);
  if (nFiles <= 0) return null;
  if (Array.isArray(sf.frameDwellMs) && sf.frameDwellMs.length === nFiles) {
    return sf.frameDwellMs.reduce((a, b) => a + (Number(b) || 0), 0);
  }
  const fps = Math.max(1, Number(sf.fps) || 8);
  return Math.round((1000 / fps) * nFiles);
}

/** @param {{ pack: Record<string, unknown> }} props */
function PackBehaviorDetailTable({ pack }) {
  const validated = useMemo(() => validateMascotPackV1(pack, { relaxAssetPrefix: true }), [pack]);
  if (!validated.ok) {
    return <p className="section-sub text-danger">Pack invalide pour la fiche — corrigez le JSON ou l’éditeur.</p>;
  }
  const states = Object.keys(validated.pack.stateFrames || {}).sort();
  const ver = Number(validated.pack.mascotPackVersion) === 2 ? 2 : 1;
  return (
    <div className="visit-mascot-pack-detail">
      <p className="section-sub" style={{ fontSize: '0.85rem' }}>
        Version pack <strong>{ver}</strong>
        {' · '}
        <code>framesBase</code> {String(validated.pack.framesBase || '')}
        {' · '}
        {validated.pack.frameWidth}×{validated.pack.frameHeight}
        {validated.pack.displayScale != null ? ` · échelle ${validated.pack.displayScale}` : ''}
        {' · '}
        silhouette <code>{String(validated.pack.fallbackSilhouette || '')}</code>
      </p>
      {validated.pack.stateAliases && Object.keys(validated.pack.stateAliases).length > 0 ? (
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Alias :{' '}
          {Object.entries(validated.pack.stateAliases).map(([a, t]) => `${a}→${t}`).join(', ')}
        </p>
      ) : null}
      <div style={{ overflowX: 'auto' }}>
        <table className="visit-mascot-pack-detail-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(26,71,49,0.2)' }}>
              <th style={{ padding: '6px 8px' }}>État</th>
              <th style={{ padding: '6px 8px' }}>Images</th>
              <th style={{ padding: '6px 8px' }}>fps</th>
              <th style={{ padding: '6px 8px' }}>frameDwellMs</th>
              <th style={{ padding: '6px 8px' }}>Durée estimée</th>
            </tr>
          </thead>
          <tbody>
            {states.map((st) => {
              const spec = validated.pack.stateFrames[st];
              const n = Array.isArray(spec?.files) ? spec.files.length : (Array.isArray(spec?.srcs) ? spec.srcs.length : 0);
              const dwell = Array.isArray(spec?.frameDwellMs) ? spec.frameDwellMs.join(', ') : '—';
              const dur = estimateStateDurationMs(validated.pack, st);
              return (
                <tr key={st} style={{ borderBottom: '1px solid rgba(26,71,49,0.08)' }}>
                  <td style={{ padding: '6px 8px' }}><code>{st}</code></td>
                  <td style={{ padding: '6px 8px' }}>{n}</td>
                  <td style={{ padding: '6px 8px' }}>{spec?.fps != null ? String(spec.fps) : '—'}</td>
                  <td style={{ padding: '6px 8px', maxWidth: 220, wordBreak: 'break-all' }}>{dwell}</td>
                  <td style={{ padding: '6px 8px' }}>{dur != null ? `${dur} ms` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** @param {{ packs: Array<{ catalog_id: string, label: string, pack: object }>, mapId: string, onForceLogout?: () => void }} props */
function VisitMascotStudioPreviewSection({ packs, mapId, onForceLogout }) {
  const extras = useMemo(
    () => buildVisitMascotCatalogExtrasFromContent(
      packs.map((p) => ({ catalog_id: p.catalog_id, label: p.label, pack: p.pack })),
    ),
    [packs],
  );
  const visitMascotOptions = useMemo(
    () => [...getVisitMascotCatalog(), ...extras],
    [extras],
  );
  const {
    visitMascotId,
    visitMascotPreviewState,
    visitMascotPreviewStateOptions,
    onChangeVisitMascotId,
    setVisitMascotPreviewState,
  } = useVisitMascotStateMachine({
    walking: false,
    happy: false,
    extraCatalogEntries: extras,
  });
  const visitMascotPreviewBodyMotionClass = useMemo(() => {
    const s = visitMascotPreviewState;
    if (s === VISIT_MASCOT_STATE.WALKING || s === VISIT_MASCOT_STATE.RUNNING) {
      return 'visit-mascot-preview-body--motion-walk';
    }
    if (
      s === VISIT_MASCOT_STATE.HAPPY
      || s === VISIT_MASCOT_STATE.CELEBRATE
      || s === VISIT_MASCOT_STATE.HAPPY_JUMP
      || s === VISIT_MASCOT_STATE.SPIN
    ) {
      return 'visit-mascot-preview-body--motion-happy';
    }
    return 'visit-mascot-preview-body--motion-idle';
  }, [visitMascotPreviewState]);

  return (
    <section className="visit-mascot-preview-card" aria-label="Aperçu de la mascotte">
      <p className="section-sub" style={{ fontSize: '0.82rem' }}>
        Carte <strong>{mapId}</strong> — packs chargés (y compris brouillons) pour prévisualiser les mascottes serveur.
      </p>
      <div className="visit-mascot-preview-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <button
          type="button"
          className={`btn btn-sm ${visitMascotPreviewState === VISIT_MASCOT_STATE.IDLE ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisitMascotPreviewState(VISIT_MASCOT_STATE.IDLE)}
        >
          Idle
        </button>
        <button
          type="button"
          className={`btn btn-sm ${visitMascotPreviewState === VISIT_MASCOT_STATE.WALKING ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisitMascotPreviewState(VISIT_MASCOT_STATE.WALKING)}
        >
          Marche
        </button>
        <button
          type="button"
          className={`btn btn-sm ${visitMascotPreviewState === VISIT_MASCOT_STATE.HAPPY ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisitMascotPreviewState(VISIT_MASCOT_STATE.HAPPY)}
        >
          Heureuse
        </button>
        {visitMascotPreviewStateOptions
          .filter((entry) => ![VISIT_MASCOT_STATE.IDLE, VISIT_MASCOT_STATE.WALKING, VISIT_MASCOT_STATE.HAPPY].includes(entry.state))
          .map((entry) => (
            <button
              key={entry.state}
              type="button"
              className={`btn btn-sm ${visitMascotPreviewState === entry.state ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVisitMascotPreviewState(entry.state)}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
      </div>
      <label className="visit-mascot-picker" style={{ display: 'block', marginBottom: 10 }}>
        <span>Mascotte</span>
        <select value={visitMascotId} onChange={(e) => onChangeVisitMascotId(e.target.value)}>
          {visitMascotOptions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>
      <div
        className={`visit-mascot-preview-body ${visitMascotPreviewBodyMotionClass}`}
        aria-hidden="true"
        style={{ minHeight: 200 }}
      >
        <VisitMapMascotRenderer
          mascotState={visitMascotPreviewState}
          mascotId={visitMascotId}
          extraCatalogEntries={extras}
        />
      </div>
    </section>
  );
}

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
  const [editorTab, setEditorTab] = useState('detail');
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [libAssets, setLibAssets] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libMessage, setLibMessage] = useState('');

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

  const loadLibrary = useCallback(async () => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    setLibLoading(true);
    setLibMessage('');
    try {
      const res = await api(`/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets`);
      setLibAssets(Array.isArray(res?.assets) ? res.assets : []);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setLibMessage(e.message || 'Impossible de charger la bibliothèque');
      setLibAssets([]);
    } finally {
      setLibLoading(false);
    }
  }, [mapId, onForceLogout]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setEditorTab('detail');
  }, [selectedId]);

  useEffect(() => {
    if (editorTab === 'library') void loadLibrary();
  }, [editorTab, loadLibrary]);

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
    setEditorTab('detail');
  }, [jsonDraft]);

  const postNewPack = useCallback(async (bodyExtra = {}) => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    setActionBusy(true);
    setActionError('');
    try {
      const created = await api('/api/visit/mascot-packs', 'POST', { map_id: mid, is_published: 0, ...bodyExtra });
      const newId = created?.id ? String(created.id) : '';
      if (newId) setSelectedId(newId);
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionError(e.message || 'Création impossible');
    } finally {
      setActionBusy(false);
    }
  }, [mapId, onRefresh, onForceLogout]);

  const onNewDraft = useCallback(async () => {
    await postNewPack({});
  }, [postNewPack]);

  const onNewFromCatalog = useCallback(async () => {
    await postNewPack({ clone_from_catalog_id: 'renard2-cut-spritesheet' });
  }, [postNewPack]);

  const onDuplicateSelected = useCallback(async () => {
    if (!selectedId) return;
    if (!window.confirm('Dupliquer ce pack (copie JSON et fichiers uploadés) ?')) return;
    await postNewPack({ clone_from_pack_id: selectedId });
  }, [selectedId, postNewPack]);

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

  const upgradePackToV2 = useCallback(() => {
    setEditorPack((prev) => ({
      ...prev,
      mascotPackVersion: 2,
      interactionProfile: typeof prev.interactionProfile === 'object' && prev.interactionProfile
        ? prev.interactionProfile
        : {},
    }));
    setEditorTab('interaction');
  }, []);

  const patchInteractionRule = useCallback((key, partial) => {
    setEditorPack((prev) => {
      const base = Number(prev.mascotPackVersion) === 2 && prev.interactionProfile && typeof prev.interactionProfile === 'object'
        ? { ...prev.interactionProfile }
        : {};
      const def = DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE[key] || { mode: 'none' };
      const cur = { ...def, ...(base[key] || {}) };
      const nextRule = { ...cur, ...partial };
      let rule;
      if (nextRule.mode === 'none') {
        rule = { mode: 'none' };
      } else if (nextRule.mode === 'happy') {
        rule = { mode: 'happy' };
      } else {
        const st = String(nextRule.state || (def.mode === 'transient' ? def.state : 'idle') || 'idle');
        const dm = nextRule.durationMs != null
          ? Number(nextRule.durationMs)
          : (def.mode === 'transient' && def.durationMs != null ? Number(def.durationMs) : 1500);
        rule = {
          mode: 'transient',
          state: st,
          durationMs: Math.min(60_000, Math.max(300, dm)),
        };
      }
      base[key] = rule;
      return {
        ...prev,
        mascotPackVersion: 2,
        interactionProfile: base,
      };
    });
  }, []);

  const onLibUpload = useCallback(async (ev) => {
    const file = ev.target?.files?.[0];
    ev.target.value = '';
    if (!file || !selectedId) return;
    const mid = String(mapId || '').trim();
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
      if (!b64) return;
      setLibLoading(true);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase() || 'import.png';
        await api(`/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets`, 'POST', {
          filename: safeName.endsWith('.png') ? safeName : `${safeName}.png`,
          image_data: b64,
        });
        setLibMessage('Image importée dans la bibliothèque.');
        await loadLibrary();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setLibMessage(e.message || 'Import impossible');
      } finally {
        setLibLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, [mapId, selectedId, loadLibrary, onForceLogout]);

  const onLibDelete = useCallback(async (filename) => {
    const mid = String(mapId || '').trim();
    if (!window.confirm(`Supprimer « ${filename} » de la bibliothèque ?`)) return;
    setLibLoading(true);
    try {
      await api(`/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets/${encodeURIComponent(filename)}`, 'DELETE');
      await loadLibrary();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setLibMessage(e.message || 'Suppression impossible');
    } finally {
      setLibLoading(false);
    }
  }, [mapId, loadLibrary, onForceLogout]);

  const setFramesBaseToLibrary = useCallback(() => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    const prefix = `/api/visit/mascot-sprite-library/${mid}/assets/`;
    setEditorPack((p) => ({ ...p, framesBase: prefix.endsWith('/') ? prefix : `${prefix}/` }));
    setEditorTab('visual');
  }, [mapId]);

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
          Les packs <strong>publiés</strong> apparaissent sur la visite (sélecteur mascotte).
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
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={actionBusy}
            onClick={() => void onNewFromCatalog()}
            title="Modèle Renard 2 (assets /public/)"
          >
            Nouveau depuis modèle
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={actionBusy} onClick={() => void onRefresh()}>
            Actualiser
          </button>
        </div>
        {selectedId ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 10 }}
            disabled={actionBusy}
            onClick={() => void onDuplicateSelected()}
          >
            Dupliquer le pack sélectionné
          </button>
        ) : null}
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
                  {' · v'}
                  {Number(p.pack?.mascotPackVersion) === 2 ? '2' : '1'}
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
            <div className="visit-mascot-pack-manager__tabs" role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {RIGHT_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={editorTab === t.id}
                  className={`btn btn-sm ${editorTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setEditorTab(t.id);
                    if (t.id === 'json') setJsonDraft(stringifyPack(editorPack, 2));
                    setJsonError('');
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {editorTab === 'detail' ? <PackBehaviorDetailTable pack={editorPack} /> : null}
            {editorTab === 'visual' ? (
              <MascotPackWysiwygEditor
                pack={editorPack}
                onPackChange={setEditorPack}
                packUuid={selectedId}
                catalogId={selectedRow?.catalog_id || ''}
                visitMapId={String(mapId || '').trim()}
                onForceLogout={onForceLogout}
              />
            ) : null}
            {editorTab === 'json' ? (
              <div className="mascot-pack-json-tab">
                <p className="section-sub" style={{ fontSize: '0.82rem' }}>
                  Modifiez le JSON puis « Appliquer ».
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
                </div>
              </div>
            ) : null}
            {editorTab === 'library' ? (
              <div>
                <p className="section-sub" style={{ fontSize: '0.82rem' }}>
                  PNG partagés pour cette carte. Utilisez « Définir framesBase sur la bibliothèque » puis des noms relatifs dans chaque état.
                </p>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginRight: 8 }} onClick={() => void loadLibrary()}>
                  Actualiser la liste
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={setFramesBaseToLibrary}>
                  Définir framesBase sur la bibliothèque
                </button>
                <label className="btn btn-ghost btn-sm" style={{ marginLeft: 8, cursor: 'pointer' }}>
                  Importer PNG…
                  <input type="file" accept="image/png" style={{ display: 'none' }} onChange={(e) => void onLibUpload(e)} />
                </label>
                {libMessage ? <p className="section-sub" style={{ marginTop: 8 }}>{libMessage}</p> : null}
                {libLoading ? <p className="section-sub">Chargement…</p> : null}
                <ul style={{ marginTop: 10, paddingLeft: 18 }}>
                  {libAssets.map((a) => (
                    <li key={a.filename} style={{ marginBottom: 6, fontSize: '0.85rem' }}>
                      <code>{a.filename}</code>
                      {' '}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onLibDelete(a.filename)}>
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {editorTab === 'interaction' ? (
              <div>
                <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
                  Réactions de la mascotte sur la carte (pack v2). Les valeurs par défaut reproduisent le comportement historique.
                </p>
                {Number(editorPack.mascotPackVersion) !== 2 ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={upgradePackToV2}>
                    Passer ce pack en version 2 (profil d’interaction)
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {VISIT_MASCOT_INTERACTION_EVENT_KEYS.map((key) => {
                      const def = DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE[key] || { mode: 'none' };
                      const prof = editorPack.interactionProfile && typeof editorPack.interactionProfile === 'object'
                        ? editorPack.interactionProfile[key]
                        : null;
                      const mode = prof?.mode || def.mode || 'none';
                      return (
                        <div key={key} style={{ border: '1px solid rgba(26,71,49,0.12)', borderRadius: 8, padding: 10 }}>
                          <strong style={{ fontSize: '0.88rem' }}>{VISIT_MASCOT_INTERACTION_LABELS[key] || key}</strong>
                          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <label>
                              Mode{' '}
                              <select
                                className="form-select"
                                value={mode}
                                onChange={(e) => {
                                  const m = e.target.value;
                                  if (m === 'none') patchInteractionRule(key, { mode: 'none' });
                                  else if (m === 'happy') patchInteractionRule(key, { mode: 'happy' });
                                  else patchInteractionRule(key, {
                                    mode: 'transient',
                                    state: def.mode === 'transient' ? def.state : 'idle',
                                    durationMs: def.mode === 'transient' ? def.durationMs : 1500,
                                  });
                                }}
                              >
                                <option value="transient">Animation (transitoire)</option>
                                <option value="happy">Joyeux (overlay court)</option>
                                <option value="none">Désactivé</option>
                              </select>
                            </label>
                            {mode === 'transient' ? (
                              <>
                                <label>
                                  État{' '}
                                  <select
                                    className="form-select"
                                    value={String(prof?.state || (def.mode === 'transient' ? def.state : 'idle') || 'idle')}
                                    onChange={(e) => patchInteractionRule(key, {
                                      mode: 'transient',
                                      state: e.target.value,
                                      durationMs: prof?.durationMs ?? def.durationMs,
                                    })}
                                  >
                                    {Object.values(VISIT_MASCOT_STATE).map((st) => (
                                      <option key={st} value={st}>{st}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Durée ms{' '}
                                  <input
                                    className="form-input"
                                    type="number"
                                    min={300}
                                    max={60000}
                                    style={{ width: 100 }}
                                    value={prof?.durationMs != null ? Number(prof.durationMs) : (def.durationMs != null ? Number(def.durationMs) : '')}
                                    placeholder="1500"
                                    onChange={(e) => patchInteractionRule(key, {
                                      mode: 'transient',
                                      state: prof?.state || (def.mode === 'transient' ? def.state : 'idle'),
                                      durationMs: e.target.value === '' ? undefined : Number(e.target.value),
                                    })}
                                  />
                                </label>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
            {editorTab === 'preview' ? (
              <VisitMascotStudioPreviewSection packs={packs} mapId={String(mapId || '')} onForceLogout={onForceLogout} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
