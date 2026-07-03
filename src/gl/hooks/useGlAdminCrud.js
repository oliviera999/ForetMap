import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';

/**
 * Squelette CRUD partagé des panneaux d'édition admin GL (espèces, sorts,
 * glossaire) : chargement de liste, ouverture d'une fiche, préparation d'une
 * nouvelle fiche via « next-code », persistance (POST/PUT) avec enregistrement
 * automatique débouncé, et états loading / error / info. Le rendu des champs
 * et les filtres restent dans chaque panneau.
 *
 * Conventions API attendues : liste `{ items: [...] }` sur `listPath`, fiche
 * `{ [entityKey]: {...} }` sur `basePath/:code`, prochain code
 * `{ [codeField]: '...' }` sur `basePath/next-code`.
 *
 * @param {object} options
 * @param {string|null} options.listPath — URL complète de la liste (falsy → liste vidée)
 * @param {string} options.basePath — URL de base de la collection (POST création, `/:code`, `/next-code`)
 * @param {string} options.codeField — clé du code métier (ex. `species_code`)
 * @param {string} options.entityKey — clé de l'entité dans les réponses API (ex. `species`)
 * @param {object} options.emptyForm — formulaire vierge
 * @param {(entity: object|undefined) => object} options.toForm — entité API → formulaire
 * @param {(form: object) => object} options.toPayload — formulaire → payload (contexte inclus par l'appelant)
 * @param {object} [options.newFormExtra] — champs additionnels d'un nouveau formulaire (ex. `{ biome_slug }`)
 * @param {(entity: object|undefined) => void} [options.onItemLoaded] — synchronisation après chargement d'une fiche
 * @param {(form: object) => boolean} [options.isAutoSaveReady] — condition d'activation de l'autosave (défaut : activé)
 * @param {(form: object) => boolean|string} [options.canSave] — validation bloquante (`false` ou message d'erreur)
 * @param {{ updated: string, created: string, startNewError: string }} options.messages — libellés d'info/erreur
 */
export function useGlAdminCrud({
  listPath,
  basePath,
  codeField,
  entityKey,
  emptyForm,
  toForm,
  toPayload,
  newFormExtra,
  onItemLoaded,
  isAutoSaveReady,
  canSave,
  messages,
}) {
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const { updated: updatedMessage, created: createdMessage } = messages;

  const itemPath = useCallback((code) => `${basePath}/${encodeURIComponent(code)}`, [basePath]);

  const loadList = useCallback(async () => {
    if (!listPath) {
      setItems([]);
      return;
    }
    const data = await apiGL(listPath);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [listPath]);

  useEffect(() => {
    loadList().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [loadList]);

  async function loadItem(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGL(itemPath(code));
      const entity = data?.[entityKey];
      setForm(toForm(entity));
      setSelectedCode(code);
      onItemLoaded?.(entity);
    } catch (err) {
      setError(err.message || 'Fiche introuvable');
    } finally {
      setLoading(false);
    }
  }

  async function startNew() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL(`${basePath}/next-code`);
      setSelectedCode(null);
      setForm({ ...emptyForm, [codeField]: data?.[codeField] || '', ...(newFormExtra || {}) });
    } catch (err) {
      setError(err.message || messages.startNewError);
      setSelectedCode(null);
      setForm({ ...emptyForm, ...(newFormExtra || {}) });
    } finally {
      setLoading(false);
    }
  }

  const persist = useCallback(async () => {
    const payload = toPayload(form);
    const isEdit = Boolean(selectedCode);
    const path = isEdit ? itemPath(selectedCode) : basePath;
    const method = isEdit ? 'PUT' : 'POST';
    const data = await apiGL(path, method, payload);
    const entity = data?.[entityKey];
    const code = entity?.[codeField] || form[codeField];
    setSelectedCode(code);
    const nextForm = toForm(entity);
    setForm(nextForm);
    setInfo(isEdit ? updatedMessage : createdMessage);
    await loadList();
    return nextForm;
  }, [
    form,
    selectedCode,
    itemPath,
    basePath,
    entityKey,
    codeField,
    toForm,
    toPayload,
    updatedMessage,
    createdMessage,
    loadList,
  ]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: form,
    resetKey: selectedCode ?? `new:${form[codeField]}`,
    enabled: isAutoSaveReady ? isAutoSaveReady(form) : true,
    canSave: canSave ? () => canSave(form) : undefined,
    onSave: persist,
  });

  /** Enveloppe une action (archivage, suppression…) avec loading + gestion d'erreur. */
  const runAction = useCallback(async (action, fallbackError) => {
    setLoading(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || fallbackError);
    } finally {
      setLoading(false);
    }
  }, []);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  return {
    items,
    selectedCode,
    setSelectedCode,
    form,
    setForm,
    setField,
    loading,
    error,
    info,
    setInfo,
    saveStatus,
    saveError,
    itemPath,
    loadList,
    loadItem,
    startNew,
    runAction,
  };
}
