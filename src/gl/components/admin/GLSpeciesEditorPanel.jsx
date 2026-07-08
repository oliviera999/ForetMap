import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useGlAdminCrud } from '../../hooks/useGlAdminCrud.js';
import { GL_SPECIES_DETAIL_SECTIONS } from '../../utils/glSpeciesFieldLabels.js';
import {
  EMPTY_FORM,
  filterSpeciesItems,
  formToPayload,
  speciesToForm,
} from '../../utils/glSpeciesEditorForm.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLSpeciesField } from './GLSpeciesField.jsx';

export function GLSpeciesEditorPanel() {
  const [biomes, setBiomes] = useState([]);
  const [biomeSlug, setBiomeSlug] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [filterType, setFilterType] = useState('');

  const listPath = useMemo(() => {
    if (!biomeSlug) return null;
    const params = new URLSearchParams({ biomeSlug, statut: 'all' });
    if (filterType) params.set('type', filterType);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    return `/api/gl/admin/species?${params.toString()}`;
  }, [biomeSlug, filterType, filterQ]);

  const {
    items,
    selectedCode,
    setSelectedCode,
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
    basePath: '/api/gl/admin/species',
    codeField: 'species_code',
    entityKey: 'species',
    emptyForm: EMPTY_FORM,
    toForm: speciesToForm,
    toPayload: (f) => formToPayload({ ...f, biome_slug: biomeSlug || f.biome_slug }),
    newFormExtra: { biome_slug: biomeSlug },
    onItemLoaded: (species) => {
      if (species?.biome_slug) setBiomeSlug(species.biome_slug);
    },
    isAutoSaveReady: (f) => Boolean(biomeSlug) && String(f.nom_commun || '').trim().length > 0,
    messages: {
      updated: 'Espèce mise à jour.',
      created: 'Espèce créée.',
      startNewError: 'Impossible de préparer une nouvelle espèce',
    },
  });

  const filteredItems = useMemo(
    () => filterSpeciesItems(items, { type: filterType, q: filterQ }),
    [items, filterType, filterQ],
  );

  const loadBiomes = useCallback(async () => {
    const list = await apiGL('/api/gl/biomes');
    const rows = Array.isArray(list) ? list : [];
    setBiomes(rows);
    setBiomeSlug((prev) => prev || rows[0]?.slug || '');
  }, []);

  useEffect(() => {
    loadBiomes().catch(() => setBiomes([]));
  }, [loadBiomes]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, biome_slug: biomeSlug }));
  }, [biomeSlug, setForm]);

  async function archiveSpecies() {
    if (!selectedCode) return;
    if (!window.confirm('Archiver cette espèce (statut inactif) ?')) return;
    await runAction(async () => {
      await apiGL(itemPath(selectedCode), 'PATCH', { statut: 'inactif' });
      setInfo('Espèce archivée.');
      await loadList();
      setForm((prev) => ({ ...prev, statut: 'inactif' }));
    }, 'Archivage impossible');
  }

  const coreFields = [
    'species_code',
    'type',
    'nom_commun',
    'nom_scientifique',
    'groupe',
    'famille',
    'mots_cles',
    'photo_url',
  ];

  return (
    <section className="gl-admin-section fade-in">
      <h3>Saisie manuelle — biodiversité (espèces)</h3>
      <p className="gl-hint">
        Fiches espèces par biome. Les mots-clés relient la fiche au glossaire (séparés par des
        virgules).
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {saveError ? <p className="gl-error">{saveError}</p> : null}
      <AutoSaveStatus status={saveStatus} className="gl-hint" />
      {info ? <p className="gl-hint">{info}</p> : null}

      <GLField label="Biome du catalogue">
        <GLSelect
          value={biomeSlug}
          onChange={(e) => {
            setBiomeSlug(e.target.value);
            setSelectedCode(null);
          }}
        >
          {biomes.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.nom || b.slug}
            </option>
          ))}
        </GLSelect>
      </GLField>

      <div className="gl-chapters-admin-grid">
        <aside>
          <div className="gl-form gl-form--compact">
            <GLField label="Recherche">
              <GLInput
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="Nom ou code…"
              />
            </GLField>
            <GLField label="Type">
              <GLSelect value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">Tous</option>
                <option value="faune">Faune</option>
                <option value="flore">Flore</option>
              </GLSelect>
            </GLField>
          </div>
          <ul className="gl-chapters-admin-list">
            {filteredItems.map((row) => (
              <li key={row.species_code}>
                <button
                  type="button"
                  className={selectedCode === row.species_code ? 'is-active' : ''}
                  onClick={() => loadItem(row.species_code)}
                >
                  <strong>{row.nom_commun}</strong>
                  <span className="gl-hint">{row.species_code}</span>
                  {row.statut !== 'actif' ? <span className="gl-hint">(inactif)</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <GLButton
            type="button"
            variant="secondary"
            onClick={startNew}
            disabled={loading || !biomeSlug}
          >
            + Nouvelle espèce
          </GLButton>
        </aside>

        <div>
          <div className="gl-form">
            <h4>Identification</h4>
            {coreFields.map((key) => (
              <GLSpeciesField
                key={key}
                fieldKey={key}
                value={form[key]}
                onChange={setField}
                disabled={key === 'species_code' && Boolean(selectedCode)}
              />
            ))}
            <GLSpeciesField fieldKey="statut" value={form.statut} onChange={setField} />

            {GL_SPECIES_DETAIL_SECTIONS.filter((s) => s.id !== 'reference').map((section) => (
              <details key={section.id} open={section.id === 'ecologie'}>
                <summary>{section.title}</summary>
                {section.fields.map((key) => (
                  <GLSpeciesField key={key} fieldKey={key} value={form[key]} onChange={setField} />
                ))}
              </details>
            ))}

            <div className="gl-inline-actions">
              {selectedCode ? (
                <GLButton
                  type="button"
                  variant="secondary"
                  onClick={archiveSpecies}
                  disabled={loading || saveStatus === 'saving'}
                >
                  Archiver
                </GLButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
