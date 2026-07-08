import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useGlAdminCrud } from '../../hooks/useGlAdminCrud.js';
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
  const [filterQ, setFilterQ] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');

  const listPath = useMemo(() => {
    const params = new URLSearchParams({ statut: 'all' });
    if (filterCategorie) params.set('categorie', filterCategorie);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    return `/api/gl/admin/glossary/terms?${params.toString()}`;
  }, [filterCategorie, filterQ]);

  const {
    items,
    selectedCode,
    form,
    setForm,
    setField,
    loading,
    error,
    info,
    setInfo,
    saveStatus,
    saveError,
    itemPath,
    loadList,
    loadItem,
    startNew,
    runAction,
  } = useGlAdminCrud({
    listPath,
    basePath: '/api/gl/admin/glossary/terms',
    codeField: 'glossary_code',
    entityKey: 'term',
    emptyForm: EMPTY_FORM,
    toForm: termToForm,
    toPayload: formToPayload,
    isAutoSaveReady: (f) => String(f.terme || '').trim().length > 0,
    canSave: (f) => {
      if (!String(f.terme || '').trim()) return false;
      if (!f.categorie || !f.niveau) return 'Catégorie et niveau requis';
      return true;
    },
    messages: {
      updated: 'Terme mis à jour.',
      created: 'Terme créé.',
      startNewError: 'Impossible de préparer un nouveau terme',
    },
  });

  const biomeOptions = useMemo(() => buildBiomeOptions(meta.biomes), [meta.biomes]);

  const filteredItems = useMemo(
    () => filterGlossaryItems(items, { filterCategorie, filterQ }),
    [items, filterCategorie, filterQ],
  );

  const loadMeta = useCallback(async () => {
    const data = await apiGL('/api/gl/admin/glossary/meta');
    setMeta({
      categories: Array.isArray(data?.categories) ? data.categories : [],
      niveaux: Array.isArray(data?.niveaux) ? data.niveaux : [],
      biomes: Array.isArray(data?.biomes) ? data.biomes : [],
    });
  }, []);

  useEffect(() => {
    loadMeta().catch(() => setMeta({ categories: [], niveaux: [], biomes: [] }));
  }, [loadMeta]);

  async function archiveTerm() {
    if (!selectedCode) return;
    if (!window.confirm('Archiver ce terme (statut inactif) ?')) return;
    await runAction(async () => {
      await apiGL(itemPath(selectedCode), 'PATCH', { statut: 'inactif' });
      setInfo('Terme archivé.');
      await loadList();
      setForm((prev) => ({ ...prev, statut: 'inactif' }));
    }, 'Archivage impossible');
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Saisie manuelle — glossaire scientifique</h3>
      <p className="gl-hint">
        Créez ou modifiez un terme pédagogique. Les termes liés se saisissent en codes ou libellés
        séparés par des virgules.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {saveError ? <p className="gl-error">{saveError}</p> : null}
      <AutoSaveStatus status={saveStatus} className="gl-hint" />
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
          onSelect={loadItem}
          onNew={startNew}
          loading={loading}
        />

        <div>
          <GLGlossaryTermForm
            form={form}
            onField={setField}
            onArchive={archiveTerm}
            selectedCode={selectedCode}
            loading={loading || saveStatus === 'saving'}
            categories={meta.categories}
            niveaux={meta.niveaux}
            biomeOptions={biomeOptions}
          />
        </div>
      </div>
    </section>
  );
}
