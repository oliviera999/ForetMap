import { useCallback, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { useApiResource } from '../../hooks/useApiResource.js';
import {
  applyMapLocationFilters,
  MAP_LOCATION_FILTER_DEFAULTS,
} from '../../utils/mapLocationFilters.js';
import { MAP_MARKER_EMOJI_MAX_CHARS } from '../../constants/emojis.js';

const KIND_OPTIONS = [
  { value: 'both', label: 'Zones et repères' },
  { value: 'zones', label: 'Zones seules' },
  { value: 'markers', label: 'Repères seuls' },
];

/** Brouillon d'édition rapide initialisé depuis la fiche listée. */
function draftFromItem(kind, item) {
  if (kind === 'zone') {
    return { name: item.name || '', description: item.description || '' };
  }
  return { label: item.label || '', emoji: item.emoji || '', note: item.note || '' };
}

/**
 * Console admin « Zones & repères » : inventaire transversal (toutes cartes) des
 * zones et repères, avec la même recherche libre que la carte
 * (`applyMapLocationFilters` : nom, espèces, catégories, textes de visite) et une
 * édition rapide des champs textuels. Le reste (polygone, position, photos,
 * espèces, catégories, contenus de visite) s'édite dans la fiche sur la carte.
 *
 * Les enregistrements passent par les routes existantes (`PUT /api/zones/:id`,
 * `PUT /api/map/markers/:id`, patch partiel) : la visibilité du panneau relève de
 * `admin.settings.read`, mais l'écriture reste gardée côté serveur par
 * `zones.manage` / `map.manage_markers`.
 */
export function MapLocationsAdminPanel({ maps = [], onError, onMessage }) {
  const zonesFetcher = useCallback(() => api('/api/zones'), []);
  const markersFetcher = useCallback(() => api('/api/map/markers'), []);
  const {
    data: zonesData,
    loading: zonesLoading,
    reload: reloadZones,
  } = useApiResource(zonesFetcher, []);
  const {
    data: markersData,
    loading: markersLoading,
    reload: reloadMarkers,
  } = useApiResource(markersFetcher, []);

  const [text, setText] = useState('');
  const [kinds, setKinds] = useState('both');
  const [mapId, setMapId] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const loading = zonesLoading || markersLoading;
  const zones = Array.isArray(zonesData) ? zonesData : [];
  const markers = Array.isArray(markersData) ? markersData : [];

  const mapLabelById = useMemo(() => {
    const out = new Map();
    for (const m of maps) out.set(String(m.id), m.label || m.id);
    return out;
  }, [maps]);

  const { resultItems } = useMemo(
    () =>
      applyMapLocationFilters({
        zones: mapId ? zones.filter((z) => String(z.map_id) === mapId) : zones,
        markers: mapId ? markers.filter((m) => String(m.map_id) === mapId) : markers,
        filters: { ...MAP_LOCATION_FILTER_DEFAULTS, text, kinds },
      }),
    [zones, markers, mapId, text, kinds],
  );

  const zoneCount = resultItems.filter((r) => r.kind === 'zone').length;
  const markerCount = resultItems.length - zoneCount;

  const openEditor = (kind, item) => {
    setEditingKey(`${kind}:${item.id}`);
    setDraft(draftFromItem(kind, item));
  };

  const closeEditor = () => {
    setEditingKey('');
    setDraft(null);
  };

  const setField = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async (kind, item) => {
    if (!draft) return;
    setBusy(true);
    try {
      if (kind === 'zone') {
        const name = String(draft.name || '').trim();
        if (!name) {
          onError?.('Nom requis');
          setBusy(false);
          return;
        }
        // Patch partiel : seuls les champs textuels sont envoyés, le polygone,
        // les espèces et les catégories de la zone restent inchangés.
        await api(`/api/zones/${encodeURIComponent(item.id)}`, 'PUT', {
          name,
          description: String(draft.description || ''),
        });
        onMessage?.('Zone mise à jour');
        reloadZones();
      } else {
        const label = String(draft.label || '').trim();
        if (!label) {
          onError?.('Libellé requis');
          setBusy(false);
          return;
        }
        await api(`/api/map/markers/${encodeURIComponent(item.id)}`, 'PUT', {
          label,
          emoji: String(draft.emoji || '').trim(),
          note: String(draft.note || ''),
        });
        onMessage?.('Repère mis à jour');
        reloadMarkers();
      }
      closeEditor();
    } catch (e) {
      onError?.(e?.message || 'Échec de l’enregistrement');
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
      }}
    >
      <h3 style={{ marginTop: 0 }}>Zones & repères</h3>
      <p style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 10, lineHeight: 1.45 }}>
        Inventaire de toutes les zones et de tous les repères, toutes cartes confondues. La
        recherche couvre le nom, les espèces, les catégories et les textes de visite — comme la
        recherche de la carte. L’édition rapide se limite aux champs textuels ; le tracé, la
        position, les photos, les espèces et les catégories s’éditent dans la fiche, sur la carte.
      </p>

      <div className="row">
        <div className="field" style={{ flex: '2 1 220px', minWidth: 0 }}>
          <label htmlFor="map-locations-search">Recherche</label>
          <input
            id="map-locations-search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex : potager, ruches, pommier…"
          />
        </div>
        <div className="field" style={{ flex: '1 1 150px', minWidth: 0 }}>
          <label htmlFor="map-locations-kinds">Type</label>
          <select id="map-locations-kinds" value={kinds} onChange={(e) => setKinds(e.target.value)}>
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 150px', minWidth: 0 }}>
          <label htmlFor="map-locations-map">Carte</label>
          <select id="map-locations-map" value={mapId} onChange={(e) => setMapId(e.target.value)}>
            <option value="">Toutes les cartes</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ fontSize: '.82rem', color: '#6b7280', margin: '4px 0 8px' }}>
        {loading
          ? 'Chargement des zones et repères…'
          : `${zoneCount} zone(s) · ${markerCount} repère(s)`}
      </div>

      {!loading && resultItems.length === 0 && (
        <p style={{ fontSize: '.82rem', color: '#6b7280' }}>
          Aucune zone ni repère ne correspond aux filtres.
        </p>
      )}

      {resultItems.map(({ kind, id, title, emoji, subtitle, item }) => {
        const key = `${kind}:${id}`;
        const isEditing = editingKey === key;
        const speciesCount = Array.isArray(item.species) ? item.species.length : 0;
        return (
          <div key={key} style={{ padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden="true" style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                {emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{title}</strong>
                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                  {kind === 'zone' ? 'Zone' : 'Repère'} ·{' '}
                  {mapLabelById.get(String(item.map_id)) || item.map_id}
                  {subtitle ? ` · ${subtitle}` : ''}
                  {speciesCount > 0 ? ` · ${speciesCount} espèce(s)` : ''}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => (isEditing ? closeEditor() : openEditor(kind, item))}
              >
                {isEditing ? 'Fermer' : 'Modifier'}
              </button>
            </div>
            {isEditing && draft && (
              <div style={{ marginTop: 8, paddingLeft: 4 }}>
                {kind === 'zone' ? (
                  <>
                    <div className="field">
                      <label htmlFor={`map-locations-edit-name-${id}`}>Nom *</label>
                      <input
                        id={`map-locations-edit-name-${id}`}
                        value={draft.name}
                        onChange={(e) => setField({ name: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`map-locations-edit-description-${id}`}>Description</label>
                      <textarea
                        id={`map-locations-edit-description-${id}`}
                        rows={3}
                        value={draft.description}
                        onChange={(e) => setField({ description: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="row">
                      <div className="field" style={{ flex: '2 1 180px', minWidth: 0 }}>
                        <label htmlFor={`map-locations-edit-label-${id}`}>Libellé *</label>
                        <input
                          id={`map-locations-edit-label-${id}`}
                          value={draft.label}
                          onChange={(e) => setField({ label: e.target.value })}
                        />
                      </div>
                      <div className="field" style={{ flex: '1 1 90px', minWidth: 0 }}>
                        <label htmlFor={`map-locations-edit-emoji-${id}`}>Emoji</label>
                        <input
                          id={`map-locations-edit-emoji-${id}`}
                          value={draft.emoji}
                          maxLength={MAP_MARKER_EMOJI_MAX_CHARS}
                          onChange={(e) => setField({ emoji: e.target.value })}
                          placeholder="📍"
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={`map-locations-edit-note-${id}`}>Note</label>
                      <textarea
                        id={`map-locations-edit-note-${id}`}
                        rows={3}
                        value={draft.note}
                        onChange={(e) => setField({ note: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => save(kind, item)}
                  >
                    {busy ? '…' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={closeEditor}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
