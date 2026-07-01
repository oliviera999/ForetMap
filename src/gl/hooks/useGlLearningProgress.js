import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { LEARNING_TYPE_TO_FIELD as TYPE_TO_FIELD } from '../utils/glLearningFields.js';

const EMPTY = Object.freeze({
  species_codes: [],
  glossary_codes: [],
  tutorial_ids: [],
  lore_glossary_codes: [],
  feuillet_codes: [],
  content_page_slugs: [],
  ecosystem_slugs: [],
});

/**
 * Progression « appris / étudié / lu / découvert » du joueur GL (globale, inter-parties).
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
      const pick = (key) => (Array.isArray(res?.[key]) ? res[key] : []);
      setData({
        species_codes: pick('species_codes'),
        glossary_codes: pick('glossary_codes'),
        tutorial_ids: pick('tutorial_ids'),
        lore_glossary_codes: pick('lore_glossary_codes'),
        feuillet_codes: pick('feuillet_codes'),
        content_page_slugs: pick('content_page_slugs'),
        ecosystem_slugs: pick('ecosystem_slugs'),
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

  const sets = useMemo(() => {
    const out = {};
    for (const [type, field] of Object.entries(TYPE_TO_FIELD)) {
      out[type] = new Set((data[field] || []).map((c) => String(c).trim()).filter(Boolean));
    }
    return out;
  }, [data]);

  const isLearned = useCallback(
    (type, ref) => {
      const set = sets[type];
      if (!set) return false;
      return set.has(String(ref == null ? '' : ref).trim());
    },
    [sets],
  );

  const markLocal = useCallback((type, ref) => {
    const field = TYPE_TO_FIELD[type];
    const key = String(ref == null ? '' : ref).trim();
    if (!field || !key) return;
    setData((prev) => {
      const current = prev[field] || [];
      if (type === 'tutorial') {
        const id = Number(key);
        if (!Number.isFinite(id) || current.includes(id)) return prev;
        return { ...prev, [field]: [...current, id] };
      }
      if (current.includes(key)) return prev;
      return { ...prev, [field]: [...current, key] };
    });
  }, []);

  const isSpeciesLearned = useCallback((code) => isLearned('species', code), [isLearned]);
  const isGlossaryLearned = useCallback((code) => isLearned('glossary', code), [isLearned]);
  const isTutorialRead = useCallback((id) => isLearned('tutorial', id), [isLearned]);

  return {
    loading,
    reload,
    markLocal,
    isLearned,
    isSpeciesLearned,
    isGlossaryLearned,
    isTutorialRead,
    speciesCodes: data.species_codes,
    glossaryCodes: data.glossary_codes,
    tutorialIds: data.tutorial_ids,
  };
}
