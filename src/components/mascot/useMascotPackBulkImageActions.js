import { useCallback, useState } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { fileToPngDataUrl } from '../../utils/image.js';
import {
  sanitizeClientFilename,
  renameFilenameInPackStateFrames,
  collectPackReferencedFrameFilenames,
} from '../../utils/mascotPackEditorFrames.js';

/**
 * Actions en lot sur les sprites du studio packs mascotte (audit §6.1), extraites de
 * `VisitMascotPackManager` : suppression, renommage (avec réécriture des références
 * dans les `stateFrames` du pack) et remplacement d'images. Testable isolément :
 * les collaborateurs (suppressions silencieuses, rechargements, setters de messages)
 * sont injectés via `assets` (retour de `useMascotPackAssets`).
 *
 * @param {{
 *   selectedId: string | null,
 *   mapId: string,
 *   editorPack: Record<string, unknown>,
 *   setEditorPack: (updater: unknown) => void,
 *   onForceLogout?: () => void,
 *   showInsertFeedback: (message: string, ms?: number) => void,
 *   assets: {
 *     deletePackAssetSilent: (filename: string) => Promise<void>,
 *     deleteMapAssetSilent: (filename: string) => Promise<void>,
 *     deletePublicAssetSilent: (url: string) => Promise<void>,
 *     loadPackAssets: () => Promise<void>,
 *     loadLibrary: () => Promise<void>,
 *     loadGlobalAssets: () => Promise<void>,
 *     setPackAssetsMessage: (message: string) => void,
 *     setLibMessage: (message: string) => void,
 *     setGlobalAssetsMessage: (message: string) => void,
 *   },
 * }} params
 * @returns {{
 *   imageBulkBusy: boolean,
 *   bulkDeleteImages: (entries: unknown[]) => Promise<void>,
 *   bulkRenameImages: (pairs: unknown[]) => Promise<void>,
 *   bulkReplaceImages: (entries: unknown[], fileList: FileList | File[]) => Promise<void>,
 * }}
 */
export function useMascotPackBulkImageActions({
  selectedId,
  mapId,
  editorPack,
  setEditorPack,
  onForceLogout,
  showInsertFeedback,
  assets,
}) {
  const {
    deletePackAssetSilent,
    deleteMapAssetSilent,
    deletePublicAssetSilent,
    loadPackAssets,
    loadLibrary,
    loadGlobalAssets,
    setPackAssetsMessage,
    setLibMessage,
    setGlobalAssetsMessage,
  } = assets;
  const [imageBulkBusy, setImageBulkBusy] = useState(false);

  const bulkDeleteImages = useCallback(
    async (entries) => {
      const list = Array.isArray(entries) ? entries : [];
      const deletable = list.filter((e) => e.canDelete);
      if (deletable.length === 0) return;

      // NB : l'utilitaire renvoie un tableau ; l'enveloppe Set corrige un TypeError
      // (`referenced.has is not a function`) présent dans le code d'origine, qui faisait
      // échouer toute suppression en lot dès la confirmation (bug révélé par les tests).
      const referenced = new Set(collectPackReferencedFrameFilenames(editorPack));
      const referencedDeletes = deletable.filter((e) => {
        const fn = String(e.filename || '').trim();
        return fn && referenced.has(fn);
      });
      let confirmMsg = `Supprimer ${deletable.length} sprite(s) sélectionné(s) ?`;
      if (referencedDeletes.length > 0) {
        const names = referencedDeletes
          .slice(0, 5)
          .map((e) => e.filename)
          .join(', ');
        confirmMsg += `\n\nAttention : ${referencedDeletes.length} fichier(s) sont encore référencés dans le pack (${names}${referencedDeletes.length > 5 ? '…' : ''}).`;
      }
      if (!window.confirm(confirmMsg)) return;

      setImageBulkBusy(true);
      setPackAssetsMessage('');
      setLibMessage('');
      setGlobalAssetsMessage('');
      let deleted = 0;
      const failures = [];

      for (const entry of deletable) {
        try {
          const scope = entry.deleteScope;
          if (scope === 'pack') await deletePackAssetSilent(entry.filename);
          else if (scope === 'map') await deleteMapAssetSilent(entry.filename);
          else if (scope === 'public') await deletePublicAssetSilent(entry.deleteUrl || entry.url);
          deleted += 1;
        } catch (e) {
          if (e instanceof AccountDeletedError) {
            onForceLogout?.();
            break;
          }
          failures.push(String(entry.filename || e.message || 'erreur'));
        }
      }

      try {
        await loadPackAssets();
        await loadLibrary();
        await loadGlobalAssets();
      } catch (_) {
        /* ignore reload errors */
      }

      const msg =
        failures.length === 0
          ? `${deleted} sprite(s) supprimé(s).`
          : `${deleted} supprimé(s), ${failures.length} échec(s).`;
      showInsertFeedback(msg, 4000);
      if (failures.length) setPackAssetsMessage(failures.slice(0, 3).join(' · '));
      setImageBulkBusy(false);
    },
    [
      editorPack,
      deletePackAssetSilent,
      deleteMapAssetSilent,
      deletePublicAssetSilent,
      loadPackAssets,
      loadLibrary,
      loadGlobalAssets,
      onForceLogout,
      showInsertFeedback,
      setPackAssetsMessage,
      setLibMessage,
      setGlobalAssetsMessage,
    ],
  );

  const bulkRenameImages = useCallback(
    async (pairs) => {
      const list = Array.isArray(pairs) ? pairs : [];
      if (list.length === 0) return;
      setImageBulkBusy(true);
      showInsertFeedback('');
      let renamed = 0;
      const failures = [];
      let nextPack = editorPack;

      for (const { entry, newFilename } of list) {
        const oldName = String(entry?.filename || '').trim();
        const newName = sanitizeClientFilename(newFilename);
        if (!oldName || !newName || oldName === newName) continue;
        try {
          if (entry.deleteScope === 'pack' && selectedId) {
            await api(
              `/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/assets/${encodeURIComponent(oldName)}`,
              'PATCH',
              { new_filename: newName },
            );
          } else if (entry.deleteScope === 'map') {
            const mid = String(mapId || '').trim();
            await api(
              `/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets/${encodeURIComponent(oldName)}`,
              'PATCH',
              { new_filename: newName },
            );
          } else {
            continue;
          }
          nextPack = renameFilenameInPackStateFrames(nextPack, oldName, newName);
          renamed += 1;
        } catch (e) {
          if (e instanceof AccountDeletedError) {
            onForceLogout?.();
            break;
          }
          failures.push(`${oldName}: ${e.message || 'échec'}`);
        }
      }

      setEditorPack(nextPack);
      try {
        await loadPackAssets();
        await loadLibrary();
      } catch (_) {
        /* ignore */
      }
      showInsertFeedback(
        failures.length
          ? `${renamed} renommé(s), ${failures.length} échec(s).`
          : `${renamed} fichier(s) renommé(s).`,
        4000,
      );
      setImageBulkBusy(false);
    },
    [
      editorPack,
      setEditorPack,
      selectedId,
      mapId,
      loadPackAssets,
      loadLibrary,
      onForceLogout,
      showInsertFeedback,
    ],
  );

  const bulkReplaceImages = useCallback(
    async (entries, fileList) => {
      const list = Array.isArray(entries) ? entries : [];
      const files = Array.from(fileList || []);
      if (list.length === 0 || files.length === 0) return;
      if (
        !window.confirm(
          `Remplacer ${Math.min(list.length, files.length)} sprite(s) par de nouvelles images ?`,
        )
      )
        return;

      setImageBulkBusy(true);
      let replaced = 0;
      const failures = [];

      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        const file = files[Math.min(i, files.length - 1)];
        const filename = String(entry?.filename || '').trim();
        if (!filename || !file) continue;
        if (entry.deleteScope !== 'pack' && entry.deleteScope !== 'map') continue;
        try {
          const dataUrl = await fileToPngDataUrl(file);
          if (entry.deleteScope === 'pack' && selectedId) {
            await api(`/api/visit/mascot-packs/${encodeURIComponent(selectedId)}/assets`, 'POST', {
              filename,
              image_data: dataUrl,
            });
          } else if (entry.deleteScope === 'map') {
            const mid = String(mapId || '').trim();
            await api(
              `/api/visit/mascot-sprite-library/${encodeURIComponent(mid)}/assets`,
              'POST',
              {
                filename,
                image_data: dataUrl,
              },
            );
          }
          replaced += 1;
        } catch (e) {
          if (e instanceof AccountDeletedError) {
            onForceLogout?.();
            break;
          }
          failures.push(`${filename}: ${e.message || 'échec'}`);
        }
      }

      await loadPackAssets();
      await loadLibrary();
      showInsertFeedback(
        failures.length
          ? `${replaced} remplacé(s), ${failures.length} échec(s).`
          : `${replaced} sprite(s) remplacé(s).`,
        4000,
      );
      setImageBulkBusy(false);
    },
    [selectedId, mapId, loadPackAssets, loadLibrary, onForceLogout, showInsertFeedback],
  );

  return { imageBulkBusy, bulkDeleteImages, bulkRenameImages, bulkReplaceImages };
}

export default useMascotPackBulkImageActions;
