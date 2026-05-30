import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import {
  defaultEventConfigForQuestion,
  normalizeEventConfig,
  normalizeQuestionPool,
} from '../../utils/glMarkerEventConfig.js';
import { GLMultiCheckDropdown } from './GLMultiCheckDropdown.jsx';
import { GLMarkerQuestionList } from './GLMarkerQuestionList.jsx';

const EVENT_TYPE_OPTIONS = [
  { value: 'question', label: 'Question (QCM)', enabled: true },
  { value: 'narration', label: 'Narration (bientôt)', enabled: false },
  { value: 'behavior', label: 'Comportement (bientôt)', enabled: false },
];

const DEFAULT_NIVEAUX = ['base', 'approfondissement', 'avance'];

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
    if (form.eventType === 'question') {
      loadPoolPreview();
    }
  }, [form.eventType, loadPoolPreview]);

  const additionalBiomeOptions = useMemo(
    () => allBiomes
      .filter((biome) => !chapterBiomeSlugs.includes(biome.slug))
      .map((biome) => ({
        value: biome.slug,
        label: biome.nom || biome.slug,
      })),
    [allBiomes, chapterBiomeSlugs]
  );

  const categoryOptions = useMemo(
    () => categories.map((cat) => ({
      value: cat.slug,
      label: `${cat.emoji ? `${cat.emoji} ` : ''}${cat.nom || cat.slug}`,
    })),
    [categories]
  );

  const niveauOptions = useMemo(() => {
    const set = new Set(DEFAULT_NIVEAUX);
    for (const item of poolItems) {
      if (item.niveau) set.add(item.niveau);
    }
    return Array.from(set).sort().map((n) => ({ value: n, label: n }));
  }, [poolItems]);

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

  function selectFixedQuestion(code) {
    patchForm({ fixedQuestionCode: String(code || '').trim().toUpperCase() });
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
              <GLMultiCheckDropdown
                label="Biomes additionnels"
                options={additionalBiomeOptions}
                selectedValues={form.pool.biomeSlugs || []}
                onChange={(values) => patchPool({ biomeSlugs: values })}
                emptyLabel="Aucun biome additionnel"
                allSelectedLabel="Tous les biomes additionnels"
              />
            </div>
          ) : null}

          <div className="gl-marker-event-filters">
            <GLMultiCheckDropdown
              label="Catégories QCM"
              options={categoryOptions}
              selectedValues={form.pool.categorieSlugs || []}
              onChange={(values) => patchPool({ categorieSlugs: values })}
              emptyLabel="Toutes les catégories"
              allSelectedLabel="Toutes les catégories"
            />
            <GLMultiCheckDropdown
              label="Niveaux"
              options={niveauOptions}
              selectedValues={form.pool.niveaux || []}
              onChange={(values) => patchPool({ niveaux: values })}
              emptyLabel="Tous les niveaux"
              allSelectedLabel="Tous les niveaux"
            />
          </div>

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
            <p className="gl-hint gl-marker-event-fixed-hint">
              Cliquez sur une question ci-dessous pour la sélectionner comme question fixe.
              {form.fixedQuestionCode ? (
                <>
                  {' '}
                  Sélection actuelle :
                  {' '}
                  <strong>{form.fixedQuestionCode}</strong>
                </>
              ) : null}
            </p>
          ) : (
            <p className="gl-hint gl-marker-event-random-hint">
              Cochez les questions à inclure dans le tirage aléatoire (aucune case = tout le pool).
            </p>
          )}

          <GLMarkerQuestionList
            items={poolItems}
            loading={poolLoading}
            error={poolError}
            mode={form.questionMode}
            fixedQuestionCode={form.fixedQuestionCode}
            selectedQuestionCodes={form.pool.selectedQuestionCodes}
            onToggleCode={toggleSelectedCode}
            onSelectFixed={selectFixedQuestion}
            onSelectAll={selectAllPool}
            onRefresh={loadPoolPreview}
          />
        </>
      ) : null}
    </div>
  );
}
