import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';
import { GLBadge } from '../ui/GLBadge.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import {
  FEUILLET_SECTIONS,
  FEUILLET_TYPE_OPTIONS,
  FEUILLET_STATUT_OPTIONS,
  FEUILLET_LIST_COLUMNS,
} from '../../utils/glFeuilletFieldLabels.js';
import {
  EMPTY_FORM,
  feuilletToForm,
  formToPayload,
  filterFeuilletItems,
} from '../../utils/glFeuilletEditorForm.js';
import {
  FEUILLET_BULK_FIELD_OPTIONS,
  useGlFeuilletBulkEdit,
} from '../../hooks/useGlFeuilletBulkEdit.js';

const EMPTY_FILTERS = { q: '', type: '', biome: '', statut: '' };
const EMPTY_NOTICES = { error: '', info: '', warning: '' };

/**
 * Éditeur du carnet de Sélène : tableau des feuillets (caractéristiques
 * principales) + formulaire d'édition unitaire de toutes les colonnes utiles +
 * édition en masse d'une sélection (via useGlFeuilletBulkEdit).
 */
export function GLLoreFeuilletsEditorPanel() {
  const [items, setItems] = useState([]);
  const [biomes, setBiomes] = useState([]);
  // Filtres de la liste, regroupés (recherche / type / biome / statut).
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Notifications regroupées (erreur / info / avertissement serveur).
  const [notices, setNotices] = useState(EMPTY_NOTICES);

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  /** Met à jour une partie des notifications sans toucher aux autres. */
  function notify(patch) {
    setNotices((prev) => ({ ...prev, ...patch }));
  }

  function clearNotices() {
    setNotices(EMPTY_NOTICES);
  }

  const filteredItems = useMemo(() => filterFeuilletItems(items, filters), [items, filters]);

  const loadList = useCallback(async () => {
    const data = await apiGL('/api/gl/lore/admin/feuillets');
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadBiomes = useCallback(async () => {
    const list = await apiGL('/api/gl/biomes');
    setBiomes(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    loadBiomes().catch(() => setBiomes([]));
  }, [loadBiomes]);

  useEffect(() => {
    loadList().catch((err) =>
      setNotices((prev) => ({
        ...prev,
        error: err.message || 'Chargement des feuillets impossible',
      })),
    );
  }, [loadList]);

  const visibleCodes = useMemo(
    () => filteredItems.map((row) => row.feuillet_code),
    [filteredItems],
  );

  const bulk = useGlFeuilletBulkEdit({
    visibleCodes,
    reloadList: loadList,
    onApplyStart: () => notify({ error: '', info: '' }),
    onApplySuccess: (message) => notify({ info: message }),
    onApplyError: (message) => notify({ error: message }),
  });

  async function selectFeuillet(code) {
    if (!code) return;
    setLoading(true);
    clearNotices();
    try {
      const data = await apiGL(`/api/gl/lore/admin/feuillets/${encodeURIComponent(code)}`);
      setForm(feuilletToForm(data?.feuillet));
      setSelectedCode(code);
    } catch (err) {
      notify({ error: err.message || 'Feuillet introuvable' });
    } finally {
      setLoading(false);
    }
  }

  function closeEditor() {
    setSelectedCode(null);
    setForm(EMPTY_FORM);
    clearNotices();
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!selectedCode) return;
    setSaving(true);
    clearNotices();
    try {
      const data = await apiGL(
        `/api/gl/lore/admin/feuillets/${encodeURIComponent(selectedCode)}`,
        'PUT',
        formToPayload(form),
      );
      if (data?.feuillet) setForm(feuilletToForm(data.feuillet));
      if (data?.warning?.warning) notify({ warning: data.warning.warning });
      notify({ info: 'Feuillet enregistré.' });
      await loadList();
    } catch (err) {
      notify({ error: err.message || 'Enregistrement impossible' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatut() {
    if (!selectedCode) return;
    const nextStatut = form.statut === 'actif' ? 'inactif' : 'actif';
    if (
      nextStatut === 'inactif' &&
      !window.confirm('Archiver ce feuillet ? Il ne sera plus servi en jeu.')
    ) {
      return;
    }
    setSaving(true);
    notify({ error: '' });
    try {
      const data = await apiGL(
        `/api/gl/lore/admin/feuillets/${encodeURIComponent(selectedCode)}`,
        'PATCH',
        { statut: nextStatut },
      );
      if (data?.feuillet) setForm(feuilletToForm(data.feuillet));
      notify({ info: nextStatut === 'actif' ? 'Feuillet réactivé.' : 'Feuillet archivé.' });
      await loadList();
    } catch (err) {
      notify({ error: err.message || 'Changement de statut impossible' });
    } finally {
      setSaving(false);
    }
  }

  function renderBulkValueInput() {
    if (bulk.bulkKind === 'biome') {
      return (
        <GLSelect value={bulk.bulkValue} onChange={(e) => bulk.setBulkValue(e.target.value)}>
          <option value="">— Aucun —</option>
          {biomes.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.nom || b.slug}
            </option>
          ))}
        </GLSelect>
      );
    }
    if (bulk.bulkKind === 'statut') {
      return (
        <GLSelect value={bulk.bulkValue} onChange={(e) => bulk.setBulkValue(e.target.value)}>
          <option value="">— Choisir —</option>
          {FEUILLET_STATUT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </GLSelect>
      );
    }
    return (
      <GLInput
        type={bulk.bulkKind === 'number' ? 'number' : 'text'}
        value={bulk.bulkValue}
        onChange={(e) => bulk.setBulkValue(e.target.value)}
        placeholder={bulk.bulkKind === 'text' ? '(vide = effacer)' : ''}
      />
    );
  }

  function renderField(field) {
    const value = form[field.key] ?? '';
    if (field.kind === 'biome') {
      return (
        <GLSelect value={value} onChange={(e) => setField(field.key, e.target.value)}>
          <option value="">— Aucun —</option>
          {biomes.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.nom || b.slug}
            </option>
          ))}
        </GLSelect>
      );
    }
    if (field.kind === 'select') {
      return (
        <GLSelect value={value} onChange={(e) => setField(field.key, e.target.value)}>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </GLSelect>
      );
    }
    if (field.kind === 'textarea') {
      return (
        <GLTextarea
          value={value}
          rows={field.rows || 3}
          onChange={(e) => setField(field.key, e.target.value)}
        />
      );
    }
    return (
      <GLInput
        type={field.kind === 'number' ? 'number' : 'text'}
        value={value}
        readOnly={field.readOnly || false}
        disabled={field.readOnly || false}
        onChange={(e) => setField(field.key, e.target.value)}
      />
    );
  }

  const columns = [
    {
      key: 'sel',
      label: (
        <input
          type="checkbox"
          checked={bulk.allVisibleChecked}
          onChange={bulk.toggleCheckAll}
          aria-label="Tout sélectionner"
        />
      ),
    },
    ...FEUILLET_LIST_COLUMNS,
    { key: 'actions', label: '' },
  ];
  const rows = filteredItems.map((row) => {
    const isActive = (row.statut || 'actif') === 'actif';
    const isChecked = bulk.checked.has(row.feuillet_code);
    const editBtn = (
      <GLButton type="button" variant="secondary" onClick={() => selectFeuillet(row.feuillet_code)}>
        Éditer
      </GLButton>
    );
    return {
      key: row.feuillet_code,
      rowClassName: selectedCode === row.feuillet_code ? 'is-active' : '',
      desktopCells: (
        <>
          <td>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => bulk.toggleCheck(row.feuillet_code)}
              aria-label={`Sélectionner ${row.feuillet_code}`}
            />
          </td>
          <td>
            <code>{row.feuillet_code}</code>
          </td>
          <td>{row.titre || '—'}</td>
          <td>{row.type}</td>
          <td>{row.liasse || '—'}</td>
          <td>{row.biome_slug || '—'}</td>
          <td>{row.zone_label || '—'}</td>
          <td>{row.mode_apparition}</td>
          <td>{row.ordre_voyage}</td>
          <td>
            <GLBadge tone={isActive ? 'success' : 'danger'}>{row.statut}</GLBadge>
          </td>
          <td>{editBtn}</td>
        </>
      ),
      mobileCells: (
        <>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => bulk.toggleCheck(row.feuillet_code)}
                aria-label={`Sélectionner ${row.feuillet_code}`}
              />{' '}
              Sélection
            </span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Code</span>
            <code>{row.feuillet_code}</code>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Titre</span>
            <strong>{row.titre || '—'}</strong>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Type · Mode</span>
            <span>
              {row.type} · {row.mode_apparition}
            </span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Biome · Zone</span>
            <span>
              {row.biome_slug || '—'} · {row.zone_label || '—'}
            </span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Statut</span>
            <GLBadge tone={isActive ? 'success' : 'danger'}>{row.statut}</GLBadge>
          </div>
          <div className="gl-data-card-actions">{editBtn}</div>
        </>
      ),
    };
  });

  return (
    <section className="gl-admin-section fade-in">
      <h3>Feuillets du carnet de Sélène</h3>
      <p className="gl-hint">
        Liste des feuillets ({filteredItems.length}/{items.length}) avec leurs caractéristiques.
        Cliquez « Éditer » pour modifier les champs.
      </p>
      {notices.error ? <p className="gl-error">{notices.error}</p> : null}
      {notices.info ? <p className="gl-success">{notices.info}</p> : null}
      {notices.warning ? <p className="gl-hint">⚠️ {notices.warning}</p> : null}

      <div className="gl-form gl-form--compact gl-feuillets-filters">
        <GLField label="Recherche">
          <GLInput
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder="Code, titre ou liasse…"
          />
        </GLField>
        <GLField label="Type">
          <GLSelect value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">Tous</option>
            {FEUILLET_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </GLSelect>
        </GLField>
        <GLField label="Biome">
          <GLSelect value={filters.biome} onChange={(e) => setFilter('biome', e.target.value)}>
            <option value="">Tous</option>
            {biomes.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.nom || b.slug}
              </option>
            ))}
          </GLSelect>
        </GLField>
        <GLField label="Statut">
          <GLSelect value={filters.statut} onChange={(e) => setFilter('statut', e.target.value)}>
            <option value="">Tous</option>
            {FEUILLET_STATUT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </GLSelect>
        </GLField>
      </div>

      {bulk.checked.size > 0 ? (
        <div className="gl-form gl-form--compact gl-feuillets-bulk">
          <p className="gl-hint">
            <strong>{bulk.checked.size}</strong> feuillet(s) sélectionné(s) — édition en masse :
          </p>
          <GLField label="Champ">
            <GLSelect value={bulk.bulkField} onChange={(e) => bulk.selectBulkField(e.target.value)}>
              <option value="">— Choisir —</option>
              {FEUILLET_BULK_FIELD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </GLSelect>
          </GLField>
          {bulk.bulkField ? (
            <GLField label="Nouvelle valeur">{renderBulkValueInput()}</GLField>
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

      <GLDataList columns={columns} rows={rows} emptyLabel="Aucun feuillet." />

      {selectedCode ? (
        <div className="gl-form gl-feuillet-editor-form">
          <div className="gl-inline-actions">
            <h4>
              Édition — <code>{selectedCode}</code>
            </h4>
            <GLButton type="button" variant="ghost" onClick={closeEditor} disabled={saving}>
              Fermer
            </GLButton>
          </div>

          {FEUILLET_SECTIONS.map((section) => (
            <details key={section.id} open={section.open || false}>
              <summary>{section.title}</summary>
              {section.fields.map((field) => (
                <GLField key={field.key} label={field.label}>
                  {renderField(field)}
                </GLField>
              ))}
            </details>
          ))}

          <div className="gl-inline-actions">
            <GLButton type="button" onClick={save} disabled={saving || loading}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </GLButton>
            <GLButton type="button" variant="secondary" onClick={toggleStatut} disabled={saving}>
              {form.statut === 'actif' ? 'Archiver' : 'Réactiver'}
            </GLButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
