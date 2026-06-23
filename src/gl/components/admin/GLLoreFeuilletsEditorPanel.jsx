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

/**
 * Éditeur du carnet de Sélène : tableau des feuillets (caractéristiques
 * principales) + formulaire d'édition unitaire de toutes les colonnes utiles.
 */
export function GLLoreFeuilletsEditorPanel() {
  const [items, setItems] = useState([]);
  const [biomes, setBiomes] = useState([]);
  const [filterQ, setFilterQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterBiome, setFilterBiome] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [selectedCode, setSelectedCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [warning, setWarning] = useState('');

  const filteredItems = useMemo(
    () =>
      filterFeuilletItems(items, {
        q: filterQ,
        type: filterType,
        biome: filterBiome,
        statut: filterStatut,
      }),
    [items, filterQ, filterType, filterBiome, filterStatut],
  );

  const loadList = useCallback(async () => {
    const data = await apiGL('/api/gl/admin/feuillets');
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
    loadList().catch((err) => setError(err.message || 'Chargement des feuillets impossible'));
  }, [loadList]);

  async function selectFeuillet(code) {
    if (!code) return;
    setLoading(true);
    setError('');
    setInfo('');
    setWarning('');
    try {
      const data = await apiGL(`/api/gl/admin/feuillets/${encodeURIComponent(code)}`);
      setForm(feuilletToForm(data?.feuillet));
      setSelectedCode(code);
    } catch (err) {
      setError(err.message || 'Feuillet introuvable');
    } finally {
      setLoading(false);
    }
  }

  function closeEditor() {
    setSelectedCode(null);
    setForm(EMPTY_FORM);
    setInfo('');
    setWarning('');
    setError('');
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!selectedCode) return;
    setSaving(true);
    setError('');
    setInfo('');
    setWarning('');
    try {
      const data = await apiGL(
        `/api/gl/admin/feuillets/${encodeURIComponent(selectedCode)}`,
        'PUT',
        formToPayload(form),
      );
      if (data?.feuillet) setForm(feuilletToForm(data.feuillet));
      if (data?.warning?.warning) setWarning(data.warning.warning);
      setInfo('Feuillet enregistré.');
      await loadList();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
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
    setError('');
    try {
      const data = await apiGL(
        `/api/gl/admin/feuillets/${encodeURIComponent(selectedCode)}`,
        'PATCH',
        { statut: nextStatut },
      );
      if (data?.feuillet) setForm(feuilletToForm(data.feuillet));
      setInfo(nextStatut === 'actif' ? 'Feuillet réactivé.' : 'Feuillet archivé.');
      await loadList();
    } catch (err) {
      setError(err.message || 'Changement de statut impossible');
    } finally {
      setSaving(false);
    }
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

  const columns = [...FEUILLET_LIST_COLUMNS, { key: 'actions', label: '' }];
  const rows = filteredItems.map((row) => {
    const isActive = (row.statut || 'actif') === 'actif';
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
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-success">{info}</p> : null}
      {warning ? <p className="gl-hint">⚠️ {warning}</p> : null}

      <div className="gl-form gl-form--compact gl-feuillets-filters">
        <GLField label="Recherche">
          <GLInput
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder="Code, titre ou liasse…"
          />
        </GLField>
        <GLField label="Type">
          <GLSelect value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">Tous</option>
            {FEUILLET_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </GLSelect>
        </GLField>
        <GLField label="Biome">
          <GLSelect value={filterBiome} onChange={(e) => setFilterBiome(e.target.value)}>
            <option value="">Tous</option>
            {biomes.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.nom || b.slug}
              </option>
            ))}
          </GLSelect>
        </GLField>
        <GLField label="Statut">
          <GLSelect value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
            <option value="">Tous</option>
            {FEUILLET_STATUT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </GLSelect>
        </GLField>
      </div>

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
