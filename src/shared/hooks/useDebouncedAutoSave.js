import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_AUTO_SAVE_DEBOUNCE_MS = 800;
const SAVED_CLEAR_MS = 2000;

/** Sérialise une valeur pour comparaison de snapshot (JSON stable). */
export function serializeAutoSaveValue(value) {
  return JSON.stringify(value);
}

/**
 * Enregistre automatiquement après debounce lorsque `value` diffère du dernier état persisté.
 *
 * @param {object} options
 * @param {*} options.value — snapshot surveillé
 * @param {string|number|null|undefined} [options.resetKey] — réinitialise la baseline sans sauvegarder
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.debounceMs=800]
 * @param {() => Promise<*|void>} options.onSave — persistance ; peut retourner le snapshot enregistré
 * @param {() => boolean|string|null|undefined} [options.canSave] — false ou message d'erreur pour bloquer
 * @param {(a: *, b: *) => boolean} [options.isEqual] — comparaison custom (sinon JSON.stringify)
 */
export function useDebouncedAutoSave({
  value,
  resetKey,
  enabled = true,
  debounceMs = DEFAULT_AUTO_SAVE_DEBOUNCE_MS,
  onSave,
  canSave,
  isEqual,
}) {
  const useJson = !isEqual;
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const baselineRef = useRef(null);
  const resetKeyRef = useRef(resetKey);
  const valueRef = useRef(value);
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const onSaveRef = useRef(onSave);
  const canSaveRef = useRef(canSave);
  const savedClearTimerRef = useRef(null);

  valueRef.current = value;
  onSaveRef.current = onSave;
  canSaveRef.current = canSave;

  const equalsBaseline = useCallback(
    (next) => {
      if (baselineRef.current === null) return true;
      if (isEqual) return isEqual(next, baselineRef.current);
      return serializeAutoSaveValue(next) === baselineRef.current;
    },
    [isEqual],
  );

  const markSaved = useCallback(
    (savedValue) => {
      const next = savedValue !== undefined ? savedValue : valueRef.current;
      baselineRef.current = useJson ? serializeAutoSaveValue(next) : next;
      if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
      setStatus('saved');
      setError('');
      savedClearTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus('idle');
      }, SAVED_CLEAR_MS);
    },
    [useJson],
  );

  const resetBaseline = useCallback(
    (nextValue) => {
      const v = nextValue !== undefined ? nextValue : valueRef.current;
      baselineRef.current = useJson ? serializeAutoSaveValue(v) : v;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setStatus('idle');
      setError('');
    },
    [useJson],
  );

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      resetBaseline(value);
    }
  }, [resetKey, value, resetBaseline]);

  useEffect(() => {
    if (baselineRef.current === null) {
      resetBaseline(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeSave = useCallback(async () => {
    if (!enabled || savingRef.current) return;
    const validation = canSaveRef.current?.();
    if (validation === false) return;
    if (typeof validation === 'string' && validation.trim()) {
      setStatus('error');
      setError(validation.trim());
      return;
    }
    if (equalsBaseline(valueRef.current)) return;

    savingRef.current = true;
    setStatus('saving');
    setError('');
    try {
      const savedValue = await onSaveRef.current();
      if (!mountedRef.current) return;
      markSaved(savedValue !== undefined ? savedValue : valueRef.current);
    } catch (err) {
      if (!mountedRef.current) return;
      setStatus('error');
      setError(err?.message || 'Enregistrement impossible');
    } finally {
      savingRef.current = false;
    }
  }, [enabled, equalsBaseline, markSaved]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await executeSave();
  }, [executeSave]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (baselineRef.current === null) return undefined;
    if (equalsBaseline(value)) return undefined;

    setStatus((prev) => (prev === 'saving' ? 'saving' : 'pending'));

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void executeSave();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, enabled, debounceMs, equalsBaseline, executeSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
      if (!enabled || baselineRef.current === null) return;
      if (equalsBaseline(valueRef.current)) return;
      const validation = canSaveRef.current?.();
      if (validation === false) return;
      if (typeof validation === 'string' && validation.trim()) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void onSaveRef.current();
    };
  }, [enabled, equalsBaseline]);

  const isDirty = baselineRef.current !== null && !equalsBaseline(value);

  return { status, error, flush, isDirty, markSaved, resetBaseline };
}
