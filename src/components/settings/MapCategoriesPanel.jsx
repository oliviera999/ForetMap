import { useCallback, useState } from 'react';
import {
  SURFACE_OPTIONS,
  SurfaceVisibilityField,
  normalizeSurfaceList,
} from '../../shared/ui/SurfaceVisibilityField.jsx';

import { api } from '../../services/api';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { ColorPaletteField } from '../ColorPaletteField.jsx';
import { ZONE_COLORS } from '../../constants/garden';
import { IconDelete } from '../../shared/icons.jsx';

const APPLIES_TO_LABELS = {
  both: 'Zones et repères',
  zone: 'Zones seules',
  marker: 'Repères seuls',
};

/** « · Plan masqué » etc. : surfaces retirées à la catégorie (aucun texte si les trois). */
function surfaceSummary(cat) {
  if (cat?.surfaces == null) return '';
  const visible = normalizeSurfaceList(cat.surfaces);
  const hidden = SURFACE_OPTIONS.filter((s) => !visible.includes(s.id)).map((s) => s.label);
  return hidden.length ? ` · masquée : ${hidden.join(', ')}` : '';
}

const EMPTY_DRAFT = {
  label: '',
  emoji: '',
  color: ZONE_COLORS[0],
  description: '',
  map_id: '',
  applies_to: 'both',
  surfaces: ['map', 'visit', 'plan'],
  is_infrastructure: false,
  zoom_only: false,
  sort_order: 100,
  is_active: true,
};

function draftFromCategory(category) {
  return {
    label: category.label || '',
    emoji: category.emoji || '',
    color: category.color || EMPTY_DRAFT.color,
    description: category.description || '',
    map_id: category.map_id || '',
    applies_to: category.applies_to || 'both',
    surfaces:
      category.surfaces == null
        ? ['map', 'visit', 'plan']
        : normalizeSurfaceList(category.surfaces),
    is_infrastructure: !!category.is_infrastructure,
    zoom_only: !!category.zoom_only,
    sort_order: Number(category.sort_order) || 0,
    is_active: category.is_active !== false,
  };
}

/**
 * Console de gestion des catégories de zones et repères.
 *
 * Une catégorie est soit globale (toutes les cartes), soit propre à une carte.
 * Cocher « Infrastructure » reprend le comportement de l'ancien drapeau « zone
 * spéciale » : pas de section Biodiversité en visite, lieu non proposé comme cible
 * de mission. Le contour reste tracé en trait continu sur la carte.
 */
export function MapCategoriesPanel({ maps = [], onError, onMessage }) {
  const { confirm } = useAppDialogs();
  const fetcher = useCallback(() => api('/api/map-categories/manage'), []);
  const { data, loading, reload } = useApiResource(fetcher, []);
  const categories = Array.isArray(data) ? data : [];

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId('');
  };

  const payloadFromDraft = () => ({
    label: draft.label.trim(),
    emoji: draft.emoji.trim(),
    color: draft.color,
    description: draft.description.trim(),
    map_id: draft.map_id || null,
    applies_to: draft.applies_to,
    surfaces: draft.surfaces,
    is_infrastructure: draft.is_infrastructure,
    zoom_only: draft.zoom_only,
    sort_order: Number(draft.sort_order) || 0,
    is_active: draft.is_active,
  });

  const submit = async () => {
    if (!draft.label.trim()) {
      onError?.('Libellé requis');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await api(`/api/map-categories/${editingId}`, 'PUT', payloadFromDraft());
        onMessage?.('Catégorie mise à jour');
      } else {
        await api('/api/map-categories', 'POST', payloadFromDraft());
        onMessage?.('Catégorie créée');
      }
      resetDraft();
      reload();
    } catch (e) {
      onError?.(e?.message || 'Échec de l’enregistrement');
    }
    setBusy(false);
  };

  const remove = async (category) => {
    const confirmed = await confirm({
      message: `Supprimer la catégorie « ${category.label} » ? Elle sera retirée de toutes les zones et de tous les repères qui la portent.`,
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api(`/api/map-categories/${category.id}`, 'DELETE');
      onMessage?.('Catégorie supprimée');
      if (editingId === category.id) resetDraft();
      reload();
    } catch (e) {
      onError?.(e?.message || 'Échec de la suppression');
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Catégories de lieux</h3>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-soft)',
          marginBottom: 10,
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Les catégories classent les zones et les repères, et servent de filtre sur la carte. Une
        catégorie sans carte vaut pour toutes les cartes ; sinon elle n’est proposée que sur la
        carte choisie. « Infrastructure » marque les lieux qui ne sont pas des cultures (mare,
        ruches, compostage…) : pas de section Biodiversité, jamais proposés comme cible de mission.
      </p>

      <div className="field">
        <label>Libellé *</label>
        <input
          value={draft.label}
          onChange={(e) => setField({ label: e.target.value })}
          placeholder="Ex : Verger, Compostage, Zone pédagogique"
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label>Emoji</label>
          <input
            value={draft.emoji}
            onChange={(e) => setField({ emoji: e.target.value })}
            placeholder="🌳"
            maxLength={8}
          />
        </div>
        <ColorPaletteField
          id="map-category-color"
          value={draft.color}
          onChange={(next) => setField({ color: next })}
          style={{ flex: 1, minWidth: 0 }}
        />
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label>Ordre</label>
          <input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setField({ sort_order: e.target.value })}
          />
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label>Carte</label>
          <select value={draft.map_id} onChange={(e) => setField({ map_id: e.target.value })}>
            <option value="">Toutes les cartes</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label>S’applique à</label>
          <select
            value={draft.applies_to}
            onChange={(e) => setField({ applies_to: e.target.value })}
          >
            {Object.entries(APPLIES_TO_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Description</label>
        <input
          value={draft.description}
          onChange={(e) => setField({ description: e.target.value })}
          placeholder="Infobulle affichée sur la pastille"
        />
      </div>

      <SurfaceVisibilityField
        mode="visible"
        idPrefix="category"
        legend="Visible sur (décocher retire d’un coup tous les lieux de la catégorie)"
        value={draft.surfaces}
        onChange={(next) => setField({ surfaces: next })}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={draft.is_infrastructure}
          onChange={(e) => setField({ is_infrastructure: e.target.checked })}
          style={{ width: 18, height: 18 }}
        />
        Infrastructure (bâtiment, aménagement — pas une culture)
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={draft.zoom_only}
          onChange={(e) => setField({ zoom_only: e.target.checked })}
          style={{ width: 18, height: 18 }}
        />
        Visible seulement au zoom (désencombre la carte vue en entier)
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setField({ is_active: e.target.checked })}
          style={{ width: 18, height: 18 }}
        />
        Active (une catégorie inactive reste posée mais disparaît des filtres et des formulaires)
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {editingId ? 'Enregistrer' : 'Ajouter'}
        </button>
        {editingId && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={resetDraft}>
            Annuler
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {loading && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>Chargement…</p>
        )}
        {!loading && categories.length === 0 && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            Aucune catégorie pour l’instant.
          </p>
        )}
        {categories.map((cat) => (
          <div
            key={cat.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: cat.color || 'transparent',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>
                {cat.emoji ? `${cat.emoji} ` : ''}
                {cat.label}
              </strong>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
                {cat.map_id
                  ? maps.find((m) => m.id === cat.map_id)?.label || cat.map_id
                  : 'Toutes les cartes'}{' '}
                · {APPLIES_TO_LABELS[cat.applies_to] || cat.applies_to}
                {cat.is_infrastructure ? ' · Infrastructure' : ''}
                {cat.zoom_only ? ' · au zoom' : ''}
                {surfaceSummary(cat)}
                {cat.is_active ? '' : ' · Inactive'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                setEditingId(cat.id);
                setDraft(draftFromCategory(cat));
              }}
            >
              Éditer
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              aria-label="Supprimer la catégorie"
              title="Supprimer la catégorie"
              onClick={() => remove(cat)}
            >
              <IconDelete size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
