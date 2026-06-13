import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  filterSpells,
  formToPayload,
  spellToForm,
} from '../../utils/glSpellsEditorForm.js';
import { GLSpellFormField } from './GLSpellFormField.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

export function GLSpellsEditorPanel() {
  const [categories, setCategories] = useState([]);
  const [categorySlug, setCategorySlug] = useState('');
  const [items, setItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterQ, setFilterQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const filteredItems = useMemo(() => filterSpells(items, filterQ), [items, filterQ]);

  const loadCategories = useCallback(async () => {
    const list = await apiGL('/api/gl/spell-categories');
    const rows = Array.isArray(list) ? list : [];
    setCategories(rows);
    setCategorySlug((prev) => prev || rows[0]?.slug || '');
  }, []);

  const loadList = useCallback(async () => {
    if (!categorySlug) {
      setItems([]);
      return;
    }
    const params = new URLSearchParams({ categorySlug, statutFilter: 'all' });
    if (filterQ.trim()) params.set('q', filterQ.trim());
    const data = await apiGL(`/api/gl/admin/spells?${params.toString()}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [categorySlug, filterQ]);

  useEffect(() => {
    loadCategories().catch(() => setCategories([]));
  }, [loadCategories]);

  useEffect(() => {
    loadList().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [loadList]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, category_slug: categorySlug }));
  }, [categorySlug]);

  async function loadSpell(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGL(`/api/gl/admin/spells/${encodeURIComponent(code)}`);
      setForm(spellToForm(data?.spell));
      setSelectedCode(code);
      if (data?.spell?.category_slug) setCategorySlug(data.spell.category_slug);
    } catch (err) {
      setError(err.message || 'Fiche introuvable');
    } finally {
      setLoading(false);
    }
  }

  async function startNewSpell() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGL('/api/gl/admin/spells/next-code');
      setSelectedCode(null);
      setForm({
        ...EMPTY_FORM,
        spell_code: data?.spell_code || '',
        category_slug: categorySlug,
      });
    } catch (err) {
      setError(err.message || 'Impossible de préparer un nouveau sort');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM, category_slug: categorySlug });
    } finally {
      setLoading(false);
    }
  }

  async function saveSpell(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const payload = formToPayload({ ...form, category_slug: categorySlug || form.category_slug });
      const isEdit = Boolean(selectedCode);
      const path = isEdit
        ? `/api/gl/admin/spells/${encodeURIComponent(selectedCode)}`
        : '/api/gl/admin/spells';
      const method = isEdit ? 'PUT' : 'POST';
      const data = await apiGL(path, method, payload);
      const code = data?.spell?.spell_code || form.spell_code;
      setSelectedCode(code);
      setForm(spellToForm(data?.spell));
      setInfo(isEdit ? 'Sort mis à jour.' : 'Sort créé.');
      await loadList();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function deleteSpell() {
    if (!selectedCode) return;
    if (!window.confirm('Supprimer définitivement ce sort du catalogue ?')) return;
    setLoading(true);
    setError('');
    try {
      await apiGL(`/api/gl/admin/spells/${encodeURIComponent(selectedCode)}`, 'DELETE');
      setInfo('Sort supprimé.');
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM, category_slug: categorySlug });
      await loadList();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Saisie manuelle — sortilèges</h3>
      <p className="gl-hint">
        Fiches de sorts par catégorie. Liez les sorts aux chapitres dans Contenus → Chapitres.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <GLField label="Catégorie">
        <GLSelect value={categorySlug} onChange={(e) => { setCategorySlug(e.target.value); setSelectedCode(null); }}>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.nom || c.slug}</option>
          ))}
        </GLSelect>
      </GLField>

      <div className="gl-chapters-admin-grid">
        <aside>
          <GLField label="Recherche">
            <GLInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Nom ou code…" />
          </GLField>
          <ul className="gl-chapters-admin-list">
            {filteredItems.map((row) => (
              <li key={row.spell_code}>
                <button
                  type="button"
                  className={selectedCode === row.spell_code ? 'is-active' : ''}
                  onClick={() => loadSpell(row.spell_code)}
                >
                  <span aria-hidden="true">{row.emoji || '✨'}</span>
                  {' '}
                  <strong>{row.nom}</strong>
                  <span className="gl-hint">{row.spell_code}</span>
                </button>
              </li>
            ))}
          </ul>
          <GLButton type="button" variant="secondary" onClick={startNewSpell} disabled={loading || !categorySlug}>
            + Nouveau sort
          </GLButton>
        </aside>

        <div>
          <form className="gl-form" onSubmit={saveSpell}>
            {FORM_FIELDS.map((key) => (
              <GLSpellFormField
                key={key}
                fieldKey={key}
                value={form[key]}
                onChange={setField}
                disabled={key === 'spell_code' && Boolean(selectedCode)}
              />
            ))}
            <div className="gl-inline-actions">
              <GLButton type="submit" disabled={loading || !categorySlug}>
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </GLButton>
              {selectedCode ? (
                <GLButton type="button" variant="danger" onClick={deleteSpell} disabled={loading}>
                  Supprimer
                </GLButton>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
