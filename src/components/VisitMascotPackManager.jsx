import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, AccountDeletedError, withAppBase } from '../services/api';
import MascotPackWysiwygEditor from './MascotPackWysiwygEditor.jsx';
import {
  clonePackDeep,
  parsePackJson,
  stringifyPack,
  ensureServerFramesBase,
  packToUnifiedForm,
} from '../utils/mascotPackEditorModel.js';
import { normalizeUnifiedStates } from '../utils/mascotPack.js';
import {
  removeFilenamesFromStateFrames,
  moveFilenameBlockInStateFrames,
} from '../utils/mascotPackEditorFrames.js';
import {
  getPackStrictValidation,
  computeEditorWarnings,
  insertMascotImageIntoPackState,
  insertMascotImagesIntoPackState,
  createMascotPackEditorSnapshot,
  isMascotPackEditorDirty,
  isJsonDraftDirty,
  resolvePackDialogMascotId,
  findPacksForCatalogModel,
  pickPreferredCatalogModelPack,
  buildPackAssetPreviewByFilename,
  listMissingPackFrameFilenames,
  resolveCatalogStaticFramesBase,
} from '../utils/visitMascotPackManager.js';
import { normalizePackStateFramesForFramesBase } from '../utils/mascotPackEditorFrames.js';
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
import MascotPackRenderPreview from './mascot/MascotPackRenderPreview.jsx';
import MascotStudioModeTabs from './mascot/MascotStudioModeTabs.jsx';
import { useTransientMessage } from './mascot/useTransientMessage.js';
import { useMascotPackAssets } from './mascot/useMascotPackAssets.js';
import { useMascotPackBulkImageActions } from './mascot/useMascotPackBulkImageActions.js';
import MascotPackArchiveImportDialog from '../shared/mascot-pack/MascotPackArchiveImportDialog.jsx';
import { downloadApiFile } from '../utils/downloadApiFile.js';
import { fileToPngDataUrl } from '../utils/image.js';
import { MASCOT_PACK_UNSAVED_LEAVE_MSG } from '../constants/mascotPackEditor.js';

import { STATE_LABELS } from '../constants/mascotStateLabels.js';

const UNSAVED_LEAVE_MSG = MASCOT_PACK_UNSAVED_LEAVE_MSG;

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
 * @param {{ mapId: string, mapLabel?: string, onPacksChanged?: () => void | Promise<void>, onForceLogout?: () => void, variant?: 'modal' | 'page', mascotDialogSettings?: { defaults?: Record<string, string[]>, catalogOverrides?: Record<string, Record<string, string[]>> } | null, onDirtyChange?: (dirty: boolean) => void }} props
 */
export default function VisitMascotPackManager({
  mapId,
  mapLabel = '',
  onPacksChanged,
  onForceLogout,
  variant = 'modal',
  mascotDialogSettings = null,
  onDirtyChange,
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
  const [jsonCopyFeedback, showJsonCopyFeedback] = useTransientMessage(2500);
  const [labelDraft, setLabelDraft] = useState('');
  const packAssetsApi = useMascotPackAssets({ mapId, selectedId, onForceLogout });
  const {
    libAssets,
    libLoading,
    libMessage,
    globalAssets,
    globalAssetsLoading,
    globalAssetsMessage,
    packAssets,
    packAssetsLoading,
    packAssetsMessage,
    setPackAssetsMessage,
    setPackAssetsLoading,
    loadLibrary,
    loadGlobalAssets,
    loadPackAssets,
    reloadAllImages,
    onLibUpload,
    onLibDelete,
    onDeletePublicAsset,
    onPackUpload,
    onPackDeleteAsset,
  } = packAssetsApi;
  const [imageSourceFilter, setImageSourceFilter] = useState('all');
  const [imageSearch, setImageSearch] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [globalTargetState, setGlobalTargetState] = useState('idle');
  const packPreviewRef = useRef(
    /** @type {{ playInteraction?: (k: string) => void } | null} */ (null),
  );
  const [insertFeedback, showInsertFeedback] = useTransientMessage(2800);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [catalogCopyHint, setCatalogCopyHint] = useState('');
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

  const editorDirty = useMemo(
    () => isMascotPackEditorDirty(savedSnapshot, editorPack, labelDraft),
    [savedSnapshot, editorPack, labelDraft],
  );
  const jsonDirty = useMemo(
    () => editorTab === 'json' && isJsonDraftDirty(jsonDraft, editorPack),
    [editorTab, jsonDraft, editorPack],
  );
  const isDirty = editorDirty || jsonDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
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
  const assetPreviewByFilename = useMemo(
    () => buildPackAssetPreviewByFilename(packAssets),
    [packAssets],
  );

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
    setEditorPack(sanitizeMascotPackDraft(packClone));
    setSavedSnapshot(createMascotPackEditorSnapshot(packClone, label));
    setJsonError('');
    setActionIssues([]);
    setJsonDraft((prev) => {
      if (isJsonDraftDirty(prev, packClone)) return prev;
      return stringifyPack(packClone, 2);
    });
  }, [selectedId, packs]);

  const confirmLeaveIfDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(UNSAVED_LEAVE_MSG);
  }, [isDirty]);

  const refreshFromServer = useCallback(async () => {
    await loadList();
    await onPacksChanged?.();
  }, [loadList, onPacksChanged]);

  const onRefresh = useCallback(async () => {
    if (!confirmLeaveIfDirty()) return;
    await refreshFromServer();
  }, [refreshFromServer, confirmLeaveIfDirty]);

  const requestEditorTab = useCallback(
    (nextTab) => {
      if (nextTab === editorTab) return;
      if (editorTab === 'json' && isJsonDraftDirty(jsonDraft, editorPack)) {
        if (!window.confirm(UNSAVED_LEAVE_MSG)) return;
      } else if (!confirmLeaveIfDirty()) {
        return;
      }
      setEditorTab(nextTab);
      if (nextTab === 'json') setJsonDraft(stringifyPack(editorPack, 2));
      setJsonError('');
    },
    [editorTab, jsonDraft, editorPack, confirmLeaveIfDirty],
  );

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
    // Accepte la forme unifiée `states[]` : désucrée vers le modèle interne (stateFrames).
    setEditorPack(clonePackDeep(normalizeUnifiedStates(parsed.pack)));
    setEditorTab('workspace');
  }, [jsonDraft]);

  /** Réécrit le brouillon JSON dans la forme unifiée `states[]` (aligné GL). */
  const convertJsonToUnified = useCallback(() => {
    const parsed = parsePackJson(jsonDraft);
    const base = parsed.ok ? normalizeUnifiedStates(parsed.pack) : editorPack;
    setJsonDraft(stringifyPack(packToUnifiedForm(base), 2));
    setJsonError('');
  }, [jsonDraft, editorPack]);

  /**
   * Crée un pack (POST) puis sélectionne le nouvel id et resynchronise la liste.
   * Factorise la création « brouillon / clone catalogue / duplication » et l'ouverture
   * d'un modèle catalogue pour édition (audit §6.1), y compris la récupération de
   * `e.allowed_catalog_ids` en erreur.
   * @param {Record<string, unknown>} bodyExtra champs additionnels du POST
   * @param {{ errorMessage?: string, onCreated?: (newId: string) => void }} options
   */
  const postNewPack = useCallback(
    async (bodyExtra = {}, { errorMessage = 'Création impossible', onCreated } = {}) => {
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
        if (newId) {
          setSelectedId(newId);
          onCreated?.(newId);
        }
        await refreshFromServer();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else {
          if (Array.isArray(e?.allowed_catalog_ids)) {
            const ids = e.allowed_catalog_ids.map((id) => String(id || '').trim()).filter(Boolean);
            if (ids.length > 0) setCatalogModelIds(ids);
          }
          setActionError(e.message || errorMessage);
        }
      } finally {
        setActionBusy(false);
      }
    },
    [mapId, refreshFromServer, onForceLogout],
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

  const findPacksForCatalogModelCb = useCallback(
    (modelId) => findPacksForCatalogModel(packs, modelId),
    [packs],
  );

  /** Ouvre une copie modifiable du modèle catalogue sur la carte (réutilise le pack existant si déjà cloné). */
  const openCatalogModelForEdit = useCallback(
    async (modelId) => {
      const mid = String(modelId || '').trim();
      if (!mid) return;
      setSelectedCatalogModelId(mid);
      const copies = findPacksForCatalogModel(packs, mid);
      if (copies.length > 0) {
        const picked = pickPreferredCatalogModelPack(copies, selectedId);
        if (!picked?.pack?.id) return;
        if (picked.pack.id !== selectedId && !confirmLeaveIfDirty()) return;
        setSelectedId(picked.pack.id);
        setEditorTab('workspace');
        setActionError('');
        setCatalogCopyHint(
          picked.ambiguous
            ? 'Plusieurs copies existent pour ce modèle — la plus récente (ou celle sélectionnée) est ouverte.'
            : '',
        );
        return;
      }
      if (!confirmLeaveIfDirty()) return;
      setCatalogCopyHint('');
      await postNewPack(
        { clone_from_catalog_id: mid },
        {
          errorMessage: 'Impossible d’ouvrir ce modèle pour édition',
          onCreated: () => setEditorTab('workspace'),
        },
      );
    },
    [packs, postNewPack, selectedId, confirmLeaveIfDirty],
  );

  const onDuplicateSelected = useCallback(async () => {
    if (!selectedId) return;
    if (!confirmLeaveIfDirty()) return;
    if (!window.confirm('Dupliquer ce pack (copie JSON et fichiers uploadés) ?')) return;
    await postNewPack({ clone_from_pack_id: selectedId });
  }, [selectedId, postNewPack, confirmLeaveIfDirty]);

  const onExportZip = useCallback(
    async ({ unified = false } = {}) => {
      if (!selectedId) return;
      setActionBusy(true);
      setActionError('');
      try {
        const row = packs.find((p) => p.id === selectedId);
        const slug = String(row?.label || 'pack')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '-')
          .slice(0, 40);
        const suffix = unified ? '-states' : '';
        await downloadApiFile(
          `/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/export.zip${
            unified ? '?unified=1' : ''
          }`,
          `mascot-pack-${slug || 'pack'}${suffix}.zip`,
        );
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setActionError(e.message || 'Export ZIP impossible');
      } finally {
        setActionBusy(false);
      }
    },
    [selectedId, packs, onForceLogout],
  );

  const onOpenImport = useCallback(() => {
    if (!confirmLeaveIfDirty()) return;
    setImportDialogOpen(true);
  }, [confirmLeaveIfDirty]);

  const onArchiveImported = useCallback(
    async (result) => {
      const newId = result?.id ? String(result.id) : '';
      if (newId) setSelectedId(newId);
      await refreshFromServer();
    },
    [refreshFromServer],
  );

  /**
   * Enregistre le pack sélectionné (PUT), avec bascule optionnelle de publication.
   * Factorise `onSave` / `onTogglePublish` (audit §6.1) : seuls `is_published` et les
   * messages d'erreur diffèrent entre les deux actions.
   */
  const savePack = useCallback(
    async ({ togglePublish = false } = {}) => {
      if (!selectedId) {
        if (!togglePublish)
          setActionError('Sélectionnez un pack dans la liste ou créez un brouillon.');
        return;
      }
      const row = packs.find((p) => p.id === selectedId);
      if (togglePublish && !row) return;
      setActionBusy(true);
      setActionError('');
      setActionIssues([]);
      try {
        const cleanedPack = sanitizeMascotPackDraft(editorPack);
        const precheck = getPackStrictValidation(
          cleanedPack,
          selectedId,
          String(mapId || '').trim(),
        );
        if (!precheck.ok) {
          setActionErrorWithDetails(
            togglePublish
              ? 'Publication impossible: pack invalide.'
              : 'Le pack est invalide. Corrigez les champs indiqués avant enregistrement.',
            precheck.error?.format?.() || precheck.error,
          );
          return;
        }
        const label =
          String(labelDraft || '').trim() ||
          String(editorPack.label || '').trim() ||
          'Pack mascotte';
        await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'PUT', {
          map_id: String(mapId || '').trim(),
          label,
          pack: cleanedPack,
          is_published: (togglePublish ? !row.is_published : row?.is_published) ? 1 : 0,
        });
        setEditorPack(cleanedPack);
        setSavedSnapshot(createMascotPackEditorSnapshot(cleanedPack, label));
        await refreshFromServer();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else
          setActionErrorWithDetails(
            e.message || (togglePublish ? 'Mise à jour impossible' : 'Enregistrement impossible'),
            e?.body?.details,
          );
      } finally {
        setActionBusy(false);
      }
    },
    [
      selectedId,
      editorPack,
      packs,
      mapId,
      refreshFromServer,
      onForceLogout,
      labelDraft,
      setActionErrorWithDetails,
    ],
  );

  const onSave = useCallback(() => savePack(), [savePack]);
  const onTogglePublish = useCallback(() => savePack({ togglePublish: true }), [savePack]);

  const onDelete = useCallback(async () => {
    if (!selectedId) return;
    if (isDirty) {
      const leaveOk = window.confirm(UNSAVED_LEAVE_MSG);
      if (!leaveOk) return;
    }
    if (!window.confirm('Supprimer définitivement ce pack (y compris les fichiers uploadés) ?'))
      return;
    setActionBusy(true);
    setActionError('');
    setActionIssues([]);
    try {
      await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}`, 'DELETE');
      setSelectedId(null);
      await refreshFromServer();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setActionError(e.message || 'Suppression impossible');
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, refreshFromServer, onForceLogout, isDirty]);

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

  const setFramesBaseToLibrary = useCallback(() => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    const prefix = `/api/visit/mascot-sprite-library/${mid}/assets/`;
    setEditorPack((p) => ({ ...p, framesBase: prefix.endsWith('/') ? prefix : `${prefix}/` }));
  }, [mapId]);

  const setFramesBaseToPack = useCallback(() => {
    if (!selectedId) return;
    setEditorPack((p) =>
      normalizePackStateFramesForFramesBase(ensureServerFramesBase(p, selectedId)),
    );
  }, [selectedId]);

  const catalogModelId = useMemo(
    () => resolvePackDialogMascotId(editorPack, selectedRow),
    [editorPack, selectedRow],
  );
  const missingPackFrames = useMemo(
    () => listMissingPackFrameFilenames(editorPack, packAssets),
    [editorPack, packAssets],
  );
  const catalogStaticFramesBase = useMemo(
    () => resolveCatalogStaticFramesBase(catalogModelId),
    [catalogModelId],
  );
  const canImportMissingCatalogFrames =
    !!selectedId && missingPackFrames.length > 0 && !!catalogStaticFramesBase;

  const onImportMissingCatalogFrames = useCallback(async () => {
    if (!selectedId || !catalogStaticFramesBase || missingPackFrames.length === 0) return;
    setPackAssetsMessage('Import des PNG catalogue vers la médiathèque du pack…');
    setPackAssetsLoading(true);
    let imported = 0;
    try {
      for (const filename of missingPackFrames) {
        const url = withAppBase(`${catalogStaticFramesBase}${filename}`);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Fichier catalogue introuvable : ${filename}`);
        const blob = await resp.blob();
        const file = new File([blob], filename, { type: blob.type || 'image/png' });
        const dataUrl = await fileToPngDataUrl(file);
        await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/assets`, 'POST', {
          filename,
          image_data: dataUrl,
        });
        imported += 1;
      }
      setPackAssetsMessage(
        imported > 0
          ? `${imported} PNG importé(s) depuis le catalogue « ${catalogModelId} ».`
          : 'Aucun fichier importé.',
      );
      await loadPackAssets();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setPackAssetsMessage(e.message || 'Import catalogue impossible');
    } finally {
      setPackAssetsLoading(false);
    }
  }, [
    selectedId,
    catalogStaticFramesBase,
    missingPackFrames,
    catalogModelId,
    loadPackAssets,
    onForceLogout,
    setPackAssetsLoading,
    setPackAssetsMessage,
  ]);

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
      showInsertFeedback(`« ${entry.filename} » ajouté à l’état « ${stateLabel} ».`, 2800);
    },
    [globalTargetState, showInsertFeedback],
  );

  const bulkInsertImagesIntoPack = useCallback(
    (entries) => {
      const list = Array.isArray(entries) ? entries : [];
      if (list.length === 0) return;
      setEditorPack((prev) => {
        const assets = list.map((entry) => ({
          kind: entry.kind,
          filename: entry.filename,
          url: entry.url,
          framesBaseHint: entry.framesBaseHint,
        }));
        const { pack, addedCount } = insertMascotImagesIntoPackState(
          prev,
          globalTargetState,
          assets,
        );
        const stateLabel = STATE_LABELS[globalTargetState] || globalTargetState;
        showInsertFeedback(
          addedCount > 0
            ? `${addedCount} image(s) ajoutée(s) à l’état « ${stateLabel} ».`
            : `Aucune nouvelle image (déjà présentes dans « ${stateLabel} »).`,
          3200,
        );
        return pack;
      });
    },
    [globalTargetState, showInsertFeedback],
  );

  const { imageBulkBusy, bulkDeleteImages, bulkRenameImages, bulkReplaceImages } =
    useMascotPackBulkImageActions({
      selectedId,
      mapId,
      editorPack,
      setEditorPack,
      onForceLogout,
      showInsertFeedback,
      assets: packAssetsApi,
    });

  const removeFilenamesFromTargetState = useCallback(
    (filenames) => {
      const list = (Array.isArray(filenames) ? filenames : [])
        .map((f) => String(f || '').trim())
        .filter(Boolean);
      if (list.length === 0) return;
      setEditorPack((prev) => {
        const sf = prev.stateFrames && typeof prev.stateFrames === 'object' ? prev.stateFrames : {};
        return {
          ...prev,
          stateFrames: removeFilenamesFromStateFrames(sf, globalTargetState, list),
        };
      });
      const stateLabel = STATE_LABELS[globalTargetState] || globalTargetState;
      showInsertFeedback(`${list.length} frame(s) retirée(s) de « ${stateLabel} ».`, 2800);
    },
    [globalTargetState, showInsertFeedback],
  );

  const moveFilenamesInTargetState = useCallback(
    (filenames, direction, blockInfo) => {
      if (!blockInfo) return;
      setEditorPack((prev) => {
        const sf =
          prev.stateFrames && typeof prev.stateFrames === 'object' ? { ...prev.stateFrames } : {};
        const spec = sf[globalTargetState];
        if (!spec || typeof spec !== 'object') return prev;
        const files = Array.isArray(spec.files) ? spec.files : [];
        const fps = Math.max(1, Number(spec.fps) || 8);
        const dwell = Array.isArray(spec.frameDwellMs)
          ? spec.frameDwellMs.map((n) => Number(n) || 100)
          : [];
        const nextSpec = moveFilenameBlockInStateFrames(
          spec,
          files,
          dwell,
          fps,
          blockInfo.start,
          blockInfo.len,
          direction,
        );
        if (!nextSpec) return prev;
        return { ...prev, stateFrames: { ...sf, [globalTargetState]: nextSpec } };
      });
    },
    [globalTargetState],
  );

  const bulkApplyInteractionRules = useCallback(
    (keys, partial) => {
      const list = Array.isArray(keys) ? keys : [];
      if (list.length === 0) return;
      for (const key of list) {
        patchInteractionRule(key, partial);
      }
      showInsertFeedback(`Comportements mis à jour pour ${list.length} événement(s).`, 3200);
    },
    [patchInteractionRule, showInsertFeedback],
  );

  const packDialogInheritedContext = useMemo(() => {
    const catalogId = resolvePackDialogMascotId(editorPack, selectedRow);
    return {
      mascotId: catalogId,
      extraCatalogEntries: [],
      globalDefaults: mascotDialogSettings?.defaults || null,
      catalogOverrides: mascotDialogSettings?.catalogOverrides || null,
    };
  }, [editorPack, mascotDialogSettings, selectedRow]);

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
        <VisitMascotDialogStudioView
          onForceLogout={onForceLogout}
          catalogModelOptions={catalogModelOptions}
        />
      ) : (
        <div className="visit-mascot-pack-manager__layout">
          <MascotPackListAside
            mapTitle={mapTitle}
            actionBusy={actionBusy}
            catalogModelOptions={catalogModelOptions}
            selectedCatalogModelId={selectedCatalogModelId}
            onSelectCatalogModel={setSelectedCatalogModelId}
            findPacksForCatalogModel={findPacksForCatalogModelCb}
            catalogCopyHint={catalogCopyHint}
            onNewDraft={() => void onNewDraft()}
            onOpenCatalogModelForEdit={(id) => void openCatalogModelForEdit(id)}
            onNewFromCatalog={() => void onNewFromCatalog()}
            onRefresh={() => void onRefresh()}
            onDuplicateSelected={() => void onDuplicateSelected()}
            onExportZip={() => void onExportZip()}
            onExportZipUnified={() => void onExportZip({ unified: true })}
            onOpenImport={onOpenImport}
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
          <div
            style={{ flex: '1 1 420px', minWidth: 300 }}
            className="visit-mascot-pack-manager__main"
          >
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
                      onClick={() => requestEditorTab(t.id)}
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
                    <MascotPackRenderPreview
                      ref={packPreviewRef}
                      pack={editorPack}
                      catalogId={selectedRow?.catalog_id || ''}
                      label={labelDraft || selectedRow?.label || ''}
                      variant="studio"
                      focusSection="all"
                      assetPreviewByFilename={assetPreviewByFilename}
                      packAssets={packAssets}
                    />
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
                        hidePreview
                        canImportMissingCatalogFrames={canImportMissingCatalogFrames}
                        onImportMissingCatalogFrames={() => void onImportMissingCatalogFrames()}
                        importMissingCatalogLabel={catalogModelId}
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
                      editorPack={editorPack}
                      packVersion={Number(editorPack.mascotPackVersion) || 1}
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
                      onBulkInsert={bulkInsertImagesIntoPack}
                      onDeletePackAsset={(f) => void onPackDeleteAsset(f)}
                      onDeleteMapAsset={(f) => void onLibDelete(f)}
                      onDeletePublicAsset={(u) => void onDeletePublicAsset(u)}
                      onBulkDelete={(entries) => void bulkDeleteImages(entries)}
                      onBulkRename={(pairs) => void bulkRenameImages(pairs)}
                      onBulkReplace={(entries, files) => void bulkReplaceImages(entries, files)}
                      onRemoveFromTargetState={removeFilenamesFromTargetState}
                      onMoveInTargetState={moveFilenamesInTargetState}
                      onBulkInteractionApply={bulkApplyInteractionRules}
                      onUpgradeToV2={() => upgradePackToV2('workspace')}
                      bulkBusy={imageBulkBusy}
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
                      Modifiez le JSON puis « Appliquer ». La forme unifiée <code>states[]</code>{' '}
                      (alignée GL) est acceptée à l’application.
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
                        onClick={convertJsonToUnified}
                      >
                        Forme unifiée states[]
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(jsonDraft);
                          showJsonCopyFeedback('JSON copié dans le presse-papiers.');
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
                    <MascotPackRenderPreview
                      ref={packPreviewRef}
                      pack={editorPack}
                      catalogId={selectedRow?.catalog_id || ''}
                      label={labelDraft || selectedRow?.label || ''}
                      variant="studio"
                      focusSection="behaviors"
                      assetPreviewByFilename={assetPreviewByFilename}
                      packAssets={packAssets}
                    />
                    <div style={{ marginTop: 12 }}>
                      <MascotInteractionProfileEditor
                        pack={editorPack}
                        onUpgradeToV2={() => upgradePackToV2('interaction')}
                        onPatchRule={patchInteractionRule}
                        onTestBehavior={(key) => packPreviewRef.current?.playInteraction(key)}
                      />
                    </div>
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
                        customTriggers={
                          Array.isArray(editorPack.customTriggers) ? editorPack.customTriggers : []
                        }
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
                      selectedPackId={selectedId}
                      selectedPackCatalogId={selectedRow?.catalog_id || ''}
                      selectedPackLabel={labelDraft || selectedRow?.label || ''}
                      editorPack={editorPack}
                      assetPreviewByFilename={assetPreviewByFilename}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
      <MascotPackArchiveImportDialog
        open={importDialogOpen}
        variant="visit"
        mapId={String(mapId || '')}
        targetPackId={selectedId}
        targetPackLabel={String(selectedRow?.label || labelDraft || '')}
        onClose={() => setImportDialogOpen(false)}
        onImported={(result) => void onArchiveImported(result)}
      />
    </div>
  );
}
