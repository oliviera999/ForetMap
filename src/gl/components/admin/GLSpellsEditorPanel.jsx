import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useGlAdminCrud } from '../../hooks/useGlAdminCrud.js';
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
import { SPELL_BULK_FIELD_OPTIONS, useGlSpellsBulkEdit } from '../../hooks/useGlSpellsBulkEdit.js';
import { glSpellCasterKindBadge } from '../../utils/glSpellFieldLabels.js';

export function GLSpellsEditorPanel() {
  const [categories, setCategories] = useState([]);
  const [categorySlug, setCategorySlug] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [bulkError, setBulkError] = useState('');

  const listPath = useMemo(() => {
    if (!categorySlug) return null;
    const params = new URLSearchParams({ categorySlug, statutFilter: 'all' });
    if (filterQ.trim()) params.set('q', filterQ.trim());
    return `/api/gl/admin/spells?${params.toString()}`;
  }, [categorySlug, filterQ]);

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
    basePath: '/api/gl/admin/spells',
    codeField: 'spell_code',
    entityKey: 'spell',
    emptyForm: EMPTY_FORM,
    toForm: spellToForm,
    toPayload: (f) => formToPayload({ ...f, category_slug: categorySlug || f.category_slug }),
    newFormExtra: { category_slug: categorySlug },
    onItemLoaded: (spell) => {
      if (spell?.category_slug) setCategorySlug(spell.category_slug);
    },
    isAutoSaveReady: (f) => Boolean(categorySlug) && String(f.nom || '').trim().length > 0,
    messages: {
      updated: 'Sort mis à jour.',
      created: 'Sort créé.',
      startNewError: 'Impossible de préparer un nouveau sort',
    },
  });

  const filteredItems = useMemo(() => filterSpells(items, filterQ), [items, filterQ]);
  const visibleCodes = useMemo(() => filteredItems.map((row) => row.spell_code), [filteredItems]);

  const bulk = useGlSpellsBulkEdit({
    visibleCodes,
    reloadList: loadList,
    onApplyStart: () => setInfo(''),
    onApplySuccess: (message) => setInfo(message),
    onApplyError: (message) => setBulkError(message),
  });

  const loadCategories = useCallback(async () => {
    const list = await apiGL('/api/gl/spell-categories');
    const rows = Array.isArray(list) ? list : [];
    setCategories(rows);
    setCategorySlug((prev) => prev || rows[0]?.slug || '');
  }, []);

  useEffect(() => {
    loadCategories().catch(() => setCategories([]));
  }, [loadCategories]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, category_slug: categorySlug }));
  }, [categorySlug, setForm]);

  async function deleteSpell() {
    if (!selectedCode) return;
    if (
      !window.confirm(
        'Supprimer définitivement ce sort du catalogue ? Il sera aussi retiré des chapitres auxquels il est lié.',
      )
    )
      return;
    await runAction(async () => {
      const res = await apiGL(itemPath(selectedCode), 'DELETE');
      const unlinked = Number(res?.unlinkedChapters || 0);
      setInfo(
        unlinked > 0
          ? `Sort supprimé (retiré de ${unlinked} chapitre${unlinked > 1 ? 's' : ''}).`
          : 'Sort supprimé.',
      );
      setSelectedCode(null);
      setForm({ ...EMPTY_FORM, category_slug: categorySlug });
      await loadList();
    }, 'Suppression impossible');
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Saisie manuelle — sortilèges</h3>
      <p className="gl-hint">
        Fiches de sorts par catégorie. Liez les sorts aux chapitres dans Contenus → Chapitres.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {saveError ? <p className="gl-error">{saveError}</p> : null}
      {bulkError ? <p className="gl-error">{bulkError}</p> : null}
      <AutoSaveStatus status={saveStatus} className="gl-hint" />
      {info ? <p className="gl-hint">{info}</p> : null}

      <GLField label="Catégorie">
        <GLSelect
          value={categorySlug}
          onChange={(e) => {
            setCategorySlug(e.target.value);
            setSelectedCode(null);
            // La sélection de lot porte sur des codes de la catégorie quittée :
            // la conserver appliquerait le réglage à des sorts hors écran.
            bulk.clearChecked();
          }}
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nom || c.slug}
            </option>
          ))}
        </GLSelect>
      </GLField>

      {bulk.checked.size > 0 ? (
        <div className="gl-form gl-form--compact gl-spells-bulk">
          <p className="gl-hint">
            <strong>{bulk.checked.size}</strong> sortilège(s) sélectionné(s) — édition en masse :
          </p>
          <GLField label="Réglage">
            <GLSelect value={bulk.bulkField} onChange={(e) => bulk.selectBulkField(e.target.value)}>
              <option value="">— Choisir —</option>
              {SPELL_BULK_FIELD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </GLSelect>
          </GLField>
          {bulk.bulkOptions ? (
            <GLField label="Nouvelle valeur">
              <GLSelect value={bulk.bulkValue} onChange={(e) => bulk.setBulkValue(e.target.value)}>
                {Object.entries(bulk.bulkOptions).map(([val, lab]) => (
                  <option key={val} value={val}>
                    {lab}
                  </option>
                ))}
              </GLSelect>
            </GLField>
          ) : null}
          <div className="gl-inline-actions">
            <GLButton
              type="button"
              onClick={bulk.applyBulk}
              disabled={!bulk.bulkField || bulk.bulkBusy}
            >
              {bulk.bulkBusy ? 'Application…' : `Appliquer à ${bulk.checked.size}`}
            </GLButton>
            <GLButton
              type="button"
              variant="ghost"
              onClick={bulk.clearChecked}
              disabled={bulk.bulkBusy}
            >
              Tout désélectionner
            </GLButton>
          </div>
        </div>
      ) : null}

      <div className="gl-chapters-admin-grid">
        <aside>
          <GLField label="Recherche">
            <GLInput
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder="Nom ou code…"
            />
          </GLField>
          {filteredItems.length > 0 ? (
            <label className="gl-spells-bulk__all">
              <input
                type="checkbox"
                checked={bulk.allVisibleChecked}
                onChange={bulk.toggleCheckAll}
              />
              Tout sélectionner ({filteredItems.length})
            </label>
          ) : null}
          <ul className="gl-chapters-admin-list">
            {filteredItems.map((row) => {
              const casterBadge = glSpellCasterKindBadge(row.caster_kind);
              return (
                <li key={row.spell_code} className="gl-spells-bulk__row">
                  <input
                    type="checkbox"
                    checked={bulk.checked.has(row.spell_code)}
                    onChange={() => bulk.toggleCheck(row.spell_code)}
                    aria-label={`Sélectionner ${row.nom || row.spell_code}`}
                  />
                  <button
                    type="button"
                    className={selectedCode === row.spell_code ? 'is-active' : ''}
                    onClick={() => loadItem(row.spell_code)}
                  >
                    <span aria-hidden="true">{row.emoji || '✨'}</span> <strong>{row.nom}</strong>
                    <span className="gl-hint">{row.spell_code}</span>
                    {casterBadge ? <span className="gl-badge">{casterBadge}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <GLButton
            type="button"
            variant="secondary"
            onClick={startNew}
            disabled={loading || !categorySlug}
          >
            + Nouveau sort
          </GLButton>
        </aside>

        <div>
          <div className="gl-form">
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
              {selectedCode ? (
                <GLButton
                  type="button"
                  variant="danger"
                  onClick={deleteSpell}
                  disabled={loading || saveStatus === 'saving'}
                >
                  Supprimer
                </GLButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
