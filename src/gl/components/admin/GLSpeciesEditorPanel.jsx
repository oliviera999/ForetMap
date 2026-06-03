import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import {
  GL_SPECIES_DETAIL_SECTIONS,
  GL_SPECIES_FIELD_LABELS,
  GL_SPECIES_TYPE_LABELS,
} from '../../utils/glSpeciesFieldLabels.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

const TEXTAREA_FIELDS = new Set([
  'role_ecologique',
  'adaptations_cles',
  'regime_alimentaire',
  'reproduction',
  'observation_terrain',
  'description_courte',
  'anecdote',
]);

const EMPTY_FORM = {
  species_code: '',
  biome_slug: '',
  type: 'faune',
  nom_commun: '',
  nom_scientifique: '',
  groupe: '',
  famille: '',
  statut_iucn: '',
  endemique: '',
  role_ecologique: '',
  adaptations_cles: '',
  taille_adulte: '',
  poids_adulte: '',
  regime_alimentaire: '',
  longevite: '',
  reproduction: '',
  observation_terrain: '',
  description_courte: '',
  anecdote: '',
  present_dans_qcm: '',
  mots_cles: '',
  wikipedia_title: '',
  wikipedia_url: '',
  photo_url: '',
  photo_credit: '',
  photo_licence: '',
  photo_licence_url: '',
  statut: 'actif',
};

function speciesToForm(species) {
  if (!species) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    next[key] = species[key] != null ? String(species[key]) : '';
  }
  return next;
}

function formToPayload(form) {
  const payload = { ...form };
  if (!payload.species_code.trim()) delete payload.species_code;
  return payload;
}

function SpeciesField({ fieldKey, value, onChange, disabled }) {
  const label = GL_SPECIES_FIELD_LABELS[fieldKey] || fieldKey;
  if (fieldKey === 'type') {
    return (
      <GLField label={label}>
        <GLSelect value={value} onChange={(e) => onChange(fieldKey, e.target.value)} disabled={disabled} required>
          <option value="faune">{GL_SPECIES_TYPE_LABELS.faune}</option>
          <option value="flore">{GL_SPECIES_TYPE_LABELS.flore}</option>
        </GLSelect>
      </GLField>
    );
  }
  if (fieldKey === 'statut') {
    return (
      <GLField label={label}>
        <GLSelect value={value} onChange={(e) => onChange(fieldKey, e.target.value)} disabled={disabled}>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
        </GLSelect>
      </GLField>
    );
  }
  if (TEXTAREA_FIELDS.has(fieldKey)) {
    return (
      <GLField label={label}>
        <GLTextarea value={value} onChange={(e) => onChange(fieldKey, e.target.value)} rows={3} disabled={disabled} />
      </GLField>
    );
  }
  return (
    <GLField label={label}>
      <GLInput
        value={value}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        disabled={disabled}
        required={fieldKey === 'nom_commun'}
      />
    </GLField>
  );
}

export function GLSpeciesEditorPanel() {
  const [biomes, setBiomes] = useState([]);
  const [biomeSlug, setBiomeSlug] = useState('');
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterQ, setFilterQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const filteredItems = useMemo(() => {
    let list = items;
    if (filterType) list = list.filter((row) => row.type === filterType);
    if (filterQ.trim()) {
      const needle = filterQ.trim().toLowerCase();
      list = list.filter((row) => {
        const hay = `${row.nom_commun} ${row.species_code}`.toLowerCase();
        return hay.includes(needle);
      });
    }
    return list;
  }, [items, filterType, filterQ]);

  const loadBiomes = useCallback(async () => {
    const list = await apiGL('/api/gl/biomes');
    const rows = Array.isArray(list) ? list : [];
    setBiomes(rows);
    setBiomeSlug((prev) => prev || rows[0]?.slug || '');
  }, []);

  const loadList = useCallback(async () => {
    if (!biomeSlug) {
      setItems([]);
      return;
    }
    const params = new URLSearchParams({ biomeSlug, statut: 'all' });
    if (filterType) params.set('type', filterType);
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await apiGL(`/api/gl/admin/species?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [biomeSlug, filterType, filterQ]);

  useEffect(() => {
    loadBiomes().catch(() => setBiomes([]));
  }, [loadBiomes]);

  useEffect(() => {
    loadList().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [loadList]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, biome_slug: biomeSlug }));
  }, [biomeSlug]);

  async function loadSpecies(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGL(`/api/gl/admin/species/${encodeURIComponent(code)}`);
      setForm(speciesToForm(data?.species));
      setSelectedCode(code);
      if (data?.species?.biome_slug) setBiomeSlug(data.species.biome_slug);
    } catch (err) {
      setError(err.message || 'Fiche introuvable');
    } finally {
      setLoading(false);
    }
  }

  async function startNewSpecies() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/admin/species/next-code');
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        species_code: data?.species_code || '',
        biome_slug: biomeSlug,
      });
    } catch (err) {
      setError(err.message || 'Impossible de préparer une nouvelle espèce');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM, biome_slug: biomeSlug });
    } finally {
      setLoading(false);
    }
  }

  async function saveSpecies(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const payload = formToPayload({ ...form, biome_slug: biomeSlug || form.biome_slug });
      const isEdit = Boolean(selectedCode);
      const path = isEdit
        ? `/api/gl/admin/species/${encodeURIComponent(selectedCode)}`
        : '/api/gl/admin/species';
      const method = isEdit ? 'PUT' : 'POST';
      const data = await apiGL(path, method, payload);
      const code = data?.species?.species_code || form.species_code;
      setSelectedCode(code);
      setForm(speciesToForm(data?.species));
      setInfo(isEdit ? 'Espèce mise à jour.' : 'Espèce créée.');
      await loadList();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function archiveSpecies() {
    if (!selectedCode) return;
    if (!window.confirm('Archiver cette espèce (statut inactif) ?')) return;
    setLoading(true);
    setError('');
    try {
      await apiGL(`/api/gl/admin/species/${encodeURIComponent(selectedCode)}`, 'PATCH', {
        statut: 'inactif',
      });
      setInfo('Espèce archivée.');
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

  const coreFields = ['species_code', 'type', 'nom_commun', 'nom_scientifique', 'groupe', 'famille', 'mots_cles', 'photo_url'];

  return (
    <section className="gl-admin-section fade-in">
      <h3>Saisie manuelle — biocénose (espèces)</h3>
      <p className="gl-hint">
        Fiches espèces par biome. Les mots-clés relient la fiche au glossaire (séparés par des virgules).
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <GLField label="Biome du catalogue">
        <GLSelect value={biomeSlug} onChange={(e) => { setBiomeSlug(e.target.value); setSelectedCode(null); }}>
          {biomes.map((b) => (
            <option key={b.slug} value={b.slug}>{b.nom || b.slug}</option>
          ))}
        </GLSelect>
      </GLField>

      <div className="gl-chapters-admin-grid">
        <aside>
          <div className="gl-form gl-form--compact">
            <GLField label="Recherche">
              <GLInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Nom ou code…" />
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
                  onClick={() => loadSpecies(row.species_code)}
                >
                  <strong>{row.nom_commun}</strong>
                  <span className="gl-hint">{row.species_code}</span>
                  {row.statut !== 'actif' ? <span className="gl-hint">(inactif)</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <GLButton type="button" variant="secondary" onClick={startNewSpecies} disabled={loading || !biomeSlug}>
            + Nouvelle espèce
          </GLButton>
        </aside>

        <div>
          <form className="gl-form" onSubmit={saveSpecies}>
            <h4>Identification</h4>
            {coreFields.map((key) => (
              <SpeciesField
                key={key}
                fieldKey={key}
                value={form[key]}
                onChange={setField}
                disabled={key === 'species_code' && Boolean(selectedCode)}
              />
            ))}
            <SpeciesField fieldKey="statut" value={form.statut} onChange={setField} />

            {GL_SPECIES_DETAIL_SECTIONS.filter((s) => s.id !== 'reference').map((section) => (
              <details key={section.id} open={section.id === 'ecologie'}>
                <summary>{section.title}</summary>
                {section.fields.map((key) => (
                  <SpeciesField key={key} fieldKey={key} value={form[key]} onChange={setField} />
                ))}
              </details>
            ))}

            <div className="gl-inline-actions">
              <GLButton type="submit" disabled={loading || !biomeSlug}>
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </GLButton>
              {selectedCode ? (
                <GLButton type="button" variant="secondary" onClick={archiveSpecies} disabled={loading}>
                  Archiver
                </GLButton>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
