import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';
import { GLMultiCheckDropdown } from '../GLMultiCheckDropdown.jsx';

const EMPTY_FORM = {
  glossary_code: '',
  terme: '',
  variantes: '',
  categorie: 'ecologie',
  niveau: 'base',
  definition_courte: '',
  definition_complete: '',
  exemple: '',
  etymologie: '',
  present_dans_qcm: '',
  illustration_idee: '',
  all_biomes: true,
  biome_slugs: [],
  termes_lies: '',
  statut: 'actif',
};

function termToForm(term) {
  if (!term) return { ...EMPTY_FORM };
  return {
    glossary_code: term.glossary_code || '',
    terme: term.terme || '',
    variantes: term.variantes || '',
    categorie: term.categorie || 'ecologie',
    niveau: term.niveau || 'base',
    definition_courte: term.definition_courte || '',
    definition_complete: term.definition_complete || '',
    exemple: term.exemple || '',
    etymologie: term.etymologie || '',
    present_dans_qcm: term.present_dans_qcm || '',
    illustration_idee: term.illustration_idee || '',
    all_biomes: !!term.all_biomes,
    biome_slugs: Array.isArray(term.biome_slugs) ? [...term.biome_slugs] : [],
    termes_lies: Array.isArray(term.related_codes) ? term.related_codes.join(', ') : '',
    statut: term.statut || 'actif',
  };
}

function formToPayload(form) {
  return {
    glossary_code: form.glossary_code.trim() || undefined,
    terme: form.terme,
    variantes: form.variantes,
    categorie: form.categorie,
    niveau: form.niveau,
    definition_courte: form.definition_courte,
    definition_complete: form.definition_complete,
    exemple: form.exemple,
    etymologie: form.etymologie,
    present_dans_qcm: form.present_dans_qcm,
    illustration_idee: form.illustration_idee,
    all_biomes: form.all_biomes,
    biome_slugs: form.all_biomes ? [] : form.biome_slugs,
    termes_lies: form.termes_lies,
    statut: form.statut,
  };
}

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

  const biomeOptions = useMemo(
    () => (meta.biomes || []).map((b) => ({ value: b.slug, label: b.nom || b.slug })),
    [meta.biomes]
  );

  const filteredItems = useMemo(() => {
    let list = items;
    if (filterCategorie) list = list.filter((row) => row.categorie === filterCategorie);
    if (filterQ.trim()) {
      const needle = filterQ.trim().toLowerCase();
      list = list.filter((row) => {
        const hay = `${row.terme} ${row.glossary_code} ${row.definition_courte || ''}`.toLowerCase();
        return hay.includes(needle);
      });
    }
    return list;
  }, [items, filterCategorie, filterQ]);

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
    <section className="gl-admin-section gl-animate-in">
      <h3>Saisie manuelle — glossaire</h3>
      <p className="gl-hint">
        Créez ou modifiez un terme pédagogique. Les termes liés se saisissent en codes ou libellés séparés par des virgules.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <div className="gl-chapters-admin-grid">
        <aside>
          <div className="gl-form gl-form--compact">
            <GLField label="Recherche">
              <GLInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Terme ou code…" />
            </GLField>
            <GLField label="Catégorie">
              <GLSelect value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)}>
                <option value="">Toutes</option>
                {meta.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </GLSelect>
            </GLField>
          </div>
          <ul className="gl-chapters-admin-list">
            {filteredItems.map((row) => (
              <li key={row.glossary_code}>
                <button
                  type="button"
                  className={selectedCode === row.glossary_code ? 'is-active' : ''}
                  onClick={() => loadTerm(row.glossary_code)}
                >
                  <strong>{row.terme}</strong>
                  <span className="gl-hint">{row.glossary_code}</span>
                  {row.statut !== 'actif' ? <span className="gl-hint">(inactif)</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <GLButton type="button" variant="secondary" onClick={startNewTerm} disabled={loading}>
            + Nouveau terme
          </GLButton>
        </aside>

        <div>
          <form className="gl-form" onSubmit={saveTerm}>
            <GLField label="Code (id)" hint="Laisser vide à la création pour génération automatique GL####">
              <GLInput
                value={form.glossary_code}
                onChange={(e) => setField('glossary_code', e.target.value)}
                disabled={Boolean(selectedCode)}
              />
            </GLField>
            <GLField label="Statut">
              <GLSelect value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </GLSelect>
            </GLField>
            <GLField label="Terme *">
              <GLInput value={form.terme} onChange={(e) => setField('terme', e.target.value)} required />
            </GLField>
            <GLField label="Variantes">
              <GLInput value={form.variantes} onChange={(e) => setField('variantes', e.target.value)} />
            </GLField>
            <GLField label="Catégorie *">
              <GLSelect value={form.categorie} onChange={(e) => setField('categorie', e.target.value)} required>
                {meta.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Niveau *">
              <GLSelect value={form.niveau} onChange={(e) => setField('niveau', e.target.value)} required>
                {meta.niveaux.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Définition courte">
              <GLInput value={form.definition_courte} onChange={(e) => setField('definition_courte', e.target.value)} />
            </GLField>
            <GLField label="Définition complète">
              <GLTextarea value={form.definition_complete} onChange={(e) => setField('definition_complete', e.target.value)} rows={4} />
            </GLField>
            <GLField label="Exemple">
              <GLTextarea value={form.exemple} onChange={(e) => setField('exemple', e.target.value)} rows={2} />
            </GLField>
            <GLField label="Étymologie">
              <GLInput value={form.etymologie} onChange={(e) => setField('etymologie', e.target.value)} />
            </GLField>
            <GLField label="Portée">
              <label>
                <input
                  type="checkbox"
                  checked={form.all_biomes}
                  onChange={(e) => setField('all_biomes', e.target.checked)}
                />
                {' '}
                Tous les biomes
              </label>
            </GLField>
            {!form.all_biomes ? (
              <GLMultiCheckDropdown
                label="Biomes concernés"
                options={biomeOptions}
                selectedValues={form.biome_slugs}
                onChange={(next) => setField('biome_slugs', next)}
                emptyLabel="Aucun biome"
                allSelectedLabel="Tous les biomes listés"
              />
            ) : null}
            <GLField label="Termes liés" hint="Codes GL#### ou libellés, séparés par des virgules">
              <GLInput value={form.termes_lies} onChange={(e) => setField('termes_lies', e.target.value)} />
            </GLField>
            <GLField label="Présent dans le QCM">
              <GLInput value={form.present_dans_qcm} onChange={(e) => setField('present_dans_qcm', e.target.value)} />
            </GLField>
            <GLField label="Idée d’illustration">
              <GLTextarea value={form.illustration_idee} onChange={(e) => setField('illustration_idee', e.target.value)} rows={2} />
            </GLField>
            <div className="gl-inline-actions">
              <GLButton type="submit" disabled={loading}>
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </GLButton>
              {selectedCode ? (
                <GLButton type="button" variant="secondary" onClick={archiveTerm} disabled={loading}>
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
