import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { api, AccountDeletedError } from '../services/api';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';
import {
  clonePackDeep,
  parsePackJson,
  stringifyPack,
} from '../utils/mascotPackEditorModel.js';
import {
  getPackStrictValidation,
  computeEditorWarnings,
  filterGlobalAssets,
  insertAssetUrlIntoPackState,
} from '../utils/visitMascotPackManager.js';
import PackBehaviorDetailTable from './mascot/PackBehaviorDetailTable.jsx';
import { getVisitMascotCatalog } from '../utils/visitMascotCatalog.js';
import {
  extractMascotPackValidationIssues,
  sanitizeMascotPackDraft,
} from '../utils/mascotPackValidationUi.js';
import {
  DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE,
} from '../utils/visitMascotInteractionEvents.js';
import VisitMascotDialogEditor from './VisitMascotDialogEditor.jsx';
import VisitMascotDialogStudioView from './VisitMascotDialogStudioView.jsx';
import VisitMascotStudioPreviewSection from './mascot/VisitMascotStudioPreviewSection.jsx';
import MascotPackListAside from './mascot/MascotPackListAside.jsx';
import MascotAssetsLibraryPanel from './mascot/MascotAssetsLibraryPanel.jsx';
import MascotInteractionProfileEditor from './mascot/MascotInteractionProfileEditor.jsx';

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
  const editorWarnings = useMemo(() => computeEditorWarnings(editorPack), [editorPack]);

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

  const libraryFilteredAssets = useMemo(
    () => filterGlobalAssets(globalAssets, globalAssetSearch),
    [globalAssets, globalAssetSearch],
  );

  const insertGlobalAssetIntoState = useCallback((assetUrl) => {
    const url = String(assetUrl || '').trim();
    if (!url) return;
    setEditorPack((prev) => insertAssetUrlIntoPackState(prev, globalTargetState, url));
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
      <MascotPackListAside
        mapTitle={mapTitle}
        actionBusy={actionBusy}
        catalogModelOptions={catalogModelOptions}
        selectedCatalogModelId={selectedCatalogModelId}
        onSelectCatalogModel={setSelectedCatalogModelId}
        findPackForCatalogModel={findPackForCatalogModel}
        onNewDraft={() => void onNewDraft()}
        onOpenCatalogModelForEdit={(id) => void openCatalogModelForEdit(id)}
        onNewFromCatalog={() => void onNewFromCatalog()}
        onRefresh={() => void onRefresh()}
        onDuplicateSelected={() => void onDuplicateSelected()}
        listError={listError}
        loading={loading}
        packs={packs}
        selectedId={selectedId}
        onSelectPack={setSelectedId}
        selectedRow={selectedRow}
        labelDraft={labelDraft}
        onLabelDraftChange={setLabelDraft}
        onSave={() => void onSave()}
        onTogglePublish={() => void onTogglePublish()}
        onDelete={() => void onDelete()}
        selectedValidation={selectedValidation}
        editorWarnings={editorWarnings}
        actionError={actionError}
        actionIssues={actionIssues}
      />
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
              <MascotAssetsLibraryPanel
                libAssets={libAssets}
                libLoading={libLoading}
                libMessage={libMessage}
                onReloadLibrary={() => void loadLibrary()}
                onSetFramesBaseToLibrary={setFramesBaseToLibrary}
                onLibUpload={(e) => void onLibUpload(e)}
                onLibDelete={(filename) => void onLibDelete(filename)}
                globalAssetsLoading={globalAssetsLoading}
                globalAssetsMessage={globalAssetsMessage}
                filteredAssets={libraryFilteredAssets}
                globalAssetSearch={globalAssetSearch}
                onGlobalAssetSearchChange={setGlobalAssetSearch}
                globalTargetState={globalTargetState}
                onGlobalTargetStateChange={setGlobalTargetState}
                onReloadGlobalAssets={() => void loadGlobalAssets()}
                onInsertGlobalAsset={insertGlobalAssetIntoState}
              />
            ) : null}
            {editorTab === 'interaction' ? (
              <MascotInteractionProfileEditor
                pack={editorPack}
                onUpgradeToV2={() => upgradePackToV2('interaction')}
                onPatchRule={patchInteractionRule}
              />
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
