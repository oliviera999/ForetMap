import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { clonePackDeep, stringifyPack } from '../utils/mascotPackEditorModel.js';
import { sanitizeMascotPackDraft } from '../utils/mascotPackValidationUi.js';
import {
  createMascotPackEditorSnapshot,
  isMascotPackEditorDirty,
  isJsonDraftDirty,
} from '../utils/visitMascotPackManager.js';

/**
 * État d'édition du pack mascotte sélectionné (audit §6.1 — extraction du god
 * component `VisitMascotPackManager`). Regroupe le pack en cours d'édition, le
 * brouillon JSON, le libellé, l'onglet actif, l'instantané enregistré et les
 * indicateurs « dirty » dérivés, ainsi que l'effet de resynchronisation quand la
 * sélection ou la liste de packs change.
 *
 * @param {{ selectedId: string | null, packs: Array<Record<string, unknown>> }} params
 */
export function useMascotPackEditorState({ selectedId, packs }) {
  /** @type {[Record<string, unknown>, React.Dispatch<React.SetStateAction<Record<string, unknown>>>]} */
  const [editorPack, setEditorPack] = useState({});
  const [editorTab, setEditorTab] = useState('workspace');
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  useEffect(() => {
    const row = packs.find((p) => p.id === selectedId);
    if (!row) {
      setEditorPack({});
      setLabelDraft('');
      setJsonDraft('{}');
      setJsonError('');
      setSavedSnapshot(null);
      return undefined;
    }
    const label = String(row.label || '').trim();
    setLabelDraft(label);

    const applyPack = (rawPack) => {
      const raw = rawPack && typeof rawPack === 'object' ? rawPack : {};
      const packClone = clonePackDeep(raw);
      setEditorPack(sanitizeMascotPackDraft(packClone));
      setSavedSnapshot(createMascotPackEditorSnapshot(packClone, label));
      setJsonError('');
      setJsonDraft((prev) => {
        if (isJsonDraftDirty(prev, packClone)) return prev;
        return stringifyPack(packClone, 2);
      });
    };

    // Liste allégée : `pack` absent → fetch détail.
    if (row.pack && typeof row.pack === 'object') {
      applyPack(row.pack);
      return undefined;
    }

    let cancelled = false;
    api(`/api/visit/mascot-packs/${encodeURIComponent(row.id)}`)
      .then((detail) => {
        if (cancelled) return;
        applyPack(detail?.pack);
      })
      .catch(() => {
        if (cancelled) return;
        applyPack({});
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, packs]);

  const editorDirty = useMemo(
    () => isMascotPackEditorDirty(savedSnapshot, editorPack, labelDraft),
    [savedSnapshot, editorPack, labelDraft],
  );
  const jsonDirty = useMemo(
    () => editorTab === 'json' && isJsonDraftDirty(jsonDraft, editorPack),
    [editorTab, jsonDraft, editorPack],
  );
  const isDirty = editorDirty || jsonDirty;

  return {
    editorPack,
    setEditorPack,
    editorTab,
    setEditorTab,
    jsonDraft,
    setJsonDraft,
    jsonError,
    setJsonError,
    labelDraft,
    setLabelDraft,
    savedSnapshot,
    setSavedSnapshot,
    editorDirty,
    jsonDirty,
    isDirty,
  };
}
