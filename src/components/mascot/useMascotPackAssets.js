import { useCallback, useState } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { fileToPngDataUrl } from '../../utils/image.js';
import { sanitizeClientFilename } from '../../utils/mascotPackEditorFrames.js';

/**
 * Sources d'images du studio packs mascotte (audit §6.1), extraites de
 * `VisitMascotPackManager` : bibliothèque de la carte, catalogue site (assets globaux)
 * et médiathèque du pack sélectionné. Factorise le squelette de chargement
 * (`setLoading` / try / `AccountDeletedError` / finally, identique ×3) et regroupe
 * les uploads / suppressions correspondants.
 *
 * @param {{ mapId: string, selectedId: string | null, onForceLogout?: () => void }} params
 */
export function useMascotPackAssets({ mapId, selectedId, onForceLogout }) {
  const [libAssets, setLibAssets] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libMessage, setLibMessage] = useState('');
  const [globalAssets, setGlobalAssets] = useState([]);
  const [globalAssetsLoading, setGlobalAssetsLoading] = useState(false);
  const [globalAssetsMessage, setGlobalAssetsMessage] = useState('');
  const [packAssets, setPackAssets] = useState([]);
  const [packAssetsLoading, setPackAssetsLoading] = useState(false);
  const [packAssetsMessage, setPackAssetsMessage] = useState('');

  /** Squelette commun des trois chargements de listes d'assets. */
  const runAssetsLoad = useCallback(
    async ({ request, setAssets, setLoading, setMessage, errorMessage }) => {
      setLoading(true);
      setMessage('');
      try {
        const res = await request();
        setAssets(Array.isArray(res?.assets) ? res.assets : []);
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setMessage(e.message || errorMessage);
        setAssets([]);
      } finally {
        setLoading(false);
      }
    },
    [onForceLogout],
  );

  const loadLibrary = useCallback(async () => {
    const mid = String(mapId || '').trim();
    if (!mid) return;
    await runAssetsLoad({
      request: () => api(`/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets`),
      setAssets: setLibAssets,
      setLoading: setLibLoading,
      setMessage: setLibMessage,
      errorMessage: 'Impossible de charger la bibliothèque',
    });
  }, [mapId, runAssetsLoad]);

  const loadGlobalAssets = useCallback(async () => {
    await runAssetsLoad({
      request: () => api('/api/visit/mascot-assets'),
      setAssets: setGlobalAssets,
      setLoading: setGlobalAssetsLoading,
      setMessage: setGlobalAssetsMessage,
      errorMessage: 'Impossible de charger les assets globaux',
    });
  }, [runAssetsLoad]);

  const loadPackAssets = useCallback(async () => {
    const id = String(selectedId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setPackAssets([]);
      return;
    }
    await runAssetsLoad({
      request: () => api(`/api/visit/mascot-packs/${encodeURIComponent(id)}/assets`),
      setAssets: setPackAssets,
      setLoading: setPackAssetsLoading,
      setMessage: setPackAssetsMessage,
      errorMessage: 'Impossible de charger la médiathèque du pack',
    });
  }, [selectedId, runAssetsLoad]);

  const reloadAllImages = useCallback(() => {
    void loadPackAssets();
    void loadLibrary();
    void loadGlobalAssets();
  }, [loadPackAssets, loadLibrary, loadGlobalAssets]);

  const onLibUpload = useCallback(
    async (ev) => {
      const file = ev.target?.files?.[0];
      ev.target.value = '';
      if (!file) return;
      const mid = String(mapId || '').trim();
      setLibLoading(true);
      setLibMessage('Envoi en cours…');
      try {
        const dataUrl = await fileToPngDataUrl(file);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase() || 'import.png';
        await api(`/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets`, 'POST', {
          filename: safeName.endsWith('.png') ? safeName : `${safeName}.png`,
          image_data: dataUrl,
        });
        setLibMessage('Image importée dans la bibliothèque.');
        await loadLibrary();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setLibMessage(e.message || 'Import impossible');
      } finally {
        setLibLoading(false);
      }
    },
    [mapId, loadLibrary, onForceLogout],
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

  const onDeletePublicAsset = useCallback(
    async (url) => {
      const assetUrl = String(url || '').trim();
      if (!assetUrl) return;
      if (
        !window.confirm(
          `Supprimer définitivement « ${assetUrl.split('/').pop() || assetUrl} » du catalogue site ?`,
        )
      )
        return;
      setGlobalAssetsLoading(true);
      setGlobalAssetsMessage('');
      try {
        await api('/api/visit/mascot-assets/public', 'DELETE', { url: assetUrl });
        setGlobalAssetsMessage('Sprite site supprimé.');
        await loadGlobalAssets();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        else setGlobalAssetsMessage(e.message || 'Suppression site impossible');
      } finally {
        setGlobalAssetsLoading(false);
      }
    },
    [loadGlobalAssets, onForceLogout],
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
    [selectedId, loadPackAssets, onForceLogout],
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

  /** Suppressions « silencieuses » (sans confirm ni rechargement) pour les actions en lot. */
  const deletePackAssetSilent = useCallback(
    async (filename) => {
      if (!selectedId || !filename) return;
      await api(
        `/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/assets/${encodeURIComponent(filename)}`,
        'DELETE',
      );
    },
    [selectedId],
  );

  const deleteMapAssetSilent = useCallback(
    async (filename) => {
      const mid = String(mapId || '').trim();
      if (!mid || !filename) return;
      await api(
        `/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets/${encodeURIComponent(filename)}`,
        'DELETE',
      );
    },
    [mapId],
  );

  const deletePublicAssetSilent = useCallback(async (url) => {
    const assetUrl = String(url || '').trim();
    if (!assetUrl) return;
    await api('/api/visit/mascot-assets/public', 'DELETE', { url: assetUrl });
  }, []);

  return {
    libAssets,
    libLoading,
    libMessage,
    setLibMessage,
    globalAssets,
    globalAssetsLoading,
    globalAssetsMessage,
    setGlobalAssetsMessage,
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
    deletePackAssetSilent,
    deleteMapAssetSilent,
    deletePublicAssetSilent,
  };
}

export default useMascotPackAssets;
