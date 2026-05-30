import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { api, AccountDeletedError, withAppBase } from '../services/api';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';
import VisitMapMascotRenderer from './VisitMapMascotRenderer.jsx';
import {
  clonePackDeep,
  parsePackJson,
  stringifyPack,
  serverMascotPackAssetsPrefix,
  serverMascotSpriteLibraryAssetsPrefix,
  MASCOT_PACK_FALLBACK_SILHOUETTES,
} from '../utils/mascotPackEditorModel.js';
import { validateMascotPackV1 } from '../utils/mascotPack.js';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';
import { getVisitMascotCatalog } from '../utils/visitMascotCatalog.js';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import {
  extractMascotPackValidationIssues,
  sanitizeMascotPackDraft,
  toMascotPackIssueLines,
} from '../utils/mascotPackValidationUi.js';
import {
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
  VISIT_MASCOT_INTERACTION_LABELS,
  DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE,
} from '../utils/visitMascotInteractionEvents.js';
import VisitMascotDialogEditor from './VisitMascotDialogEditor.jsx';
import VisitMascotDialogStudioView from './VisitMascotDialogStudioView.jsx';
import useVisitMascotStateMachine from '../hooks/useVisitMascotStateMachine.js';

/** @param {string} url */
function isSpriteLibraryPreviewableUrl(url) {
  return /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(String(url || ''));
}

const RIGHT_TABS = [
  { id: 'workspace', label: 'Édition guidée' },
  { id: 'json', label: 'JSON' },
  { id: 'interaction', label: 'Comportements visite' },
  { id: 'dialog', label: 'Bulles de dialogue' },
  { id: 'preview', label: 'Aperçu global' },
];

const STUDIO_MODES = [
  { id: 'packs', label: 'Packs' },
  { id: 'dialogues', label: 'Dialogues' },
];

const VISIT_STATE_LABELS = {
  [VISIT_MASCOT_STATE.IDLE]: 'Repos',
  [VISIT_MASCOT_STATE.WALKING]: 'Marche',
  [VISIT_MASCOT_STATE.HAPPY]: 'Joyeuse',
  [VISIT_MASCOT_STATE.RUNNING]: 'Course',
  [VISIT_MASCOT_STATE.HAPPY_JUMP]: 'Saut joyeux',
  [VISIT_MASCOT_STATE.SPIN]: 'Rotation',
  [VISIT_MASCOT_STATE.INSPECT]: 'Inspection',
  [VISIT_MASCOT_STATE.MAP_READ]: 'Lecture carte',
  [VISIT_MASCOT_STATE.CELEBRATE]: 'Célébration',
  [VISIT_MASCOT_STATE.TALK]: 'Dialogue',
  [VISIT_MASCOT_STATE.ALERT]: 'Alerte',
  [VISIT_MASCOT_STATE.ANGRY]: 'Fâchée',
  [VISIT_MASCOT_STATE.SURPRISE]: 'Surprise',
};

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

/**
 * @param {Record<string, unknown>} pack
 * @param {string} packId
 * @param {string} mapId
 */
function getPackStrictValidation(pack, packId, mapId) {
  const allowedFramesBasePrefixes = ['/assets/mascots/'];
  const packPrefix = serverMascotPackAssetsPrefix(packId);
  if (packPrefix) allowedFramesBasePrefixes.push(packPrefix);
  const libraryPrefix = serverMascotSpriteLibraryAssetsPrefix(mapId);
  if (libraryPrefix) allowedFramesBasePrefixes.push(libraryPrefix);
  return validateMascotPackV1(pack, { allowedFramesBasePrefixes });
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
 * @param {{ mapId: string, mapLabel?: string, onPacksChanged?: () => void | Promise<void>, onForceLogout?: () => void, variant?: 'modal' | 'page', mascotDialogSettings?: { defaults?: Record<string, string[]>, catalogOverrides?: Record<string, Record<string, string[]>> } | null }} props
 */
export default function VisitMascotPackManager({
  mapId,
  mapLabel = '',
  onPacksChanged,
  onForceLogout,
  variant = 'modal',
  mascotDialogSettings = null,
}) {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionIssues, setActionIssues] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  /** @type {[Record<string, unknown>, React.Dispatch<React.SetStateAction<Record<string, unknown>>>]} */
  const [editorPack, setEditorPack] = useState({});
  const [editorTab, setEditorTab] = useState('workspace');
  const [studioMode, setStudioMode] = useState('packs');
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [libAssets, setLibAssets] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libMessage, setLibMessage] = useState('');
  const [globalAssets, setGlobalAssets] = useState([]);
  const [globalAssetsLoading, setGlobalAssetsLoading] = useState(false);
  const [globalAssetsMessage, setGlobalAssetsMessage] = useState('');
  const [globalAssetSearch, setGlobalAssetSearch] = useState('');
  const [globalTargetState, setGlobalTargetState] = useState('idle');
  const [catalogModelIds, setCatalogModelIds] = useState(() => (
    getVisitMascotCatalog().map((m) => String(m?.id || '').trim()).filter(Boolean)
  ));
  const catalogModelOptions = useMemo(
    () => {
      const labelById = new Map(
        getVisitMascotCatalog()
          .map((m) => ({ id: String(m?.id || '').trim(), label: String(m?.label || m?.id || '').trim() }))
          .filter((m) => m.id)
          .map((m) => [m.id, m.label || m.id]),
      );
      return catalogModelIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .map((id) => ({ id, label: labelById.get(id) || id }));
    },
    [catalogModelIds]
  );
  const [selectedCatalogModelId, setSelectedCatalogModelId] = useState(() => (
    getVisitMascotCatalog()[0]?.id || ''
  ));

  const mapTitle = useMemo(() => String(mapLabel || mapId || '').trim() || mapId, [mapLabel, mapId]);

  const loadList = useCallback(async () => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    setLoading(true);
    setListError('');
    try {
      const res = await api(`/api/visit/mascot-packs?map_id=${encodeURIComponent(mid)}`);
      const list = Array.isArray(res?.packs) ? res.packs : [];
      const allowedCatalogIds = Array.isArray(res?.allowed_catalog_ids)
        ? res.allowed_catalog_ids.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (allowedCatalogIds.length > 0) {
        setCatalogModelIds(allowedCatalogIds);
      }
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
    if (!catalogModelOptions.length) {
      setSelectedCatalogModelId('');
      return;
    }
    if (catalogModelOptions.some((opt) => opt.id === selectedCatalogModelId)) return;
    setSelectedCatalogModelId(catalogModelOptions[0].id);
  }, [catalogModelOptions, selectedCatalogModelId]);

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

  const loadGlobalAssets = useCallback(async () => {
    setGlobalAssetsLoading(true);
    setGlobalAssetsMessage('');
    try {
      const res = await api('/api/visit/mascot-assets');
      setGlobalAssets(Array.isArray(res?.assets) ? res.assets : []);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setGlobalAssetsMessage(e.message || 'Impossible de charger les assets globaux');
      setGlobalAssets([]);
    } finally {
      setGlobalAssetsLoading(false);
    }
  }, [onForceLogout]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (editorTab === 'workspace') {
      void loadLibrary();
      void loadGlobalAssets();
    }
  }, [editorTab, loadLibrary, loadGlobalAssets]);

  const selectedRow = packs.find((p) => p.id === selectedId);
  const selectedValidation = useMemo(() => {
    if (!selectedId) return { ok: false, error: null };
    return getPackStrictValidation(sanitizeMascotPackDraft(editorPack), selectedId, String(mapId || '').trim());
  }, [editorPack, selectedId, mapId]);
  const editorWarnings = useMemo(() => {
    const warnings = [];
    const silhouette = String(editorPack?.fallbackSilhouette || '').trim();
    if (silhouette && !MASCOT_PACK_FALLBACK_SILHOUETTES.includes(silhouette)) {
      warnings.push(`Silhouette « ${silhouette} » inconnue.`);
    }
    const stateFrames = editorPack?.stateFrames && typeof editorPack.stateFrames === 'object'
      ? editorPack.stateFrames
      : {};
    if (!stateFrames?.idle) {
      warnings.push('État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.');
    }
    return warnings;
  }, [editorPack]);

  const setActionErrorWithDetails = useCallback((message, details) => {
    const issues = extractMascotPackValidationIssues(details);
    setActionError(String(message || 'Action impossible'));
    setActionIssues(issues);
  }, []);

  useEffect(() => {
    const row = packs.find((p) => p.id === selectedId);
    if (!row) {
      setEditorPack({});
      setLabelDraft('');
      setJsonDraft('{}');
      setJsonError('');
      setActionIssues([]);
      return;
    }
    setLabelDraft(String(row.label || '').trim());
    const raw = row.pack && typeof row.pack === 'object' ? row.pack : {};
    setEditorPack(clonePackDeep(raw));
    setJsonError('');
    setActionIssues([]);
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
    setEditorTab('workspace');
  }, [jsonDraft]);

  const postNewPack = useCallback(async (bodyExtra = {}) => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    setActionBusy(true);
    setActionError('');
    setActionIssues([]);
    try {
      const created = await api('/api/visit/mascot-packs', 'POST', { map_id: mid, is_published: 0, ...bodyExtra });
      const newId = created?.id ? String(created.id) : '';
      if (newId) setSelectedId(newId);
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else {
        if (Array.isArray(e?.allowed_catalog_ids)) {
          const ids = e.allowed_catalog_ids.map((id) => String(id || '').trim()).filter(Boolean);
          if (ids.length > 0) setCatalogModelIds(ids);
        }
        setActionError(e.message || 'Création impossible');
      }
    } finally {
      setActionBusy(false);
    }
  }, [mapId, onRefresh, onForceLogout]);

  const onNewDraft = useCallback(async () => {
    await postNewPack({});
  }, [postNewPack]);

  const onNewFromCatalog = useCallback(async () => {
    const modelId = String(selectedCatalogModelId || '').trim();
    if (!modelId) return;
    await postNewPack({ clone_from_catalog_id: modelId });
  }, [postNewPack, selectedCatalogModelId]);

  const findPackForCatalogModel = useCallback((modelId) => {
    const mid = String(modelId || '').trim();
    if (!mid) return null;
    return packs.find((p) => String(p.pack?.clonedFromCatalogId || '').trim() === mid) || null;
  }, [packs]);

  /** Ouvre une copie modifiable du modèle catalogue sur la carte (réutilise le pack existant si déjà cloné). */
  const openCatalogModelForEdit = useCallback(async (modelId) => {
    const mid = String(modelId || '').trim();
    if (!mid) return;
    setSelectedCatalogModelId(mid);
    const existing = findPackForCatalogModel(mid);
    if (existing?.id) {
      setSelectedId(existing.id);
      setEditorTab('workspace');
      setActionError('');
      return;
    }
    setActionBusy(true);
    setActionError('');
    setActionIssues([]);
    try {
      const midMap = String(mapId || '').trim();
      const created = await api('/api/visit/mascot-packs', 'POST', {
        map_id: midMap,
        is_published: 0,
        clone_from_catalog_id: mid,
      });
      const newId = created?.id ? String(created.id) : '';
      if (newId) {
        setSelectedId(newId);
        setEditorTab('workspace');
      }
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else {
        if (Array.isArray(e?.allowed_catalog_ids)) {
          const ids = e.allowed_catalog_ids.map((id) => String(id || '').trim()).filter(Boolean);
          if (ids.length > 0) setCatalogModelIds(ids);
        }
        setActionError(e.message || 'Impossible d’ouvrir ce modèle pour édition');
      }
    } finally {
      setActionBusy(false);
    }
  }, [mapId, findPackForCatalogModel, onRefresh, onForceLogout]);

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
    setActionIssues([]);
    try {
      const cleanedPack = sanitizeMascotPackDraft(editorPack);
      const precheck = getPackStrictValidation(cleanedPack, selectedId, String(mapId || '').trim());
      if (!precheck.ok) {
        setActionErrorWithDetails(
          'Le pack est invalide. Corrigez les champs indiqués avant enregistrement.',
          precheck.error?.format?.() || precheck.error,
        );
        return;
      }
      const row = packs.find((p) => p.id === selectedId);
      const label = String(labelDraft || '').trim() || String(editorPack.label || '').trim() || 'Pack mascotte';
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
        map_id: String(mapId || '').trim(),
        label,
        pack: cleanedPack,
        is_published: row?.is_published ? 1 : 0,
      });
      setEditorPack(cleanedPack);
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionErrorWithDetails(e.message || 'Enregistrement impossible', e?.body?.details);
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, editorPack, packs, mapId, onRefresh, onForceLogout, labelDraft, setActionErrorWithDetails]);

  const onTogglePublish = useCallback(async () => {
    if (!selectedId) return;
    const row = packs.find((p) => p.id === selectedId);
    if (!row) return;
    setActionBusy(true);
    setActionError('');
    setActionIssues([]);
    try {
      const cleanedPack = sanitizeMascotPackDraft(editorPack);
      const precheck = getPackStrictValidation(cleanedPack, selectedId, String(mapId || '').trim());
      if (!precheck.ok) {
        setActionErrorWithDetails(
          'Publication impossible: pack invalide.',
          precheck.error?.format?.() || precheck.error,
        );
        return;
      }
      const label = String(labelDraft || '').trim() || String(editorPack.label || '').trim() || 'Pack mascotte';
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
        map_id: String(mapId || '').trim(),
        label,
        pack: cleanedPack,
        is_published: row.is_published ? 0 : 1,
      });
      setEditorPack(cleanedPack);
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionErrorWithDetails(e.message || 'Mise à jour impossible', e?.body?.details);
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, editorPack, packs, mapId, onRefresh, onForceLogout, labelDraft, setActionErrorWithDetails]);

  const onDelete = useCallback(async () => {
    if (!selectedId) return;
    if (!window.confirm('Supprimer définitivement ce pack (y compris les fichiers uploadés) ?')) return;
    setActionBusy(true);
    setActionError('');
    setActionIssues([]);
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

  const upgradePackToV2 = useCallback((nextTab = 'interaction') => {
    setEditorPack((prev) => ({
      ...prev,
      mascotPackVersion: 2,
      interactionProfile: typeof prev.interactionProfile === 'object' && prev.interactionProfile
        ? prev.interactionProfile
        : {},
      dialogProfile: typeof prev.dialogProfile === 'object' && prev.dialogProfile
        ? prev.dialogProfile
        : {},
    }));
    setEditorTab(nextTab);
  }, []);

  const patchDialogProfile = useCallback((nextProfile) => {
    setEditorPack((prev) => ({
      ...prev,
      mascotPackVersion: 2,
      dialogProfile: nextProfile && typeof nextProfile === 'object' ? nextProfile : {},
    }));
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
    setEditorTab('workspace');
  }, [mapId]);

  const libraryFilteredAssets = useMemo(() => {
    const q = String(globalAssetSearch || '').trim().toLowerCase();
    if (!q) return globalAssets;
    return globalAssets.filter((a) => {
      const hay = [
        a?.filename,
        a?.url,
        a?.source,
        a?.map_id,
        a?.pack_catalog_id,
        a?.pack_label,
      ].map((x) => String(x || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [globalAssets, globalAssetSearch]);

  const insertGlobalAssetIntoState = useCallback((assetUrl) => {
    const state = String(globalTargetState || '').trim() || 'idle';
    const url = String(assetUrl || '').trim();
    if (!url) return;
    setEditorPack((prev) => {
      const next = { ...(prev || {}) };
      const sf = next.stateFrames && typeof next.stateFrames === 'object' ? { ...next.stateFrames } : {};
      const cur = sf[state] && typeof sf[state] === 'object' ? { ...sf[state] } : {};
      let srcs = [];
      if (Array.isArray(cur.srcs) && cur.srcs.length > 0) {
        srcs = cur.srcs.map((u) => String(u || '').trim()).filter(Boolean);
      } else if (Array.isArray(cur.files) && cur.files.length > 0) {
        const base = String(next.framesBase || '').trim();
        const normalizedBase = base.endsWith('/') ? base : (base ? `${base}/` : '');
        srcs = cur.files
          .map((f) => `${normalizedBase}${String(f || '').replace(/^\//, '')}`)
          .map((u) => String(u || '').trim())
          .filter(Boolean);
      }
      if (!srcs.includes(url)) srcs.push(url);
      sf[state] = {
        ...cur,
        srcs,
        fps: Math.max(1, Number(cur.fps) || 8),
      };
      delete sf[state].files;
      next.stateFrames = sf;
      return next;
    });
    setEditorTab('workspace');
  }, [globalTargetState]);

  const packDialogInheritedContext = useMemo(() => {
    const catalogId = String(selectedRow?.catalog_id || editorPack?.id || '').trim();
    return {
      mascotId: catalogId,
      extraCatalogEntries: [],
      globalDefaults: mascotDialogSettings?.defaults || null,
      catalogOverrides: mascotDialogSettings?.catalogOverrides || null,
    };
  }, [editorPack?.id, mascotDialogSettings, selectedRow?.catalog_id]);

  return (
    <div
      className={`visit-mascot-pack-manager ${variant === 'page' ? 'visit-mascot-pack-manager--page' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...(variant === 'page'
          ? { minHeight: '60vh' }
          : { maxHeight: 'min(85vh, 900px)', overflow: 'auto' }),
      }}
    >
      <div className="visit-mascot-pack-manager__studio-modes" role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {STUDIO_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={studioMode === mode.id}
            className={`btn btn-sm ${studioMode === mode.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStudioMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {studioMode === 'dialogues' ? (
        <VisitMascotDialogStudioView onForceLogout={onForceLogout} />
      ) : (
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'stretch', flex: 1 }}>
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
          <br />
          Les <strong>modèles intégrés</strong> (SPR0UT, Renard 2, …) ne se modifient pas directement : utilisez
          {' '}<strong>Éditer sur cette carte</strong> pour ouvrir une copie modifiable (sprites, comportements).
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
          <div style={{ width: '100%' }}>
            <p className="section-sub" style={{ fontSize: '0.78rem', margin: '4px 0 6px' }}>Modèles intégrés (catalogue)</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {catalogModelOptions.map((opt) => {
                const linkedPack = findPackForCatalogModel(opt.id);
                return (
                  <li key={opt.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${selectedCatalogModelId === opt.id ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                      aria-pressed={selectedCatalogModelId === opt.id}
                      onClick={() => setSelectedCatalogModelId(opt.id)}
                      disabled={actionBusy}
                    >
                      {opt.label}
                      {linkedPack ? (
                        <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.85, fontWeight: 400 }}>
                          Copie sur carte : {linkedPack.label || linkedPack.catalog_id}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%' }}
                      disabled={actionBusy}
                      onClick={() => void openCatalogModelForEdit(opt.id)}
                      title={linkedPack
                        ? 'Ouvrir la copie modifiable déjà créée pour cette carte'
                        : 'Créer puis ouvrir une copie modifiable de ce modèle'}
                    >
                      {linkedPack ? 'Éditer la copie' : 'Éditer sur cette carte'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={actionBusy || !selectedCatalogModelId}
            onClick={() => void onNewFromCatalog()}
            title="Créer un second pack indépendant depuis le modèle sélectionné"
          >
            Nouvelle copie depuis ce modèle
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
          <p className="section-sub">
            Aucun pack pour la carte <strong>{mapTitle}</strong> — créez un brouillon
            {' '}ou changez de carte dans l’onglet studio.
          </p>
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
            {selectedValidation.ok ? (
              <p className="section-sub" style={{ fontSize: '0.78rem', margin: '2px 0 0' }}>
                Validation prête pour sauvegarde/publication.
              </p>
            ) : (
              <p className="text-danger" style={{ fontSize: '0.78rem', margin: '2px 0 0' }}>
                Pack invalide: corrigez les erreurs avant publication.
              </p>
            )}
            {editorWarnings.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.78rem' }}>
                {editorWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            ) : null}
            <button type="button" className="btn btn-danger btn-sm" disabled={actionBusy} onClick={() => void onDelete()}>
              Supprimer…
            </button>
          </div>
        ) : null}
        {actionError ? (
          <div className="text-danger" role="alert" style={{ fontSize: '0.82rem', marginTop: 10 }}>
            <p style={{ margin: 0 }}>{actionError}</p>
            {actionIssues.length > 0 ? (
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                {toMascotPackIssueLines(actionIssues).map((line) => <li key={line}>{line}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </aside>
      <div style={{ flex: '1 1 420px', minWidth: 300 }}>
        {!selectedId ? (
          <div className="section-sub">
            <p style={{ marginTop: 0 }}>
              Sélectionnez un <strong>pack de la liste</strong> (brouillon ou publié), ou choisissez un
              {' '}<strong>modèle intégré</strong> à gauche puis <strong>Éditer sur cette carte</strong>.
            </p>
            <p style={{ fontSize: '0.82rem', opacity: 0.9, marginBottom: 0 }}>
              L’onglet <strong>Aperçu global</strong> permet de comparer les modèles ; les onglets
              {' '}<strong>Édition guidée</strong>, <strong>JSON</strong> et <strong>Comportements visite</strong>
              {' '}modifient uniquement le pack sélectionné dans la colonne de gauche.
            </p>
          </div>
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
            {editorTab === 'workspace' ? <PackBehaviorDetailTable pack={editorPack} /> : null}
            {editorTab === 'workspace' ? (
              <div style={{ marginTop: 10 }}>
                <MascotPackWysiwygEditor
                  pack={editorPack}
                  onPackChange={setEditorPack}
                  packUuid={selectedId}
                  catalogId={selectedRow?.catalog_id || ''}
                  visitMapId={String(mapId || '').trim()}
                  onForceLogout={onForceLogout}
                />
              </div>
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
            {editorTab === 'workspace' ? (
              <div>
                <section style={{ marginBottom: 16 }}>
                  <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Bibliothèque de la carte</h3>
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
                  {libAssets.length === 0 && !libLoading ? (
                    <p className="section-sub" style={{ marginTop: 10 }}>Aucun PNG dans la bibliothèque pour cette carte.</p>
                  ) : null}
                  {libAssets.length > 0 ? (
                    <ul className="mascot-pack-wysiwyg__asset-grid" style={{ marginTop: 12 }} aria-label="Sprites de la bibliothèque carte">
                      {libAssets.map((a) => (
                        <li key={a.filename} className="mascot-pack-wysiwyg__asset-card">
                          <div
                            className="mascot-pack-wysiwyg__asset-thumb"
                            style={{ cursor: 'default' }}
                            title={a.filename}
                          >
                            <img
                              src={withAppBase(a.url)}
                              alt={`Aperçu ${a.filename}`}
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          <div className="mascot-pack-wysiwyg__asset-name">
                            <code>{a.filename}</code>
                          </div>
                          <div className="mascot-pack-wysiwyg__asset-actions">
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => void onLibDelete(a.filename)}>
                              Supprimer
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section>
                  <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Tous les assets mascotte du site</h3>
                  <p className="section-sub" style={{ fontSize: '0.82rem' }}>
                    Vue globale : catalogue statique + assets des packs + bibliothèques cartes, sans dépendre de la mascotte en cours d’édition.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadGlobalAssets()}>
                      Actualiser assets site
                    </button>
                    <input
                      className="form-input"
                      style={{ minWidth: 220 }}
                      placeholder="Filtrer (nom, map, source, URL)…"
                      value={globalAssetSearch}
                      onChange={(e) => setGlobalAssetSearch(e.target.value)}
                    />
                    <label className="section-sub" style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Insérer dans état
                      <select
                        className="form-select"
                        value={globalTargetState}
                        onChange={(e) => setGlobalTargetState(e.target.value)}
                      >
                        {Object.values(VISIT_MASCOT_STATE).map((st) => (
                          <option key={st} value={st}>{VISIT_STATE_LABELS[st] || st} ({st})</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {globalAssetsMessage ? <p className="section-sub" style={{ marginTop: 8 }}>{globalAssetsMessage}</p> : null}
                  {globalAssetsLoading ? <p className="section-sub">Chargement assets globaux…</p> : null}
                  <div style={{ maxHeight: 330, overflow: 'auto', border: '1px solid rgba(26,71,49,0.12)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(26,71,49,0.18)' }}>
                          <th style={{ padding: '6px 8px', width: 76 }}>Aperçu</th>
                          <th style={{ padding: '6px 8px' }}>Source</th>
                          <th style={{ padding: '6px 8px' }}>Fichier</th>
                          <th style={{ padding: '6px 8px' }}>URL</th>
                          <th style={{ padding: '6px 8px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {libraryFilteredAssets.map((asset) => (
                          <tr key={asset.id} style={{ borderBottom: '1px solid rgba(26,71,49,0.08)' }}>
                            <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                              {isSpriteLibraryPreviewableUrl(asset.url) ? (
                                <img
                                  src={withAppBase(asset.url)}
                                  alt=""
                                  width={56}
                                  height={56}
                                  loading="lazy"
                                  decoding="async"
                                  style={{
                                    display: 'block',
                                    width: 56,
                                    height: 56,
                                    objectFit: 'contain',
                                    borderRadius: 6,
                                    background: 'rgba(248,250,245,0.95)',
                                    border: '1px solid rgba(26,71,49,0.12)',
                                  }}
                                />
                              ) : (
                                <span className="section-sub" title="Pas d’aperçu pour ce type de fichier">—</span>
                              )}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <code>{asset.source}</code>
                              {asset.map_id ? <span>{` · ${asset.map_id}`}</span> : null}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <code>{asset.filename || '—'}</code>
                            </td>
                            <td style={{ padding: '6px 8px', maxWidth: 320, wordBreak: 'break-all' }}>
                              <code>{asset.url}</code>
                            </td>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void navigator.clipboard.writeText(asset.url || '')}
                              >
                                Copier URL
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ marginLeft: 6 }}
                                onClick={() => insertGlobalAssetIntoState(asset.url)}
                              >
                                Utiliser
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!globalAssetsLoading && libraryFilteredAssets.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '10px 8px' }} className="section-sub">
                              Aucun asset trouvé pour ce filtre.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
            {editorTab === 'interaction' ? (
              <div>
                <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
                  Réactions de la mascotte sur la carte (pack v2). Les valeurs par défaut reproduisent le comportement historique.
                </p>
                {Number(editorPack.mascotPackVersion) !== 2 ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => upgradePackToV2('interaction')}>
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
                                      <option key={st} value={st}>{VISIT_STATE_LABELS[st] || st} ({st})</option>
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
            {editorTab === 'dialog' ? (
              <div>
                <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
                  Messages de bulle pour ce pack (priorité maximale sur les défauts globaux et catalogue).
                </p>
                {Number(editorPack.mascotPackVersion) !== 2 ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => upgradePackToV2('dialog')}>
                    Passer ce pack en version 2 (bulles de dialogue)
                  </button>
                ) : (
                  <VisitMascotDialogEditor
                    profile={
                      editorPack.dialogProfile && typeof editorPack.dialogProfile === 'object'
                        ? editorPack.dialogProfile
                        : {}
                    }
                    onProfileChange={patchDialogProfile}
                    inheritedContext={packDialogInheritedContext}
                    allowInheritToggle
                  />
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
      )}
    </div>
  );
}
