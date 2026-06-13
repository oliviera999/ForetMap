import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import {
  normalizeQuestionPool,
  normalizeLoreQuestionPool,
} from '../../utils/glMarkerEventConfig.js';
import {
  EVENT_TYPE_OPTIONS,
  TIER_LORE_OPTIONS,
  formFromMarker,
  buildEventConfigFromForm,
  emptyPoolForSet,
  patchPoolForSet,
  effectiveBiomeSlugs as computeEffectiveBiomeSlugs,
  chapterBiomeSlugsFrom,
  buildAdditionalBiomeOptions,
  buildCategoryOptions,
  buildLoreScopeOptions,
  buildNiveauOptions,
  toggleSelectedCode as toggleCodeInList,
  normalizeFixedCode,
} from '../utils/glMarkerEventEditorForm.js';
import { GLMultiCheckDropdown } from './GLMultiCheckDropdown.jsx';
import { GLMarkerQuestionList } from './GLMarkerQuestionList.jsx';
import { GLMarkerEffectsEditor } from './GLMarkerEffectsEditor.jsx';

export function GLMarkerEventEditor({
  marker,
  chapterBiomes = [],
  onChange,
  effectsDraft,
  onEffectsDraftChange,
}) {
  const [form, setForm] = useState(() => formFromMarker(marker));
  const [allBiomes, setAllBiomes] = useState([]);
  const [loreScopes, setLoreScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [poolItems, setPoolItems] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState('');

  const isLoreSet = form.questionSet === 'lore';

  const chapterBiomeSlugs = useMemo(
    () => chapterBiomeSlugsFrom(chapterBiomes),
    [chapterBiomes]
  );

  useEffect(() => {
    setForm(formFromMarker(marker));
  }, [marker]);

  useEffect(() => {
    onChange?.({
      eventType: form.eventType,
      eventConfig: buildEventConfigFromForm(form, effectsDraft),
    });
  }, [form, effectsDraft, onChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [biomesData, biomeCatData, loreCatData, scopeData] = await Promise.all([
          apiGL('/api/gl/biomes'),
          apiGL('/api/gl/qcm/categories'),
          apiGL('/api/gl/lore/qcm/categories'),
          apiGL('/api/gl/lore/qcm/scopes'),
        ]);
        if (cancelled) return;
        setAllBiomes(Array.isArray(biomesData) ? biomesData : (biomesData?.items || []));
        setLoreScopes(Array.isArray(scopeData) ? scopeData : []);
        setCategories(isLoreSet
          ? (Array.isArray(loreCatData) ? loreCatData : [])
          : (Array.isArray(biomeCatData) ? biomeCatData : []));
      } catch (_) {
        if (!cancelled) {
          setAllBiomes([]);
          setCategories([]);
          setLoreScopes([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isLoreSet]);

  const effectiveBiomeSlugs = useMemo(
    () => computeEffectiveBiomeSlugs(form.pool, chapterBiomeSlugs),
    [form.pool, chapterBiomeSlugs]
  );

  const loadPoolPreview = useCallback(async () => {
    if (form.eventType !== 'question') return;
    if (isLoreSet) {
      setPoolLoading(true);
      setPoolError('');
      try {
        const pool = normalizeLoreQuestionPool(form.pool);
        const params = new URLSearchParams();
        if (marker?.chapter_id != null) params.set('chapterId', String(marker.chapter_id));
        params.set('chapitreMode', pool.chapitreMode || 'chapter');
        if (pool.chapitreSlugs.length) params.set('chapitreSlugs', pool.chapitreSlugs.join(','));
        if (pool.categorieSlugs.length) params.set('categorieSlugs', pool.categorieSlugs.join(','));
        if (pool.tierLore.length) params.set('tierLore', pool.tierLore.join(','));
        if (pool.niveaux.length) params.set('niveaux', pool.niveaux.join(','));
        if (pool.difficulteMin != null) params.set('difficulteMin', String(pool.difficulteMin));
        if (pool.difficulteMax != null) params.set('difficulteMax', String(pool.difficulteMax));
        if (pool.searchQuery) params.set('q', pool.searchQuery);
        const data = await apiGL(`/api/gl/lore/qcm/pool-preview?${params.toString()}`);
        setPoolItems(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        setPoolItems([]);
        setPoolError(err.message || 'Chargement du pool impossible');
      } finally {
        setPoolLoading(false);
      }
      return;
    }
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
  }, [form.eventType, form.pool, effectiveBiomeSlugs, isLoreSet, marker?.chapter_id]);

  useEffect(() => {
    if (form.eventType === 'question') {
      loadPoolPreview();
    }
  }, [form.eventType, loadPoolPreview]);

  const additionalBiomeOptions = useMemo(
    () => buildAdditionalBiomeOptions(allBiomes, chapterBiomeSlugs),
    [allBiomes, chapterBiomeSlugs]
  );

  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories),
    [categories]
  );

  const niveauOptions = useMemo(() => buildNiveauOptions(poolItems), [poolItems]);

  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function patchPool(patch) {
    setForm((prev) => ({
      ...prev,
      pool: patchPoolForSet(prev.pool, prev.questionSet, patch),
    }));
  }

  function switchQuestionSet(nextSet) {
    setForm((prev) => ({
      ...prev,
      questionSet: nextSet,
      fixedQuestionCode: '',
      pool: emptyPoolForSet(nextSet),
    }));
  }

  const loreScopeOptions = useMemo(
    () => buildLoreScopeOptions(loreScopes),
    [loreScopes]
  );

  const tierLoreOptions = TIER_LORE_OPTIONS;

  function toggleSelectedCode(code) {
    setForm((prev) => ({
      ...prev,
      pool: { ...prev.pool, selectedQuestionCodes: toggleCodeInList(prev.pool.selectedQuestionCodes, code) },
    }));
  }

  function selectAllPool() {
    patchPool({ selectedQuestionCodes: [] });
  }

  function selectFixedQuestion(code) {
    patchForm({ fixedQuestionCode: normalizeFixedCode(code) });
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
            <legend>Catalogue QCM</legend>
            <label>
              <input
                type="radio"
                name="gl-marker-question-set"
                checked={form.questionSet === 'biome'}
                onChange={() => switchQuestionSet('biome')}
              />
              Biomes (SVT)
            </label>
            <label>
              <input
                type="radio"
                name="gl-marker-question-set"
                checked={form.questionSet === 'lore'}
                onChange={() => switchQuestionSet('lore')}
              />
              Lore (histoire)
            </label>
          </fieldset>

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

          {isLoreSet ? (
            <>
              <label>
                Chapitres lore du pool
                <select
                  value={form.pool.chapitreMode || 'chapter'}
                  onChange={(event) => patchPool({ chapitreMode: event.target.value })}
                >
                  <option value="chapter">Chapitre courant + transversal (tous)</option>
                  <option value="custom">Scopes personnalisés</option>
                </select>
              </label>
              {form.pool.chapitreMode === 'custom' ? (
                <GLMultiCheckDropdown
                  label="Scopes chapitre lore"
                  options={loreScopeOptions}
                  selectedValues={form.pool.chapitreSlugs || []}
                  onChange={(values) => patchPool({ chapitreSlugs: values })}
                  emptyLabel="Tous + chapitre courant"
                  allSelectedLabel="Tous les scopes"
                />
              ) : (
                <p className="gl-hint">
                  Inclut automatiquement les questions « tous » et le scope lié au plateau du chapitre (ex. ch3).
                </p>
              )}
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="gl-marker-event-filters">
            <GLMultiCheckDropdown
              label={isLoreSet ? 'Catégories lore' : 'Catégories QCM'}
              options={categoryOptions}
              selectedValues={form.pool.categorieSlugs || []}
              onChange={(values) => patchPool({ categorieSlugs: values })}
              emptyLabel="Toutes les catégories"
              allSelectedLabel="Toutes les catégories"
            />
            {isLoreSet ? (
              <GLMultiCheckDropdown
                label="Tier lore"
                options={tierLoreOptions}
                selectedValues={form.pool.tierLore || []}
                onChange={(values) => patchPool({ tierLore: values })}
                emptyLabel="Tous les tiers"
                allSelectedLabel="Tous les tiers"
              />
            ) : null}
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
            qcmSet={form.questionSet}
            fixedQuestionCode={form.fixedQuestionCode}
            selectedQuestionCodes={form.pool.selectedQuestionCodes}
            onToggleCode={toggleSelectedCode}
            onSelectFixed={selectFixedQuestion}
            onSelectAll={selectAllPool}
            onRefresh={loadPoolPreview}
          />
        </>
      ) : (
        <GLMarkerEffectsEditor
          eventConfig={marker?.event_config}
          onChange={onEffectsDraftChange}
        />
      )}
    </div>
  );
}
