import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api.js';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  TEXTAREA_FIELDS,
  filterQuizItems,
  formToPayload,
  questionToForm,
  sortQuizItems,
} from '../../../utils/fmQuizEditorForm.js';

function FmButton({ type = 'button', variant, onClick, disabled, children }) {
  const className =
    variant === 'ghost' ? 'btn-ghost' : variant === 'secondary' ? 'btn-ghost' : 'btn-primary';
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function FmField({ label, children }) {
  return (
    <label className="pedago-filter-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FmInput(props) {
  return <input className="form-input" {...props} />;
}

function FmSelect({ children, ...props }) {
  return (
    <select className="form-select" {...props}>
      {children}
    </select>
  );
}

function FmTextarea(props) {
  return <textarea className="form-input" rows={3} {...props} />;
}

export function FMQuizQuestionEditorPanel({ initialQuestionCode = null, onQuestionSaved }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterTheme, setFilterTheme] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterStatut, setFilterStatut] = useState('actif');
  const [filterNiveau, setFilterNiveau] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [sortBy, setSortBy] = useState('theme');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const themeOptions = useMemo(() => {
    const themes = [...new Set(categories.map((c) => c.theme).filter(Boolean))];
    return themes.sort();
  }, [categories]);

  const categoryOptions = useMemo(() => {
    return categories
      .filter((c) => !filterTheme || c.theme === filterTheme)
      .sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
  }, [categories, filterTheme]);

  const filteredItems = useMemo(() => {
    const filtered = filterQuizItems(items, {
      filterTheme,
      filterCategorie,
      filterQ,
    });
    return sortQuizItems(filtered, sortBy);
  }, [items, filterTheme, filterCategorie, filterQ, sortBy]);

  const loadCategories = useCallback(async () => {
    const data = await api('/api/quiz/categories');
    setCategories(Array.isArray(data?.categories) ? data.categories : []);
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ statut: filterStatut, sort: sortBy });
    if (filterTheme) params.set('theme', filterTheme);
    if (filterCategorie) params.set('categorieSlug', filterCategorie);
    if (filterNiveau) params.set('niveau', filterNiveau);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await api(`/api/quiz/admin/questions?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [filterTheme, filterCategorie, filterNiveau, filterQ, filterStatut, sortBy]);

  useEffect(() => {
    loadCategories().catch(() => setCategories([]));
  }, [loadCategories]);

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
      const data = await api(`/api/quiz/admin/questions/${encodeURIComponent(code)}`);
      setForm(questionToForm(data?.question));
      setSelectedCode(code);
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
      const data = await api('/api/quiz/admin/questions/next-code');
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        question_code: data?.question_code || '',
        categorie_slug: filterCategorie || categoryOptions[0]?.slug || '',
      });
    } catch (err) {
      setError(err.message || 'Impossible de préparer une nouvelle question');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM });
    } finally {
      setLoading(false);
    }
  }

  async function saveQuestion(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const payload = formToPayload(form);
      const isEdit = Boolean(selectedCode);
      const path = isEdit
        ? `/api/quiz/admin/questions/${encodeURIComponent(selectedCode)}`
        : '/api/quiz/admin/questions';
      const method = isEdit ? 'PUT' : 'POST';
      const data = await api(path, method, payload);
      const code = data?.question?.question_code || form.question_code;
      setSelectedCode(code);
      setForm(questionToForm(data?.question));
      setInfo(isEdit ? 'Question mise à jour.' : 'Question créée.');
      await loadList();
      onQuestionSaved?.(code);
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function renderField(key) {
    if (key === 'categorie_slug') {
      return (
        <FmField key={key} label="Catégorie">
          <FmSelect
            value={form.categorie_slug}
            onChange={(e) => setField('categorie_slug', e.target.value)}
          >
            <option value="">— Choisir —</option>
            {categoryOptions.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.emoji ? `${cat.emoji} ` : ''}
                {cat.nom} ({cat.slug})
              </option>
            ))}
          </FmSelect>
        </FmField>
      );
    }
    if (key === 'niveau') {
      return (
        <FmField key={key} label="Niveau">
          <FmSelect value={form.niveau} onChange={(e) => setField('niveau', e.target.value)}>
            <option value="college">Collège</option>
            <option value="lycee">Lycée</option>
          </FmSelect>
        </FmField>
      );
    }
    if (key === 'statut') {
      return (
        <FmField key={key} label="Statut">
          <FmSelect value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </FmSelect>
        </FmField>
      );
    }
    if (key === 'reponse_correcte') {
      return (
        <FmField key={key} label="Bonne réponse">
          <FmSelect
            value={form.reponse_correcte}
            onChange={(e) => setField('reponse_correcte', e.target.value)}
          >
            {['A', 'B', 'C', 'D', 'E'].map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </FmSelect>
        </FmField>
      );
    }
    const label = key.replace(/_/g, ' ');
    const Control = TEXTAREA_FIELDS.has(key) ? FmTextarea : FmInput;
    return (
      <FmField key={key} label={label}>
        <Control
          value={form[key]}
          onChange={(e) => setField(key, e.target.value)}
          readOnly={key === 'question_code' && Boolean(selectedCode)}
        />
      </FmField>
    );
  }

  return (
    <section className="card pedago-quiz-editor fade-in">
      <h3>Édition des questions</h3>
      <p className="section-sub">
        Parcourez le catalogue par défaut, filtrez, triez, puis modifiez une question ou créez-en
        une nouvelle.
      </p>
      {error ? <p className="pedago-qcm-admin__error">{error}</p> : null}
      {info ? <p className="section-sub">{info}</p> : null}

      <div className="pedago-quiz-editor__grid">
        <div className="pedago-quiz-editor__list-pane">
          <div className="pedago-filters">
            <FmField label="Thème">
              <FmSelect value={filterTheme} onChange={(e) => setFilterTheme(e.target.value)}>
                <option value="">Tous</option>
                {themeOptions.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </FmSelect>
            </FmField>
            <FmField label="Catégorie">
              <FmSelect
                value={filterCategorie}
                onChange={(e) => setFilterCategorie(e.target.value)}
              >
                <option value="">Toutes</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.nom}
                  </option>
                ))}
              </FmSelect>
            </FmField>
            <FmField label="Statut">
              <FmSelect value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
                <option value="actif">Actives</option>
                <option value="inactif">Inactives</option>
                <option value="all">Toutes</option>
              </FmSelect>
            </FmField>
            <FmField label="Niveau">
              <FmSelect value={filterNiveau} onChange={(e) => setFilterNiveau(e.target.value)}>
                <option value="">Tous</option>
                <option value="college">Collège</option>
                <option value="lycee">Lycée</option>
              </FmSelect>
            </FmField>
            <FmField label="Tri">
              <FmSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="theme">Thème / catégorie</option>
                <option value="code">Code A→Z</option>
                <option value="code_desc">Code Z→A</option>
                <option value="category">Catégorie</option>
                <option value="difficulte">Difficulté</option>
              </FmSelect>
            </FmField>
            <FmField label="Recherche">
              <FmInput
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="code, texte, tags…"
              />
            </FmField>
          </div>

          <div className="pedago-quiz-editor__list-actions">
            <FmButton type="button" onClick={startNewQuestion} disabled={loading}>
              Nouvelle question
            </FmButton>
            <span className="section-sub">{filteredItems.length} question(s)</span>
          </div>

          <div className="pedago-qcm-admin__list pedago-quiz-editor__list">
            {filteredItems.map((item) => (
              <button
                key={item.question_code}
                type="button"
                className={`pedago-quiz-editor__list-item${selectedCode === item.question_code ? ' is-selected' : ''}`}
                onClick={() => loadQuestion(item.question_code)}
              >
                <strong>{item.question_code}</strong>
                <span className="section-sub">
                  ({item.theme || '—'} / {item.categorie_slug}
                  {item.statut !== 'actif' ? ' / inactif' : ''})
                </span>
                <p>{item.question}</p>
              </button>
            ))}
          </div>
        </div>

        <form className="pedago-quiz-editor__form" onSubmit={saveQuestion}>
          <h4>{selectedCode ? `Modifier ${selectedCode}` : 'Nouvelle question'}</h4>
          <div className="pedago-quiz-editor__fields">
            {FORM_FIELDS.map((key) => renderField(key))}
          </div>
          <div className="pedago-quiz__actions">
            <FmButton type="submit" disabled={loading}>
              {loading ? 'Enregistrement…' : selectedCode ? 'Enregistrer' : 'Créer'}
            </FmButton>
          </div>
        </form>
      </div>
    </section>
  );
}
