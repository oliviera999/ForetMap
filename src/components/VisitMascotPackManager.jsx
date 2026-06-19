import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';
import { clonePackDeep, parsePackJson, stringifyPack, ensureServerFramesBase } from '../utils/mascotPackEditorModel.js';
import { sanitizeClientFilename } from '../utils/mascotPackEditorFrames.js';
import {
  getPackStrictValidation,
  computeEditorWarnings,
  insertMascotImageIntoPackState,
  createMascotPackEditorSnapshot,
  isMascotPackEditorDirty,
} from '../utils/visitMascotPackManager.js';
import PackBehaviorDetailTable from './mascot/PackBehaviorDetailTable.jsx';
import { getVisitMascotCatalog } from '../utils/visitMascotCatalog.js';
import {
  extractMascotPackValidationIssues,
  sanitizeMascotPackDraft,
} from '../utils/mascotPackValidationUi.js';
import { DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE } from '../utils/visitMascotInteractionEvents.js';
import VisitMascotDialogEditor from './VisitMascotDialogEditor.jsx';
import VisitMascotDialogStudioView from './VisitMascotDialogStudioView.jsx';
import VisitMascotStudioPreviewSection from './mascot/VisitMascotStudioPreviewSection.jsx';
import MascotPackListAside from './mascot/MascotPackListAside.jsx';
import MascotPackImagesPanel from './mascot/MascotPackImagesPanel.jsx';
import MascotInteractionProfileEditor from './mascot/MascotInteractionProfileEditor.jsx';
import MascotStudioModeTabs from './mascot/MascotStudioModeTabs.jsx';

import { STATE_LABELS } from '../constants/mascotStateLabels.js';

const UNSAVED_LEAVE_MSG =
  'Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?';

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
  const [jsonCopyFeedback, setJsonCopyFeedback] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [libAssets, setLibAssets] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libMessage, setLibMessage] = useState('');
  const [globalAssets, setGlobalAssets] = useState([]);
  const [globalAssetsLoading, setGlobalAssetsLoading] = useState(false);
  const [globalAssetsMessage, setGlobalAssetsMessage] = useState('');
  const [imageSourceFilter, setImageSourceFilter] = useState('all');
  const [imageSearch, setImageSearch] = useState('');
  const [globalTargetState, setGlobalTargetState] = useState('idle');
  const [packAssets, setPackAssets] = useState([]);
  const [packAssetsLoading, setPackAssetsLoading] = useState(false);
  const [packAssetsMessage, setPackAssetsMessage] = useState('');
  const [insertFeedback, setInsertFeedback] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [catalogModelIds, setCatalogModelIds] = useState(() =>
    getVisitMascotCatalog()
      .map((m) => String(m?.id || '').trim())
      .filter(Boolean),
  );
  const catalogModelOptions = useMemo(() => {
    const labelById = new Map(
      getVisitMascotCatalog()
        .map((m) => ({
          id: String(m?.id || '').trim(),
          label: String(m?.label || m?.id || '').trim(),
        }))
        .filter((m) => m.id)
        .map((m) => [m.id, m.label || m.id]),
    );
    return catalogModelIds
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .map((id) => ({ id, label: labelById.get(id) || id }));
  }, [catalogModelIds]);
  const [selectedCatalogModelId, setSelectedCatalogModelId] = useState(
    () => getVisitMascotCatalog()[0]?.id || '',
  );

  const mapTitle = useMemo(
    () => String(mapLabel || mapId || '').trim() || mapId,
    [mapLabel, mapId],
  );

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

  const loadPackAssets = useCallback(async () => {
    const id = String(selectedId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setPackAssets([]);
      return;
    }
    setPackAssetsLoading(true);
    setPackAssetsMessage('');
    try {
      const res = await api(`/api/visit/mascot-packs/${encodeURIComponent(id)}/assets`);
      setPackAssets(Array.isArray(res?.assets) ? res.assets : []);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setPackAssetsMessage(e.message || 'Impossible de charger la médiathèque du pack');
      setPackAssets([]);
    } finally {
      setPackAssetsLoading(false);
    }
  }, [selectedId, onForceLogout]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (editorTab === 'workspace' && selectedId) {
      void loadPackAssets();
      void loadLibrary();
      void loadGlobalAssets();
    }
  }, [editorTab, selectedId, loadPackAssets, loadLibrary, loadGlobalAssets]);

  const isDirty = useMemo(
    () => isMascotPackEditorDirty(savedSnapshot, editorPack, labelDraft),
    [savedSnapshot, editorPack, labelDraft],
  );

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const selectedRow = packs.find((p) => p.id === selectedId);
  const selectedValidation = useMemo(() => {
    if (!selectedId) return { ok: false, error: null };
    return getPackStrictValidation(
      sanitizeMascotPackDraft(editorPack),
      selectedId,
      String(mapId || '').trim(),
    );
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
      setSavedSnapshot(null);
      return;
    }
    const label = String(row.label || '').trim();
    setLabelDraft(label);
    const raw = row.pack && typeof row.pack === 'object' ? row.pack : {};
    const packClone = clonePackDeep(raw);
    setEditorPack(packClone);
    setSavedSnapshot(createMascotPackEditorSnapshot(packClone, label));
    setJsonError('');
    setActionIssues([]);
  }, [selectedId, packs]);

  const onRefresh = useCallback(async () => {
    await loadList();
    await onPacksChanged?.();
  }, [loadList, onPacksChanged]);

  const confirmLeaveIfDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(UNSAVED_LEAVE_MSG);
  }, [isDirty]);

  const requestSelectPack = useCallback(
    (id) => {
      if (id === selectedId) return;
      if (!confirmLeaveIfDirty()) return;
      setSelectedId(id);
    },
    [selectedId, confirmLeaveIfDirty],
  );

  const requestStudioMode = useCallback(
    (mode) => {
      if (mode === studioMode) return;
      if (!confirmLeaveIfDirty()) return;
      setStudioMode(mode);
    },
    [studioMode, confirmLeaveIfDirty],
  );

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

  const postNewPack = useCallback(
    async (bodyExtra = {}) => {
      const mid = String(mapId || '').trim();
      if (!mid) return;
      setActionBusy(true);
      setActionError('');
      setActionIssues([]);
      try {
        const created = await api('/api/visit/mascot-packs', 'POST', {
          map_id: mid,
          is_published: 0,
          ...bodyExtra,
        });
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
    },
    [mapId, onRefresh, onForceLogout],
  );

  const onNewDraft = useCallback(async () => {
    if (!confirmLeaveIfDirty()) return;
    await postNewPack({});
  }, [postNewPack, confirmLeaveIfDirty]);

  const onNewFromCatalog = useCallback(async () => {
    const modelId = String(selectedCatalogModelId || '').trim();
    if (!modelId) return;
    if (!confirmLeaveIfDirty()) return;
    await postNewPack({ clone_from_catalog_id: modelId });
  }, [postNewPack, selectedCatalogModelId, confirmLeaveIfDirty]);

  const findPackForCatalogModel = useCallback(
    (modelId) => {
      const mid = String(modelId || '').trim();
      if (!mid) return null;
      return packs.find((p) => String(p.pack?.clonedFromCatalogId || '').trim() === mid) || null;
    },
    [packs],
  );

  /** Ouvre une copie modifiable du modèle catalogue sur la carte (réutilise le pack existant si déjà cloné). */
  const openCatalogModelForEdit = useCallback(
    async (modelId) => {
      const mid = String(modelId || '').trim();
      if (!mid) return;
      setSelectedCatalogModelId(mid);
      const existing = findPackForCatalogModel(mid);
      if (existing?.id) {
        if (existing.id !== selectedId && !confirmLeaveIfDirty()) return;
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
    },
    [mapId, findPackForCatalogModel, onRefresh, onForceLogout, selectedId, confirmLeaveIfDirty],
  );

  const onDuplicateSelected = useCallback(async () => {
    if (!selectedId) return;
    if (!confirmLeaveIfDirty()) return;
    if (!window.confirm('Dupliquer ce pack (copie JSON et fichiers uploadés) ?')) return;
    await postNewPack({ clone_from_pack_id: selectedId });
  }, [selectedId, postNewPack, confirmLeaveIfDirty]);

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
      const label =
        String(labelDraft || '').trim() || String(editorPack.label || '').trim() || 'Pack mascotte';
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
        map_id: String(mapId || '').trim(),
        label,
        pack: cleanedPack,
        is_published: row?.is_published ? 1 : 0,
      });
      setEditorPack(cleanedPack);
      setSavedSnapshot(createMascotPackEditorSnapshot(cleanedPack, label));
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionErrorWithDetails(e.message || 'Enregistrement impossible', e?.body?.details);
    } finally {
      setActionBusy(false);
    }
  }, [
    selectedId,
    editorPack,
    packs,
    mapId,
    onRefresh,
    onForceLogout,
    labelDraft,
    setActionErrorWithDetails,
  ]);

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
      const label =
        String(labelDraft || '').trim() || String(editorPack.label || '').trim() || 'Pack mascotte';
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
        map_id: String(mapId || '').trim(),
        label,
        pack: cleanedPack,
        is_published: row.is_published ? 0 : 1,
      });
      setEditorPack(cleanedPack);
      setSavedSnapshot(createMascotPackEditorSnapshot(cleanedPack, label));
      await onRefresh();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionErrorWithDetails(e.message || 'Mise à jour impossible', e?.body?.details);
    } finally {
      setActionBusy(false);
    }
  }, [
    selectedId,
    editorPack,
    packs,
    mapId,
    onRefresh,
    onForceLogout,
    labelDraft,
    setActionErrorWithDetails,
  ]);

  const onDelete = useCallback(async () => {
    if (!selectedId) return;
    if (!window.confirm('Supprimer définitivement ce pack (y compris les fichiers uploadés) ?'))
      return;
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
      interactionProfile:
        typeof prev.interactionProfile === 'object' && prev.interactionProfile
          ? prev.interactionProfile
          : {},
      dialogProfile:
        typeof prev.dialogProfile === 'object' && prev.dialogProfile ? prev.dialogProfile : {},
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
      const base =
        Number(prev.mascotPackVersion) === 2 &&
        prev.interactionProfile &&
        typeof prev.interactionProfile === 'object'
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
        const st = String(
          nextRule.state || (def.mode === 'transient' ? def.state : 'idle') || 'idle',
        );
        const dm =
          nextRule.durationMs != null
            ? Number(nextRule.durationMs)
            : def.mode === 'transient' && def.durationMs != null
              ? Number(def.durationMs)
              : 1500;
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

  const onLibUpload = useCallback(
    async (ev) => {
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
          const safeName =
            file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase() || 'import.png';
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
    },
    [mapId, selectedId, loadLibrary, onForceLogout],
  );

  const onLibDelete = useCallback(
    async (filename) => {
      const mid = String(mapId || '').trim();
      if (!window.confirm(`Supprimer « ${filename} » de la bibliothèque ?`)) return;
      setLibLoading(true);
      try {
        await api(
          `/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets/${encodeURIComponent(filename)}`,
          'DELETE',
        );
        await loadLibrary();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setLibMessage(e.message || 'Suppression impossible');
      } finally {
        setLibLoading(false);
      }
    },
    [mapId, loadLibrary, onForceLogout],
  );

  const setFramesBaseToLibrary = useCallback(() => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    const prefix = `/api/visit/mascot-sprite-library/${mid}/assets/`;
    setEditorPack((p) => ({ ...p, framesBase: prefix.endsWith('/') ? prefix : `${prefix}/` }));
  }, [mapId]);

  const setFramesBaseToPack = useCallback(() => {
    if (!selectedId) return;
    setEditorPack((p) => ensureServerFramesBase(p, selectedId));
  }, [selectedId]);

  const fileToPngDataUrl = useCallback(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Lecture fichier impossible'));
        reader.onload = () => {
          const dataUrl = reader.result;
          const img = new Image();
          img.onerror = () => reject(new Error('Image invalide'));
          img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const max = 2048;
            if (w > max || h > max) {
              if (w >= h) {
                h = Math.round((h * max) / w);
                w = max;
              } else {
                w = Math.round((w * max) / h);
                h = max;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas indisponible'));
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/png'));
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }),
    [],
  );

  const onPackUpload = useCallback(
    async (ev) => {
      const file = ev.target?.files?.[0];
      ev.target.value = '';
      if (!file || !selectedId) return;
      const filename = sanitizeClientFilename(file.name);
      setPackAssetsMessage('Envoi en cours…');
      try {
        const dataUrl = await fileToPngDataUrl(file);
        await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/assets`, 'POST', {
          filename,
          image_data: dataUrl,
        });
        setPackAssetsMessage(`Fichier « ${filename} » enregistré sur le pack.`);
        await loadPackAssets();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setPackAssetsMessage(e.message || 'Import pack impossible');
      }
    },
    [selectedId, fileToPngDataUrl, loadPackAssets, onForceLogout],
  );

  const onPackDeleteAsset = useCallback(
    async (filename) => {
      if (!selectedId || !filename) return;
      if (!window.confirm(`Supprimer « ${filename} » de la médiathèque du pack ?`)) return;
      setPackAssetsLoading(true);
      try {
        await api(
          `/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/assets/${encodeURIComponent(filename)}`,
          'DELETE',
        );
        setPackAssetsMessage(`« ${filename} » supprimé du pack.`);
        await loadPackAssets();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setPackAssetsMessage(e.message || 'Suppression pack impossible');
      } finally {
        setPackAssetsLoading(false);
      }
    },
    [selectedId, loadPackAssets, onForceLogout],
  );

  const insertImageIntoPack = useCallback(
    (entry) => {
      if (!entry) return;
      setEditorPack((prev) =>
        insertMascotImageIntoPackState(prev, globalTargetState, {
          kind: entry.kind,
          filename: entry.filename,
          url: entry.url,
          framesBaseHint: entry.framesBaseHint,
        }),
      );
      const stateLabel = STATE_LABELS[globalTargetState] || globalTargetState;
      setInsertFeedback(`« ${entry.filename} » ajouté à l’état « ${stateLabel} ».`);
      setTimeout(() => setInsertFeedback(''), 2800);
    },
    [globalTargetState],
  );

  const reloadAllImages = useCallback(() => {
    void loadPackAssets();
    void loadLibrary();
    void loadGlobalAssets();
  }, [loadPackAssets, loadLibrary, loadGlobalAssets]);

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
      <MascotStudioModeTabs
        modes={STUDIO_MODES}
        activeMode={studioMode}
        onSelectMode={requestStudioMode}
      />
      {studioMode === 'dialogues' ? (
        <VisitMascotDialogStudioView onForceLogout={onForceLogout} />
      ) : (
        <div className="visit-mascot-pack-manager__layout">
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
            onSelectPack={requestSelectPack}
            selectedRow={selectedRow}
            labelDraft={labelDraft}
            onLabelDraftChange={setLabelDraft}
            isDirty={isDirty}
            onSave={() => void onSave()}
            onTogglePublish={() => void onTogglePublish()}
            onDelete={() => void onDelete()}
            selectedValidation={selectedValidation}
            editorWarnings={editorWarnings}
            actionError={actionError}
            actionIssues={actionIssues}
          />
          <div style={{ flex: '1 1 420px', minWidth: 300 }} className="visit-mascot-pack-manager__main">
            {!selectedId ? (
              <div className="section-sub" role="tabpanel" id="mascot-pack-tabpanel-empty">
                <p style={{ marginTop: 0 }}>
                  Sélectionnez un <strong>pack de la liste</strong> (brouillon ou publié), ou
                  choisissez un <strong>modèle intégré</strong> à gauche puis{' '}
                  <strong>Éditer sur cette carte</strong>.
                </p>
                <p style={{ fontSize: '0.82rem', opacity: 0.9, marginBottom: 0 }}>
                  L’onglet <strong>Aperçu global</strong> permet de comparer les modèles ; les
                  onglets <strong>Édition guidée</strong>, <strong>JSON</strong> et{' '}
                  <strong>Comportements visite</strong> modifient uniquement le pack sélectionné
                  dans la colonne de gauche.
                </p>
              </div>
            ) : (
              <>
                <div
                  className="visit-mascot-pack-manager__tabs"
                  role="tablist"
                  aria-label="Sections d’édition du pack"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}
                >
                  {RIGHT_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      id={`mascot-pack-tab-${t.id}`}
                      aria-selected={editorTab === t.id}
                      aria-controls={`mascot-pack-tabpanel-${t.id}`}
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
                {editorTab === 'workspace' ? (
                  <div
                    role="tabpanel"
                    id="mascot-pack-tabpanel-workspace"
                    aria-labelledby="mascot-pack-tab-workspace"
                  >
                    <PackBehaviorDetailTable pack={editorPack} />
                    <div style={{ marginTop: 10 }}>
                      <MascotPackWysiwygEditor
                        pack={editorPack}
                        onPackChange={setEditorPack}
                        packUuid={selectedId}
                        catalogId={selectedRow?.catalog_id || ''}
                        visitMapId={String(mapId || '').trim()}
                        packAssets={packAssets}
                        onForceLogout={onForceLogout}
                      />
                    </div>
                    <MascotPackImagesPanel
                      packUuid={selectedId}
                      mapId={String(mapId || '').trim()}
                      packAssets={packAssets}
                      packAssetsLoading={packAssetsLoading}
                      packAssetsMessage={packAssetsMessage}
                      libAssets={libAssets}
                      libLoading={libLoading}
                      libMessage={libMessage}
                      globalAssets={globalAssets}
                      globalAssetsLoading={globalAssetsLoading}
                      globalAssetsMessage={globalAssetsMessage}
                      targetState={globalTargetState}
                      onTargetStateChange={setGlobalTargetState}
                      sourceFilter={imageSourceFilter}
                      onSourceFilterChange={setImageSourceFilter}
                      search={imageSearch}
                      onSearchChange={setImageSearch}
                      onReloadAll={reloadAllImages}
                      onPackUpload={(e) => void onPackUpload(e)}
                      onMapUpload={(e) => void onLibUpload(e)}
                      onSetFramesBasePack={setFramesBaseToPack}
                      onSetFramesBaseMap={setFramesBaseToLibrary}
                      onInsertImage={insertImageIntoPack}
                      onDeletePackAsset={(f) => void onPackDeleteAsset(f)}
                      onDeleteMapAsset={(f) => void onLibDelete(f)}
                      insertFeedback={insertFeedback}
                    />
                  </div>
                ) : null}
                {editorTab === 'json' ? (
                  <div
                    className="mascot-pack-json-tab"
                    role="tabpanel"
                    id="mascot-pack-tabpanel-json"
                    aria-labelledby="mascot-pack-tab-json"
                  >
                    <p className="section-sub" style={{ fontSize: '0.82rem' }}>
                      Modifiez le JSON puis « Appliquer ».
                    </p>
                    <textarea
                      value={jsonDraft}
                      onChange={(ev) => {
                        setJsonDraft(ev.target.value);
                        setJsonError('');
                      }}
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
                      <p className="text-danger" role="alert" style={{ fontSize: '0.82rem' }}>
                        {jsonError}
                      </p>
                    ) : null}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={applyJsonDraft}
                      >
                        Appliquer le JSON
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(jsonDraft);
                          setJsonCopyFeedback('JSON copié dans le presse-papiers.');
                          setTimeout(() => setJsonCopyFeedback(''), 2500);
                        }}
                      >
                        Copier
                      </button>
                      {jsonCopyFeedback ? (
                        <span className="section-sub" role="status" style={{ fontSize: '0.8rem' }}>
                          {jsonCopyFeedback}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {editorTab === 'interaction' ? (
                  <div
                    role="tabpanel"
                    id="mascot-pack-tabpanel-interaction"
                    aria-labelledby="mascot-pack-tab-interaction"
                  >
                  <MascotInteractionProfileEditor
                    pack={editorPack}
                    onUpgradeToV2={() => upgradePackToV2('interaction')}
                    onPatchRule={patchInteractionRule}
                  />
                  </div>
                ) : null}
                {editorTab === 'dialog' ? (
                  <div
                    role="tabpanel"
                    id="mascot-pack-tabpanel-dialog"
                    aria-labelledby="mascot-pack-tab-dialog"
                  >
                    <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
                      Messages de bulle pour ce pack (priorité maximale sur les défauts globaux et
                      catalogue).
                    </p>
                    {Number(editorPack.mascotPackVersion) !== 2 ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => upgradePackToV2('dialog')}
                      >
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
                  <div
                    role="tabpanel"
                    id="mascot-pack-tabpanel-preview"
                    aria-labelledby="mascot-pack-tab-preview"
                  >
                  <VisitMascotStudioPreviewSection
                    packs={packs}
                    mapId={String(mapId || '')}
                    onForceLogout={onForceLogout}
                  />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
