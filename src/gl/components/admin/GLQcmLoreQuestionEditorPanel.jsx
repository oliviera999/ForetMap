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
} from '../../utils/glQcmLoreEditorForm.js';
import { mergeAutoSaveForm } from '../../utils/mergeAutoSaveForm.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

export function GLQcmLoreQuestionEditorPanel({ initialQuestionCode = null }) {
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterChapitre, setFilterChapitre] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatut, setFilterStatut] = useState('actif');
  const [filterQ, setFilterQ] = useState('');
  const [sortBy, setSortBy] = useState('chapitre');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const filteredItems = useMemo(() => {
    const filtered = filterQcmItems(items, {
      filterChapitre,
      filterCategorie,
      filterTier,
      filterQ,
    });
    return sortQcmItems(filtered, sortBy);
  }, [items, filterChapitre, filterCategorie, filterTier, filterQ, sortBy]);

  const loadScopes = useCallback(async () => {
    const list = await apiGL('/api/gl/lore/qcm/scopes');
    setScopes(Array.isArray(list) ? list : []);
  }, []);

  const loadCategories = useCallback(async () => {
    const list = await apiGL('/api/gl/lore/qcm/categories');
    setCategories(Array.isArray(list) ? list : []);
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ statut: filterStatut, sort: sortBy });
    if (filterChapitre) params.set('chapitreSlug', filterChapitre);
    if (filterCategorie) params.set('categorieSlug', filterCategorie);
    if (filterTier) params.set('tierLore', filterTier);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await apiGL(`/api/gl/lore/admin/qcm/questions?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [filterChapitre, filterCategorie, filterTier, filterQ, filterStatut, sortBy]);

  useEffect(() => {
    loadScopes().catch(() => setScopes([]));
    loadCategories().catch(() => setCategories([]));
  }, [loadScopes, loadCategories]);

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
      const data = await apiGL(`/api/gl/lore/admin/qcm/questions/${encodeURIComponent(code)}`);
      setForm(questionToForm(data?.question));
      setSelectedCode(code);
      if (data?.question?.chapitre_slug) setFilterChapitre(data.question.chapitre_slug);
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
      const data = await apiGL('/api/gl/lore/admin/qcm/questions/next-code');
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        question_code: data?.question_code || '',
        chapitre_slug: filterChapitre || scopes[0]?.slug || 'tous',
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
      ? `/api/gl/lore/admin/qcm/questions/${encodeURIComponent(selectedCode)}`
      : '/api/gl/lore/admin/qcm/questions';
    const method = isEdit ? 'PUT' : 'POST';
    const data = await apiGL(path, method, payload);
    const code = data?.question?.question_code || form.question_code;
    setSelectedCode(code);
    const nextForm = questionToForm(data?.question);
    // Préserve les frappes saisies pendant la requête en vol (sinon elles seraient écrasées
    // par la version serveur et rebaselinées comme « enregistrées »).
    setForm((current) => mergeAutoSaveForm(current, form, nextForm));
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
    if (key === 'chapitre_slug') {
      return (
        <GLField key={key} label="Chapitre lore">
          <GLSelect
            value={form.chapitre_slug}
            onChange={(e) => setField('chapitre_slug', e.target.value)}
          >
            {scopes.map((scope) => (
              <option key={scope.slug} value={scope.slug}>
                {scope.nom} ({scope.slug})
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
    if (key === 'tier_lore') {
      return (
        <GLField key={key} label="Tier lore">
          <GLSelect value={form.tier_lore} onChange={(e) => setField('tier_lore', e.target.value)}>
            <option value="cle">Clé</option>
            <option value="recit">Récit</option>
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
      <h3>Édition des questions QCM lore</h3>
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
            <GLField label="Chapitre">
              <GLSelect value={filterChapitre} onChange={(e) => setFilterChapitre(e.target.value)}>
                <option value="">Tous</option>
                {scopes.map((scope) => (
                  <option key={scope.slug} value={scope.slug}>
                    {scope.nom}
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
            <GLField label="Tier">
              <GLSelect value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
                <option value="">Tous</option>
                <option value="cle">Clé</option>
                <option value="recit">Récit</option>
              </GLSelect>
            </GLField>
            <GLField label="Statut">
              <GLSelect value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
                <option value="actif">Actives</option>
                <option value="inactif">Inactives</option>
                <option value="all">Toutes</option>
              </GLSelect>
            </GLField>
            <GLField label="Tri">
              <GLSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="chapitre">Chapitre / catégorie</option>
                <option value="code">Code A→Z</option>
                <option value="code_desc">Code Z→A</option>
                <option value="category">Catégorie</option>
                <option value="difficulte">Difficulté</option>
                <option value="tier">Tier lore</option>
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
                  ({item.chapitre_slug} / {item.categorie_slug} / {item.tier_lore || 'recit'}
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
          <div className="gl-qcm-editor__fields">{FORM_FIELDS.map((key) => renderField(key))}</div>
        </div>
      </div>
    </section>
  );
}
