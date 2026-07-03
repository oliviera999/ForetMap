import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutoSaveStatus } from '../components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../hooks/useDebouncedAutoSave.js';

// Panneau générique d'édition de questions QCM/Quiz (liste filtrable + fiche).
// Les trois éditeurs (QCM biomes GL, QCM lore GL, Quiz ForetMap) sont des adaptateurs
// minces autour de ce composant : tout ce qui varie (client HTTP, endpoints, champs,
// libellés, filtres, tris, composants UI, autosauvegarde ou soumission manuelle) est
// décrit par le descripteur `config`. Le client HTTP est toujours injecté — aucun
// import croisé de session entre produits.
//
// Forme du descripteur `config` (stable, défini au niveau module de l'adaptateur) :
// - api(path, method?, payload?)      client HTTP injecté
// - title                             titre du panneau (h3)
// - questionsBase                     base REST (`${base}`, `${base}/:code`, `${base}/next-code`)
// - formModule                        { EMPTY_FORM, FORM_FIELDS, TEXTAREA_FIELDS,
//                                       questionToForm, formToPayload }
// - clientFilter(items, filters)      filtre client (état filtres → module de formulaire)
// - clientSort(items, sortBy)         tri client
// - references                        [{ key, load }] — jeux d'options chargés au montage
// - filters                           [{ key, label, initial, param?, options(ctx) }]
// - sort                              { initial, options: [{ value, label }] }
// - autoSave                          { merge(current, sent, serverForm) } ou null (soumission manuelle)
// - scopeFilter                       { filterKey, questionField } ou null — filtre aligné après chargement
// - newQuestionDefaults(ctx)          champs pré-remplis à la création
// - categorieOptions(ctx)             options du select « Catégorie » de la fiche
// - fieldRenderers                    { [champ]: (ctx) => JSX } — rendus spécifiques
// - itemMeta(item)                    méta affichée dans la liste (hors suffixe « / inactif »)
// - ui                                { Button, Field, Input, Select, Textarea }
// - classes                           { section, hint, error, grid, listPane, filters,
//                                       listActions, list, listItem, formPane, fields, actions }
// ctx = { form, setField, refs, filters, selectedCode }

export function QuestionEditorPanel({ config, initialQuestionCode = null, onQuestionSaved }) {
  const { api, formModule, ui, classes, questionsBase } = config;
  const { EMPTY_FORM, FORM_FIELDS, TEXTAREA_FIELDS, questionToForm, formToPayload } = formModule;
  const { Button, Field, Input, Select, Textarea } = ui;
  const isAutoSave = Boolean(config.autoSave);

  const [refs, setRefs] = useState(() => {
    const initial = {};
    for (const def of config.references) initial[def.key] = [];
    return initial;
  });
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState(() => {
    const initial = {};
    for (const def of config.filters) initial[def.key] = def.initial ?? '';
    return initial;
  });
  const [filterQ, setFilterQ] = useState('');
  const [sortBy, setSortBy] = useState(config.sort.initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const draftResetSeqRef = useRef(0);
  const [autoSaveResetKey, setAutoSaveResetKey] = useState('empty');

  function setFilterValue(key, value) {
    // Conserve l'identité de l'objet quand la valeur ne change pas (évite un rechargement
    // de liste superflu, comme avec les états séparés des versions historiques).
    setFilters((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }

  const filteredItems = useMemo(() => {
    const filtered = config.clientFilter(items, { ...filters, filterQ });
    return config.clientSort(filtered, sortBy);
  }, [config, items, filters, filterQ, sortBy]);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ statut: filters.statut, sort: sortBy });
    for (const def of config.filters) {
      if (def.param && filters[def.key]) params.set(def.param, filters[def.key]);
    }
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await api(`${questionsBase}?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [api, config, questionsBase, filters, filterQ, sortBy]);

  useEffect(() => {
    for (const def of config.references) {
      def
        .load(api)
        .then((list) => {
          setRefs((prev) => ({ ...prev, [def.key]: Array.isArray(list) ? list : [] }));
        })
        .catch(() => {
          setRefs((prev) => ({ ...prev, [def.key]: [] }));
        });
    }
  }, [api, config]);

  useEffect(() => {
    loadList().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [loadList]);

  useEffect(() => {
    if (!initialQuestionCode) return;
    loadQuestion(initialQuestionCode).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestionCode]);

  async function loadQuestion(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const data = await api(`${questionsBase}/${encodeURIComponent(code)}`);
      setForm(questionToForm(data?.question));
      setSelectedCode(code);
      setAutoSaveResetKey(`question:${code}`);
      if (config.scopeFilter) {
        const scopeValue = data?.question?.[config.scopeFilter.questionField];
        if (scopeValue) setFilterValue(config.scopeFilter.filterKey, scopeValue);
      }
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
      const data = await api(`${questionsBase}/next-code`);
      const questionCode = data?.question_code || '';
      draftResetSeqRef.current += 1;
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        question_code: questionCode,
        ...config.newQuestionDefaults({ filters, refs }),
      });
      setAutoSaveResetKey(`new:${questionCode}:${draftResetSeqRef.current}`);
    } catch (err) {
      setError(err.message || 'Impossible de préparer une nouvelle question');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM });
      setAutoSaveResetKey('empty');
    } finally {
      setLoading(false);
    }
  }

  const persistQuestion = useCallback(async () => {
    const payload = formToPayload(form);
    const isEdit = Boolean(selectedCode);
    const path = isEdit ? `${questionsBase}/${encodeURIComponent(selectedCode)}` : questionsBase;
    const method = isEdit ? 'PUT' : 'POST';
    const data = await api(path, method, payload);
    const code = data?.question?.question_code || form.question_code;
    setSelectedCode(code);
    const nextForm = questionToForm(data?.question);
    if (config.autoSave) {
      // Préserve les frappes saisies pendant la requête en vol (sinon elles seraient écrasées
      // par la version serveur et rebaselinées comme « enregistrées »).
      setForm((current) => config.autoSave.merge(current, form, nextForm));
    } else {
      setForm(nextForm);
    }
    setInfo(isEdit ? 'Question mise à jour.' : 'Question créée.');
    await loadList();
    return { code, nextForm };
  }, [api, config, questionsBase, formToPayload, questionToForm, form, selectedCode, loadList]);

  const autoSavePersist = useCallback(async () => {
    const { nextForm } = await persistQuestion();
    return nextForm;
  }, [persistQuestion]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: form,
    resetKey: autoSaveResetKey,
    enabled: isAutoSave && String(form.question || '').trim().length > 0,
    onSave: autoSavePersist,
  });

  async function saveQuestion(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const { code } = await persistQuestion();
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

  const fieldCtx = { form, setField, refs, filters, selectedCode };

  function renderField(key) {
    const custom = config.fieldRenderers[key];
    if (custom) return React.cloneElement(custom(fieldCtx), { key });
    if (key === 'categorie_slug') {
      return (
        <Field key={key} label="Catégorie">
          <Select
            value={form.categorie_slug}
            onChange={(e) => setField('categorie_slug', e.target.value)}
          >
            <option value="">— Choisir —</option>
            {config.categorieOptions(fieldCtx).map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.emoji ? `${cat.emoji} ` : ''}
                {cat.nom} ({cat.slug})
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    if (key === 'statut') {
      return (
        <Field key={key} label="Statut">
          <Select value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </Select>
        </Field>
      );
    }
    if (key === 'reponse_correcte') {
      return (
        <Field key={key} label="Bonne réponse">
          <Select
            value={form.reponse_correcte}
            onChange={(e) => setField('reponse_correcte', e.target.value)}
          >
            {['A', 'B', 'C', 'D', 'E'].map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    const label = key.replace(/_/g, ' ');
    return (
      <Field key={key} label={label}>
        {TEXTAREA_FIELDS.has(key) ? (
          <Textarea value={form[key]} onChange={(e) => setField(key, e.target.value)} />
        ) : (
          <Input
            value={form[key]}
            onChange={(e) => setField(key, e.target.value)}
            readOnly={key === 'question_code' && Boolean(selectedCode)}
          />
        )}
      </Field>
    );
  }

  const formTitle = selectedCode ? `Modifier ${selectedCode}` : 'Nouvelle question';
  const fields = <div className={classes.fields}>{FORM_FIELDS.map((key) => renderField(key))}</div>;

  return (
    <section className={classes.section}>
      <h3>{config.title}</h3>
      <p className={classes.hint}>
        Parcourez le catalogue par défaut, filtrez, triez, puis modifiez une question ou créez-en
        une nouvelle.
      </p>
      {error ? <p className={classes.error}>{error}</p> : null}
      {isAutoSave && saveError ? <p className={classes.error}>{saveError}</p> : null}
      {isAutoSave ? <AutoSaveStatus status={saveStatus} className={classes.hint} /> : null}
      {info ? <p className={classes.hint}>{info}</p> : null}

      <div className={classes.grid}>
        <div className={classes.listPane}>
          <div className={classes.filters}>
            {config.filters.map((def) => (
              <Field key={def.key} label={def.label}>
                <Select
                  value={filters[def.key]}
                  onChange={(e) => setFilterValue(def.key, e.target.value)}
                >
                  {def.options({ refs, filters }).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="Tri">
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {config.sort.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Recherche">
              <Input
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="code, texte, tags…"
              />
            </Field>
          </div>

          <div className={classes.listActions}>
            <Button type="button" onClick={startNewQuestion} disabled={loading}>
              Nouvelle question
            </Button>
            <span className={classes.hint}>{filteredItems.length} question(s)</span>
          </div>

          <div className={classes.list}>
            {filteredItems.map((item) => (
              <button
                key={item.question_code}
                type="button"
                className={`${classes.listItem}${selectedCode === item.question_code ? ' is-selected' : ''}`}
                onClick={() => loadQuestion(item.question_code)}
              >
                <strong>{item.question_code}</strong>
                <span className={classes.hint}>
                  ({config.itemMeta(item)}
                  {item.statut !== 'actif' ? ' / inactif' : ''})
                </span>
                <p>{item.question}</p>
              </button>
            ))}
          </div>
        </div>

        {isAutoSave ? (
          <div className={classes.formPane}>
            <h4>{formTitle}</h4>
            <AutoSaveStatus status={saveStatus} className={classes.hint} />
            {fields}
          </div>
        ) : (
          <form className={classes.formPane} onSubmit={saveQuestion}>
            <h4>{formTitle}</h4>
            {fields}
            <div className={classes.actions}>
              <Button type="submit" disabled={loading}>
                {loading ? 'Enregistrement…' : selectedCode ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
