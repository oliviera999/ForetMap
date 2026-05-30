import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import {
  defaultEventConfigForQuestion,
  normalizeEventConfig,
  normalizeQuestionPool,
} from '../../utils/glMarkerEventConfig.js';

const EVENT_TYPE_OPTIONS = [
  { value: 'question', label: 'Question (QCM)', enabled: true },
  { value: 'narration', label: 'Narration (bientôt)', enabled: false },
  { value: 'behavior', label: 'Comportement (bientôt)', enabled: false },
];

function emptyQuestionForm() {
  const base = defaultEventConfigForQuestion();
  return {
    eventType: 'question',
    questionMode: base.question.mode,
    fixedQuestionCode: base.question.fixedQuestionCode || '',
    pool: { ...base.question.pool },
  };
}

function formFromMarker(marker) {
  if (!marker) return emptyQuestionForm();
  const eventType = String(marker.event_type || '').trim().toLowerCase();
  const cfg = normalizeEventConfig(marker.event_config) || defaultEventConfigForQuestion();
  const question = cfg.question || defaultEventConfigForQuestion().question;
  return {
    eventType: eventType === 'quiz' ? 'question' : (eventType || 'question'),
    questionMode: question.mode,
    fixedQuestionCode: question.fixedQuestionCode || '',
    pool: { ...question.pool },
  };
}

function buildEventConfigFromForm(form) {
  if (form.eventType !== 'question') return null;
  return normalizeEventConfig({
    version: 1,
    question: {
      mode: form.questionMode,
      fixedQuestionCode: form.fixedQuestionCode || null,
      pool: normalizeQuestionPool(form.pool),
    },
  });
}

export function GLMarkerEventEditor({
  marker,
  chapterBiomes = [],
  onChange,
}) {
  const [form, setForm] = useState(() => formFromMarker(marker));
  const [allBiomes, setAllBiomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [poolItems, setPoolItems] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState('');

  const chapterBiomeSlugs = useMemo(
    () => (Array.isArray(chapterBiomes) ? chapterBiomes.map((b) => b.slug).filter(Boolean) : []),
    [chapterBiomes]
  );

  useEffect(() => {
    setForm(formFromMarker(marker));
  }, [marker]);

  useEffect(() => {
    onChange?.({
      eventType: form.eventType,
      eventConfig: buildEventConfigFromForm(form),
    });
  }, [form, onChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [biomesData, catData] = await Promise.all([
          apiGL('/api/gl/biomes'),
          apiGL('/api/gl/qcm/categories'),
        ]);
        if (cancelled) return;
        setAllBiomes(Array.isArray(biomesData) ? biomesData : (biomesData?.items || []));
        setCategories(Array.isArray(catData) ? catData : []);
      } catch (_) {
        if (!cancelled) {
          setAllBiomes([]);
          setCategories([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const effectiveBiomeSlugs = useMemo(() => {
    const pool = normalizeQuestionPool(form.pool);
    if (pool.biomeMode === 'chapter') return chapterBiomeSlugs;
    const extra = pool.biomeSlugs || [];
    const merged = [...chapterBiomeSlugs];
    for (const slug of extra) {
      if (!merged.includes(slug)) merged.push(slug);
    }
    return merged;
  }, [form.pool, chapterBiomeSlugs]);

  const loadPoolPreview = useCallback(async () => {
    if (form.eventType !== 'question') return;
    if (effectiveBiomeSlugs.length === 0) {
      setPoolItems([]);
      setPoolError('Aucun biome sélectionné');
      return;
    }
    setPoolLoading(true);
    setPoolError('');
    try {
      const pool = normalizeQuestionPool(form.pool);
      const params = new URLSearchParams();
      params.set('biomeSlugs', effectiveBiomeSlugs.join(','));
      if (pool.categorieSlugs.length) params.set('categorieSlugs', pool.categorieSlugs.join(','));
      if (pool.niveaux.length) params.set('niveaux', pool.niveaux.join(','));
      if (pool.difficulteMin != null) params.set('difficulteMin', String(pool.difficulteMin));
      if (pool.difficulteMax != null) params.set('difficulteMax', String(pool.difficulteMax));
      if (pool.searchQuery) params.set('q', pool.searchQuery);
      const data = await apiGL(`/api/gl/qcm/pool-preview?${params.toString()}`);
      setPoolItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setPoolItems([]);
      setPoolError(err.message || 'Chargement du pool impossible');
    } finally {
      setPoolLoading(false);
    }
  }, [form.eventType, form.pool, effectiveBiomeSlugs]);

  useEffect(() => {
    if (form.eventType === 'question' && form.questionMode === 'random') {
      loadPoolPreview();
    }
  }, [form.eventType, form.questionMode, loadPoolPreview]);

  const niveauOptions = useMemo(() => {
    const set = new Set(poolItems.map((item) => item.niveau).filter(Boolean));
    return Array.from(set).sort();
  }, [poolItems]);

  const selectedCount = useMemo(() => {
    const selected = form.pool.selectedQuestionCodes || [];
    if (selected.length === 0) return poolItems.length;
    const allowed = new Set(selected.map((c) => String(c).toUpperCase()));
    return poolItems.filter((item) => allowed.has(String(item.question_code).toUpperCase())).length;
  }, [form.pool.selectedQuestionCodes, poolItems]);

  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function patchPool(patch) {
    setForm((prev) => ({
      ...prev,
      pool: normalizeQuestionPool({ ...prev.pool, ...patch }),
    }));
  }

  function toggleSelectedCode(code) {
    const upper = String(code || '').trim().toUpperCase();
    if (!upper) return;
    setForm((prev) => {
      const current = prev.pool.selectedQuestionCodes || [];
      const has = current.includes(upper);
      const next = has ? current.filter((c) => c !== upper) : [...current, upper];
      return {
        ...prev,
        pool: { ...prev.pool, selectedQuestionCodes: next },
      };
    });
  }

  function selectAllPool() {
    patchPool({ selectedQuestionCodes: [] });
  }

  function isCodeSelected(code) {
    const selected = form.pool.selectedQuestionCodes || [];
    if (selected.length === 0) return true;
    return selected.includes(String(code).toUpperCase());
  }

  return (
    <div className="gl-marker-event-editor">
      <label>
        Type d&apos;événement
        <select
          value={form.eventType}
          onChange={(event) => patchForm({ eventType: event.target.value })}
        >
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={!opt.enabled}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {form.eventType === 'question' ? (
        <>
          <fieldset className="gl-marker-event-mode">
            <legend>Mode question</legend>
            <label>
              <input
                type="radio"
                name="gl-marker-question-mode"
                checked={form.questionMode === 'fixed'}
                onChange={() => patchForm({ questionMode: 'fixed' })}
              />
              Question fixe
            </label>
            <label>
              <input
                type="radio"
                name="gl-marker-question-mode"
                checked={form.questionMode === 'random'}
                onChange={() => patchForm({ questionMode: 'random' })}
              />
              Tirage aléatoire dans un pool
            </label>
          </fieldset>

          <label>
            Biomes du pool
            <select
              value={form.pool.biomeMode}
              onChange={(event) => patchPool({ biomeMode: event.target.value })}
            >
              <option value="chapter">Biomes du chapitre (défaut)</option>
              <option value="custom">Chapitre + biomes additionnels</option>
            </select>
          </label>

          {form.pool.biomeMode === 'custom' ? (
            <div className="gl-marker-event-biomes">
              <p className="gl-hint">
                Biomes du chapitre :
                {' '}
                {chapterBiomeSlugs.length ? chapterBiomeSlugs.join(', ') : 'aucun'}
              </p>
              <label>
                Biomes additionnels
                <select
                  multiple
                  value={form.pool.biomeSlugs || []}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map((o) => o.value);
                    patchPool({ biomeSlugs: values });
                  }}
                  size={Math.min(6, Math.max(3, allBiomes.length))}
                >
                  {allBiomes.map((biome) => (
                    <option key={biome.slug} value={biome.slug}>
                      {biome.nom || biome.slug}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <label>
            Catégories QCM
            <select
              multiple
              value={form.pool.categorieSlugs || []}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((o) => o.value);
                patchPool({ categorieSlugs: values });
              }}
              size={Math.min(5, Math.max(2, categories.length))}
            >
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.emoji ? `${cat.emoji} ` : ''}
                  {cat.nom || cat.slug}
                </option>
              ))}
            </select>
          </label>

          <label>
            Niveaux
            <select
              multiple
              value={form.pool.niveaux || []}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((o) => o.value);
                patchPool({ niveaux: values });
              }}
              size={Math.min(4, Math.max(2, niveauOptions.length || 2))}
            >
              {(niveauOptions.length ? niveauOptions : ['base', 'approfondissement', 'avance']).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <div className="gl-marker-event-difficulte">
            <label>
              Difficulté min
              <input
                type="number"
                min="1"
                max="5"
                value={form.pool.difficulteMin ?? ''}
                onChange={(event) => patchPool({
                  difficulteMin: event.target.value === '' ? null : Number(event.target.value),
                })}
              />
            </label>
            <label>
              Difficulté max
              <input
                type="number"
                min="1"
                max="5"
                value={form.pool.difficulteMax ?? ''}
                onChange={(event) => patchPool({
                  difficulteMax: event.target.value === '' ? null : Number(event.target.value),
                })}
              />
            </label>
          </div>

          <label>
            Recherche (libellé, tags, mots-clés)
            <input
              type="search"
              value={form.pool.searchQuery || ''}
              onChange={(event) => patchPool({ searchQuery: event.target.value })}
            />
          </label>

          {form.questionMode === 'fixed' ? (
            <label>
              Code question fixe
              <select
                value={form.fixedQuestionCode || ''}
                onChange={(event) => patchForm({ fixedQuestionCode: event.target.value })}
              >
                <option value="">— Choisir —</option>
                {poolItems.map((item) => (
                  <option key={item.question_code} value={item.question_code}>
                    {item.question_code}
                    {' — '}
                    {(item.question || '').slice(0, 80)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="gl-marker-event-pool">
              <div className="gl-marker-event-pool__header">
                <strong>Sélection fine des questions</strong>
                <span className="gl-hint">
                  {selectedCount}
                  {' / '}
                  {poolItems.length}
                  {' éligible(s)'}
                  {(form.pool.selectedQuestionCodes || []).length === 0 ? ' (toutes si aucune cochée)' : ''}
                </span>
                <button type="button" onClick={selectAllPool}>Tout le pool</button>
                <button type="button" onClick={loadPoolPreview} disabled={poolLoading}>
                  {poolLoading ? 'Actualisation…' : 'Actualiser'}
                </button>
              </div>
              {poolError ? <p className="gl-error">{poolError}</p> : null}
              <ul className="gl-marker-event-pool__list">
                {poolItems.map((item) => (
                  <li key={item.question_code}>
                    <label>
                      <input
                        type="checkbox"
                        checked={isCodeSelected(item.question_code)}
                        onChange={() => toggleSelectedCode(item.question_code)}
                      />
                      <span className="gl-marker-event-pool__code">{item.question_code}</span>
                      <span className="gl-marker-event-pool__meta">
                        {item.biome_slug}
                        {' · '}
                        {item.categorie_slug}
                        {item.niveau ? ` · ${item.niveau}` : ''}
                      </span>
                      <span className="gl-marker-event-pool__question">{item.question}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
