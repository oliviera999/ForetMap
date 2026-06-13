import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLGlossaryTermList } from './GLGlossaryTermList.jsx';
import { GLGlossaryTermForm } from './GLGlossaryTermForm.jsx';
import {
  EMPTY_FORM,
  termToForm,
  formToPayload,
  buildBiomeOptions,
  filterGlossaryItems,
} from '../../utils/glGlossaryEditorForm.js';

export function GLGlossaryEditorPanel() {
  const [meta, setMeta] = useState({ categories: [], niveaux: [], biomes: [] });
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterQ, setFilterQ] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const biomeOptions = useMemo(() => buildBiomeOptions(meta.biomes), [meta.biomes]);

  const filteredItems = useMemo(
    () => filterGlossaryItems(items, { filterCategorie, filterQ }),
    [items, filterCategorie, filterQ]
  );

  const loadMeta = useCallback(async () => {
    const data = await apiGL('/api/gl/admin/glossary/meta');
    setMeta({
      categories: Array.isArray(data?.categories) ? data.categories : [],
      niveaux: Array.isArray(data?.niveaux) ? data.niveaux : [],
      biomes: Array.isArray(data?.biomes) ? data.biomes : [],
    });
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ statut: 'all' });
    if (filterCategorie) params.set('categorie', filterCategorie);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await apiGL(`/api/gl/admin/glossary/terms?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [filterCategorie, filterQ]);

  useEffect(() => {
    loadMeta().catch(() => setMeta({ categories: [], niveaux: [], biomes: [] }));
  }, [loadMeta]);

  useEffect(() => {
    loadList().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [loadList]);

  async function loadTerm(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGL(`/api/gl/admin/glossary/terms/${encodeURIComponent(code)}`);
      setForm(termToForm(data?.term));
      setSelectedCode(code);
    } catch (err) {
      setError(err.message || 'Fiche introuvable');
    } finally {
      setLoading(false);
    }
  }

  async function startNewTerm() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/admin/glossary/terms/next-code');
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        glossary_code: data?.glossary_code || '',
      });
    } catch (err) {
      setError(err.message || 'Impossible de préparer un nouveau terme');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM });
    } finally {
      setLoading(false);
    }
  }

  async function saveTerm(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const payload = formToPayload(form);
      const isEdit = Boolean(selectedCode);
      const path = isEdit
        ? `/api/gl/admin/glossary/terms/${encodeURIComponent(selectedCode)}`
        : '/api/gl/admin/glossary/terms';
      const method = isEdit ? 'PUT' : 'POST';
      const data = await apiGL(path, method, payload);
      const code = data?.term?.glossary_code || form.glossary_code;
      setSelectedCode(code);
      setForm(termToForm(data?.term));
      setInfo(isEdit ? 'Terme mis à jour.' : 'Terme créé.');
      await loadList();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function archiveTerm() {
    if (!selectedCode) return;
    if (!window.confirm('Archiver ce terme (statut inactif) ?')) return;
    setLoading(true);
    setError('');
    try {
      await apiGL(`/api/gl/admin/glossary/terms/${encodeURIComponent(selectedCode)}`, 'PATCH', {
        statut: 'inactif',
      });
      setInfo('Terme archivé.');
      await loadList();
      setForm((prev) => ({ ...prev, statut: 'inactif' }));
    } catch (err) {
      setError(err.message || 'Archivage impossible');
    } finally {
      setLoading(false);
    }
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Saisie manuelle — glossaire</h3>
      <p className="gl-hint">
        Créez ou modifiez un terme pédagogique. Les termes liés se saisissent en codes ou libellés séparés par des virgules.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <div className="gl-chapters-admin-grid">
        <GLGlossaryTermList
          filterQ={filterQ}
          onFilterQChange={setFilterQ}
          filterCategorie={filterCategorie}
          onFilterCategorieChange={setFilterCategorie}
          categories={meta.categories}
          items={filteredItems}
          selectedCode={selectedCode}
          onSelect={loadTerm}
          onNew={startNewTerm}
          loading={loading}
        />

        <div>
          <GLGlossaryTermForm
            form={form}
            onField={setField}
            onSubmit={saveTerm}
            onArchive={archiveTerm}
            selectedCode={selectedCode}
            loading={loading}
            categories={meta.categories}
            niveaux={meta.niveaux}
            biomeOptions={biomeOptions}
          />
        </div>
      </div>
    </section>
  );
}
