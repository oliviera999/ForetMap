import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

const EMPTY = Object.freeze({
  species_codes: [],
  glossary_codes: [],
  tutorial_ids: [],
});

/**
 * Progression « appris / étudié » du joueur GL (globale, inter-parties).
 */
export function useGlLearningProgress(authToken) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!authToken) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGL('/api/gl/learning/me');
      setData({
        species_codes: Array.isArray(res?.species_codes) ? res.species_codes : [],
        glossary_codes: Array.isArray(res?.glossary_codes) ? res.glossary_codes : [],
        tutorial_ids: Array.isArray(res?.tutorial_ids) ? res.tutorial_ids : [],
      });
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  const speciesSet = useMemo(
    () => new Set(data.species_codes.map((c) => String(c).trim()).filter(Boolean)),
    [data.species_codes]
  );
  const glossarySet = useMemo(
    () => new Set(data.glossary_codes.map((c) => String(c).trim()).filter(Boolean)),
    [data.glossary_codes]
  );
  const tutorialSet = useMemo(
    () => new Set(data.tutorial_ids.map((id) => Number(id)).filter((n) => Number.isFinite(n))),
    [data.tutorial_ids]
  );

  const markLocal = useCallback((type, code) => {
    const key = String(code || '').trim();
    if (!key) return;
    setData((prev) => {
      if (type === 'species' && prev.species_codes.includes(key)) return prev;
      if (type === 'glossary' && prev.glossary_codes.includes(key)) return prev;
      if (type === 'tutorial') {
        const id = Number(key);
        if (!Number.isFinite(id) || prev.tutorial_ids.includes(id)) return prev;
        return { ...prev, tutorial_ids: [...prev.tutorial_ids, id] };
      }
      if (type === 'species') {
        return { ...prev, species_codes: [...prev.species_codes, key] };
      }
      if (type === 'glossary') {
        return { ...prev, glossary_codes: [...prev.glossary_codes, key] };
      }
      return prev;
    });
  }, []);

  const isSpeciesLearned = useCallback((code) => speciesSet.has(String(code || '').trim()), [speciesSet]);
  const isGlossaryLearned = useCallback((code) => glossarySet.has(String(code || '').trim()), [glossarySet]);
  const isTutorialRead = useCallback((id) => tutorialSet.has(Number(id)), [tutorialSet]);

  return {
    loading,
    reload,
    markLocal,
    isSpeciesLearned,
    isGlossaryLearned,
    isTutorialRead,
    speciesCodes: data.species_codes,
    glossaryCodes: data.glossary_codes,
    tutorialIds: data.tutorial_ids,
  };
}
