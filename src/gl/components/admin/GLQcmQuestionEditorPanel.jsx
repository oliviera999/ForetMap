import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../../shared/hooks/useDebouncedAutoSave.js';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  TEXTAREA_FIELDS,
  filterQcmItems,
  formToPayload,
  questionToForm,
  sortQcmItems,
} from '../../utils/glQcmEditorForm.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

export function GLQcmQuestionEditorPanel({ initialQuestionCode = null }) {
  const [biomes, setBiomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterBiome, setFilterBiome] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterStatut, setFilterStatut] = useState('actif');
  const [filterNiveau, setFilterNiveau] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [sortBy, setSortBy] = useState('biome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const filteredItems = useMemo(() => {
    const filtered = filterQcmItems(items, {
      filterBiome,
      filterCategorie,
      filterQ,
    });
    return sortQcmItems(filtered, sortBy);
  }, [items, filterBiome, filterCategorie, filterQ, sortBy]);

  const loadBiomes = useCallback(async () => {
    const list = await apiGL('/api/gl/biomes');
    setBiomes(Array.isArray(list) ? list : []);
  }, []);

  const loadCategories = useCallback(async () => {
    const list = await apiGL('/api/gl/qcm/categories');
    setCategories(Array.isArray(list) ? list : []);
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ statut: filterStatut, sort: sortBy });
    if (filterBiome) params.set('biomeSlug', filterBiome);
    if (filterCategorie) params.set('categorieSlug', filterCategorie);
    if (filterNiveau) params.set('niveau', filterNiveau);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await apiGL(`/api/gl/admin/qcm/questions?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [filterBiome, filterCategorie, filterNiveau, filterQ, filterStatut, sortBy]);

  useEffect(() => {
    loadBiomes().catch(() => setBiomes([]));
    loadCategories().catch(() => setCategories([]));
  }, [loadBiomes, loadCategories]);

  useEffect(() => {
    loadList().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [loadList]);

  useEffect(() => {
    if (!initialQuestionCode) return;
    loadQuestion(initialQuestionCode).catch(() => {});
  }, [initialQuestionCode]);

  async function loadQuestion(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGL(`/api/gl/admin/qcm/questions/${encodeURIComponent(code)}`);
      setForm(questionToForm(data?.question));
      setSelectedCode(code);
      if (data?.question?.biome_slug) setFilterBiome(data.question.biome_slug);
    } catch (err) {
      setError(err.message || 'Fiche introuvable');
    } finally {
      setLoading(false);
    }
  }

  async function startNewQuestion() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/admin/qcm/questions/next-code');
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        question_code: data?.question_code || '',
        biome_slug: filterBiome || biomes[0]?.slug || '',
        categorie_slug: filterCategorie || categories[0]?.slug || '',
      });
    } catch (err) {
      setError(err.message || 'Impossible de préparer une nouvelle question');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM });
    } finally {
      setLoading(false);
    }
  }

  const persistQuestion = useCallback(async () => {
    const payload = formToPayload(form);
    const isEdit = Boolean(selectedCode);
    const path = isEdit
      ? `/api/gl/admin/qcm/questions/${encodeURIComponent(selectedCode)}`
      : '/api/gl/admin/qcm/questions';
    const method = isEdit ? 'PUT' : 'POST';
    const data = await apiGL(path, method, payload);
    const code = data?.question?.question_code || form.question_code;
    setSelectedCode(code);
    const nextForm = questionToForm(data?.question);
    setForm(nextForm);
    setInfo(isEdit ? 'Question mise à jour.' : 'Question créée.');
    await loadList();
    return nextForm;
  }, [form, selectedCode, loadList]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: form,
    resetKey: selectedCode ?? `new:${form.question_code}`,
    enabled: String(form.question || '').trim().length > 0,
    onSave: persistQuestion,
  });

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function renderField(key) {
    if (key === 'biome_slug') {
      return (
        <GLField key={key} label="Biome">
          <GLSelect value={form.biome_slug} onChange={(e) => setField('biome_slug', e.target.value)}>
            <option value="">— Choisir —</option>
            {biomes.map((biome) => (
              <option key={biome.slug} value={biome.slug}>
                {biome.nom} ({biome.slug})
              </option>
            ))}
          </GLSelect>
        </GLField>
      );
    }
    if (key === 'categorie_slug') {
      return (
        <GLField key={key} label="Catégorie">
          <GLSelect
            value={form.categorie_slug}
            onChange={(e) => setField('categorie_slug', e.target.value)}
          >
            <option value="">— Choisir —</option>
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.emoji ? `${cat.emoji} ` : ''}
                {cat.nom} ({cat.slug})
              </option>
            ))}
          </GLSelect>
        </GLField>
      );
    }
    if (key === 'niveau') {
      return (
        <GLField key={key} label="Niveau">
          <GLSelect value={form.niveau} onChange={(e) => setField('niveau', e.target.value)}>
            <option value="base">Base</option>
            <option value="approfondissement">Approfondissement</option>
            <option value="avance">Avancé</option>
          </GLSelect>
        </GLField>
      );
    }
    if (key === 'statut') {
      return (
        <GLField key={key} label="Statut">
          <GLSelect value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </GLSelect>
        </GLField>
      );
    }
    if (key === 'reponse_correcte') {
      return (
        <GLField key={key} label="Bonne réponse">
          <GLSelect
            value={form.reponse_correcte}
            onChange={(e) => setField('reponse_correcte', e.target.value)}
          >
            {['A', 'B', 'C', 'D', 'E'].map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </GLSelect>
        </GLField>
      );
    }
    const label = key.replace(/_/g, ' ');
    const Control = TEXTAREA_FIELDS.has(key) ? 'textarea' : GLInput;
    return (
      <GLField key={key} label={label}>
        {Control === 'textarea' ? (
          <textarea
            className="gl-input"
            rows={3}
            value={form[key]}
            onChange={(e) => setField(key, e.target.value)}
          />
        ) : (
          <GLInput
            value={form[key]}
            onChange={(e) => setField(key, e.target.value)}
            readOnly={key === 'question_code' && Boolean(selectedCode)}
          />
        )}
      </GLField>
    );
  }

  return (
    <section className="gl-admin-section fade-in gl-qcm-editor">
      <h3>Édition des questions QCM biomes</h3>
      <p className="gl-hint">
        Parcourez le catalogue par défaut, filtrez, triez, puis modifiez une question ou créez-en
        une nouvelle.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {saveError ? <p className="gl-error">{saveError}</p> : null}
      <AutoSaveStatus status={saveStatus} className="gl-hint" />
      {info ? <p className="gl-hint">{info}</p> : null}

      <div className="gl-qcm-editor__grid">
        <div className="gl-qcm-editor__list-pane">
          <div className="gl-qcm__filters">
            <GLField label="Biome">
              <GLSelect value={filterBiome} onChange={(e) => setFilterBiome(e.target.value)}>
                <option value="">Tous</option>
                {biomes.map((biome) => (
                  <option key={biome.slug} value={biome.slug}>
                    {biome.nom}
                  </option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Catégorie">
              <GLSelect
                value={filterCategorie}
                onChange={(e) => setFilterCategorie(e.target.value)}
              >
                <option value="">Toutes</option>
                {categories.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.nom}
                  </option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Statut">
              <GLSelect value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
                <option value="actif">Actives</option>
                <option value="inactif">Inactives</option>
                <option value="all">Toutes</option>
              </GLSelect>
            </GLField>
            <GLField label="Niveau">
              <GLSelect value={filterNiveau} onChange={(e) => setFilterNiveau(e.target.value)}>
                <option value="">Tous</option>
                <option value="base">Base</option>
                <option value="approfondissement">Approfondissement</option>
                <option value="avance">Avancé</option>
              </GLSelect>
            </GLField>
            <GLField label="Tri">
              <GLSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="biome">Biome / catégorie</option>
                <option value="code">Code A→Z</option>
                <option value="code_desc">Code Z→A</option>
                <option value="category">Catégorie</option>
                <option value="difficulte">Difficulté</option>
              </GLSelect>
            </GLField>
            <GLField label="Recherche">
              <GLInput
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="code, texte, tags…"
              />
            </GLField>
          </div>

          <div className="gl-inline-actions">
            <GLButton type="button" onClick={startNewQuestion} disabled={loading}>
              Nouvelle question
            </GLButton>
            <span className="gl-hint">{filteredItems.length} question(s)</span>
          </div>

          <div className="gl-qcm-admin-list gl-qcm-editor__list">
            {filteredItems.map((item) => (
              <button
                key={item.question_code}
                type="button"
                className={`gl-qcm-editor__list-item${selectedCode === item.question_code ? ' is-selected' : ''}`}
                onClick={() => loadQuestion(item.question_code)}
              >
                <strong>{item.question_code}</strong>
                <span className="gl-hint">
                  ({item.biome_slug} / {item.categorie_slug}
                  {item.statut !== 'actif' ? ' / inactif' : ''})
                </span>
                <p>{item.question}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="gl-qcm-editor__form">
          <h4>{selectedCode ? `Modifier ${selectedCode}` : 'Nouvelle question'}</h4>
          <AutoSaveStatus status={saveStatus} className="gl-hint" />
          <div className="gl-qcm-editor__fields">
            {FORM_FIELDS.map((key) => renderField(key))}
          </div>
        </div>
      </div>
    </section>
  );
}
