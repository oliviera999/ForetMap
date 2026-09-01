import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../services/api';
import {
  applyMapLocationFilters,
  MAP_LOCATION_FILTER_DEFAULTS,
} from '../../utils/mapLocationFilters.js';
import {
  MAP_MARKER_EMOJI_MAX_CHARS,
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
} from '../../constants/emojis.js';
import {
  BULK_ACTIONS,
  bulkPatchForItem,
  categoryOptionsForLocation,
  countBulkTargets,
  locationLivingBeings,
  zoneNameEmojiPatch,
  zoneParts,
} from '../../utils/adminLocationsGrid.js';
import { locationCategoryIds } from '../../utils/locationCategories.js';

const KIND_OPTIONS = [
  { value: 'both', label: 'Zones et repères' },
  { value: 'zones', label: 'Zones seules' },
  { value: 'markers', label: 'Repères seuls' },
];

const CARD_STYLE = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
};

const HINT_STYLE = { fontSize: '.78rem', color: '#6b7280' };

/**
 * Champ à édition directe : la valeur serveur arrive en prop, la frappe reste
 * locale, et l'enregistrement part **à la sortie du champ** (blur ; Entrée valide,
 * Échap annule). Le site d'appel change la `key` quand la valeur serveur change,
 * ce qui resynchronise le champ après normalisation côté serveur.
 */
function InlineField({
  value,
  onSave,
  ariaLabel,
  placeholder,
  textarea = false,
  rows = 1,
  type = 'text',
  maxLength,
  min,
  max,
  disabled = false,
  style,
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const commit = () => {
    if (draft !== (value == null ? '' : String(value))) onSave(draft);
  };
  const onKeyDown = (e) => {
    if (!textarea && e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') setDraft(value == null ? '' : String(value));
  };
  const shared = {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
    'aria-label': ariaLabel,
    placeholder,
    disabled,
    style,
  };
  if (textarea) return <textarea rows={rows} {...shared} />;
  return <input type={type} maxLength={maxLength} min={min} max={max} {...shared} />;
}

/** Chips d'espèces + champ d'ajout (suggestions du catalogue biodiversité). */
function RowSpeciesEditor({ rowKey, names, onSave, disabled }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const name = draft.trim();
    setDraft('');
    if (!name || names.includes(name)) return;
    onSave([...names, name]);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {names.map((name) => (
        <span key={name} className="admin-locations-chip">
          {name}
          <button
            type="button"
            aria-label={`Retirer l’espèce ${name}`}
            disabled={disabled}
            onClick={() => onSave(names.filter((n) => n !== name))}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        list="admin-locations-plants-list"
        value={draft}
        aria-label={`Ajouter une espèce (${rowKey})`}
        placeholder="+ espèce"
        disabled={disabled}
        style={{ width: 110 }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

/** Pastilles de catégories cliquables (état pressé = catégorie posée sur le lieu). */
function RowCategoriesEditor({ kind, item, catalog, onSave, disabled }) {
  const options = categoryOptionsForLocation(kind, item.map_id, catalog);
  if (options.length === 0) return <span style={HINT_STYLE}>Aucune catégorie disponible</span>;
  const current = new Set(locationCategoryIds(item));
  const toggle = (id) => {
    const next = current.has(id) ? [...current].filter((c) => c !== id) : [...current, id];
    onSave(next.map(String));
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map((cat) => {
        const id = String(cat.id);
        const active = current.has(id);
        return (
          <button
            key={id}
            type="button"
            className={`admin-locations-cat ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            title={cat.description || cat.label}
            onClick={() => toggle(id)}
          >
            {cat.emoji ? `${cat.emoji} ` : ''}
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Console admin « Zones & repères » : inventaire transversal (toutes cartes) à
 * **édition directe** — chaque champ visible est un champ de saisie qui enregistre
 * à la sortie du champ, sans bouton « Modifier » — plus des **actions par lot**
 * (catégories, espèces, carte, emoji, rechercher/remplacer, suppression) sur la
 * sélection.
 *
 * Les enregistrements passent par les routes existantes (`PUT`/`DELETE` par lieu,
 * patch partiel) : la visibilité du panneau relève de `admin.settings.read`,
 * l'écriture reste gardée côté serveur par `zones.manage` / `map.manage_markers`.
 */
export function MapLocationsAdminPanel({ maps = [], onError, onMessage }) {
  const [zones, setZones] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [plants, setPlants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [kinds, setKinds] = useState('both');
  const [mapId, setMapId] = useState('');

  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [bulk, setBulk] = useState({
    action: 'add_category',
    categoryId: '',
    speciesName: '',
    mapId: '',
    emoji: '',
    find: '',
    replace: '',
    includeText: false,
  });
  const [bulkRun, setBulkRun] = useState(null);

  // Garde anti-course du chargement initial (démontage pendant les fetchs).
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      try {
        const [zonesData, markersData, plantsData, categoriesData] = await Promise.all([
          api('/api/zones'),
          api('/api/map/markers'),
          api('/api/plants'),
          api('/api/map-categories'),
        ]);
        if (!aliveRef.current) return;
        setZones(Array.isArray(zonesData) ? zonesData : []);
        setMarkers(Array.isArray(markersData) ? markersData : []);
        setPlants(Array.isArray(plantsData) ? plantsData : []);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      } catch (e) {
        if (aliveRef.current) onError?.(e?.message || 'Impossible de charger les lieux');
      }
      if (aliveRef.current) setLoading(false);
    })();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const applyUpdated = (kind, updated) => {
    if (!updated?.id) return;
    const setList = kind === 'zone' ? setZones : setMarkers;
    setList((prev) => prev.map((it) => (String(it.id) === String(updated.id) ? updated : it)));
  };

  const removeLocal = (kind, id) => {
    const setList = kind === 'zone' ? setZones : setMarkers;
    setList((prev) => prev.filter((it) => String(it.id) !== String(id)));
  };

  const itemUrl = (kind, id) =>
    kind === 'zone'
      ? `/api/zones/${encodeURIComponent(id)}`
      : `/api/map/markers/${encodeURIComponent(id)}`;

  const saveItem = async (kind, item, patch, okMsg) => {
    try {
      const updated = await api(itemUrl(kind, item.id), 'PUT', patch);
      applyUpdated(kind, updated);
      onMessage?.(okMsg);
      return true;
    } catch (e) {
      onError?.(e?.message || 'Échec de l’enregistrement');
      return false;
    }
  };

  const saveZoneName = (item, cleanName, emoji) => {
    // Convention `buildZonePayload` : nom avec préfixe emoji + colonne `emoji` explicite.
    const patch = zoneNameEmojiPatch(cleanName, emoji);
    if (!patch) {
      onError?.('Nom requis');
      return;
    }
    saveItem('zone', item, patch, 'Zone mise à jour');
  };

  const toggleKey = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleKeys = resultItems.map((r) => `${r.kind}:${r.id}`);
  const allVisibleSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));
  const toggleAllVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const key of visibleKeys) next.delete(key);
      else for (const key of visibleKeys) next.add(key);
      return next;
    });
  };

  const selectedTargets = resultItems
    .filter((r) => selectedKeys.has(`${r.kind}:${r.id}`))
    .map((r) => ({ kind: r.kind, item: r.item, title: r.title }));

  const bulkParams = {
    categoryId: bulk.categoryId,
    catalog: categories,
    speciesName: bulk.speciesName,
    mapId: bulk.mapId,
    emoji: bulk.emoji,
    find: bulk.find,
    replace: bulk.replace,
    includeText: bulk.includeText,
  };
  const bulkTargetCount = countBulkTargets(bulk.action, bulkParams, selectedTargets);

  const runBulk = async () => {
    const targets = selectedTargets;
    if (targets.length === 0) return;
    if (bulk.action === 'delete') {
      const confirmed = confirm(
        `Supprimer définitivement ${targets.length} lieu(x) sélectionné(s) ? ` +
          'Leurs photos et contenus de visite seront supprimés aussi. Action irréversible.',
      );
      if (!confirmed) return;
    }
    setBulkRun({ done: 0, total: targets.length });
    let okCount = 0;
    let skippedCount = 0;
    const failures = [];
    for (const target of targets) {
      const effect = bulkPatchForItem(bulk.action, bulkParams, target);
      if (effect.skip) {
        skippedCount += 1;
      } else if (effect.del) {
        try {
          await api(itemUrl(target.kind, target.item.id), 'DELETE');
          removeLocal(target.kind, target.item.id);
          setSelectedKeys((prev) => {
            const next = new Set(prev);
            next.delete(`${target.kind}:${target.item.id}`);
            return next;
          });
          okCount += 1;
        } catch (e) {
          failures.push(`${target.title} : ${e?.message || 'échec'}`);
        }
      } else {
        try {
          const updated = await api(itemUrl(target.kind, target.item.id), 'PUT', effect.patch);
          applyUpdated(target.kind, updated);
          okCount += 1;
        } catch (e) {
          failures.push(`${target.title} : ${e?.message || 'échec'}`);
        }
      }
      setBulkRun((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    setBulkRun(null);
    const verb = bulk.action === 'delete' ? 'supprimé(s)' : 'mis à jour';
    const parts = [`${okCount} lieu(x) ${verb}`];
    if (skippedCount > 0) parts.push(`${skippedCount} déjà conforme(s) ou non concerné(s)`);
    onMessage?.(parts.join(' · '));
    if (failures.length > 0) onError?.(`${failures.length} échec(s) — ${failures.join(' ; ')}`);
  };

  const busy = bulkRun != null;

  const renderBulkParams = () => {
    switch (bulk.action) {
      case 'add_category':
      case 'remove_category':
        return (
          <select
            aria-label="Catégorie du lot"
            value={bulk.categoryId}
            onChange={(e) => setBulk((b) => ({ ...b, categoryId: e.target.value }))}
          >
            <option value="">Choisir une catégorie…</option>
            {categories
              .filter((cat) => cat.is_active !== false)
              .map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji ? `${cat.emoji} ` : ''}
                  {cat.label}
                  {cat.map_id ? ` (${mapLabelById.get(String(cat.map_id)) || cat.map_id})` : ''}
                </option>
              ))}
          </select>
        );
      case 'add_species':
      case 'remove_species':
        return (
          <input
            list="admin-locations-plants-list"
            aria-label="Espèce du lot"
            placeholder="Nom de l’espèce"
            value={bulk.speciesName}
            onChange={(e) => setBulk((b) => ({ ...b, speciesName: e.target.value }))}
          />
        );
      case 'set_map':
        return (
          <select
            aria-label="Carte cible du lot"
            value={bulk.mapId}
            onChange={(e) => setBulk((b) => ({ ...b, mapId: e.target.value }))}
          >
            <option value="">Choisir une carte…</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        );
      case 'set_emoji':
        return (
          <input
            aria-label="Emoji du lot"
            placeholder="📍"
            maxLength={MAP_MARKER_EMOJI_MAX_CHARS}
            style={{ width: 90 }}
            value={bulk.emoji}
            onChange={(e) => setBulk((b) => ({ ...b, emoji: e.target.value }))}
          />
        );
      case 'find_replace':
        return (
          <>
            <input
              aria-label="Texte à rechercher"
              placeholder="Rechercher…"
              value={bulk.find}
              onChange={(e) => setBulk((b) => ({ ...b, find: e.target.value }))}
            />
            <input
              aria-label="Texte de remplacement"
              placeholder="Remplacer par…"
              value={bulk.replace}
              onChange={(e) => setBulk((b) => ({ ...b, replace: e.target.value }))}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
              <input
                type="checkbox"
                checked={bulk.includeText}
                onChange={(e) => setBulk((b) => ({ ...b, includeText: e.target.checked }))}
              />
              Aussi dans description / note
            </label>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={CARD_STYLE}>
      <h3 style={{ marginTop: 0 }}>Zones & repères</h3>
      <p style={{ ...HINT_STYLE, fontSize: '.82rem', marginBottom: 10, lineHeight: 1.45 }}>
        Inventaire de toutes les zones et de tous les repères, toutes cartes confondues. Chaque
        champ s’édite <strong>directement</strong> et s’enregistre à la sortie du champ (Entrée
        valide, Échap annule). Cochez plusieurs lieux pour les <strong>actions par lot</strong>. Le
        tracé des zones, la position fine des repères et les photos s’éditent sur la carte.
      </p>

      <datalist id="admin-locations-plants-list">
        {plants.map((p) => (
          <option key={p.id} value={p.name}>
            {p.emoji ? `${p.emoji} ${p.name}` : p.name}
          </option>
        ))}
      </datalist>

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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          margin: '4px 0 8px',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            disabled={visibleKeys.length === 0 || busy}
            onChange={toggleAllVisible}
          />
          Tout sélectionner ({visibleKeys.length})
        </label>
        <span style={HINT_STYLE}>
          {loading
            ? 'Chargement des zones et repères…'
            : `${zoneCount} zone(s) · ${markerCount} repère(s)`}
        </span>
      </div>

      {selectedKeys.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: 8,
            border: '1px solid #d1d5db',
            borderRadius: 10,
            background: '#f8fafc',
            marginBottom: 8,
          }}
        >
          <strong style={{ fontSize: '.85rem' }}>{selectedKeys.size} sélectionné(s)</strong>
          <select
            aria-label="Action par lot"
            value={bulk.action}
            onChange={(e) => setBulk((b) => ({ ...b, action: e.target.value }))}
          >
            {BULK_ACTIONS.map((action) => (
              <option key={action.id} value={action.id}>
                {action.label}
              </option>
            ))}
          </select>
          {renderBulkParams()}
          <button
            type="button"
            className={`btn btn-sm ${bulk.action === 'delete' ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy || bulkTargetCount === 0}
            onClick={runBulk}
          >
            {bulkRun
              ? `${bulkRun.done}/${bulkRun.total}…`
              : `Appliquer (${bulkTargetCount} concerné(s))`}
          </button>
        </div>
      )}

      {!loading && resultItems.length === 0 && (
        <p style={{ ...HINT_STYLE, fontSize: '.82rem' }}>
          Aucune zone ni repère ne correspond aux filtres.
        </p>
      )}

      {resultItems.map(({ kind, id, title, item }) => {
        const key = `${kind}:${id}`;
        const isZone = kind === 'zone';
        const expanded = expandedKeys.has(key);
        const zParts = isZone ? zoneParts(item) : null;
        const names = locationLivingBeings(item);
        return (
          <div key={key} style={{ padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                aria-label={`Sélectionner ${title}`}
                checked={selectedKeys.has(key)}
                disabled={busy}
                onChange={() => toggleKey(key)}
              />
              <InlineField
                key={`${key}-emoji-${isZone ? `${item.emoji || ''}-${item.name}` : item.emoji || ''}`}
                value={isZone ? zParts.emoji : item.emoji || ''}
                ariaLabel={`Emoji de ${title}`}
                placeholder="📍"
                maxLength={isZone ? ZONE_NAME_PREFIX_EMOJI_MAX_CHARS : MAP_MARKER_EMOJI_MAX_CHARS}
                disabled={busy}
                style={{ width: 58 }}
                onSave={(next) => {
                  if (isZone) saveZoneName(item, zParts.cleanName, next);
                  else saveItem('marker', item, { emoji: next.trim() }, 'Repère mis à jour');
                }}
              />
              <InlineField
                key={`${key}-name-${isZone ? item.name : item.label}`}
                value={isZone ? zParts.cleanName : item.label || ''}
                ariaLabel={`Nom de ${title}`}
                placeholder="Nom *"
                disabled={busy}
                style={{ flex: '2 1 160px', minWidth: 120, fontWeight: 600 }}
                onSave={(next) => {
                  if (isZone) saveZoneName(item, next, zParts.emoji);
                  else if (!next.trim()) onError?.('Nom requis');
                  else saveItem('marker', item, { label: next.trim() }, 'Repère mis à jour');
                }}
              />
              <select
                aria-label={`Carte de ${title}`}
                value={String(item.map_id || '')}
                disabled={busy}
                onChange={(e) =>
                  saveItem(
                    kind,
                    item,
                    { map_id: e.target.value },
                    isZone ? 'Zone mise à jour' : 'Repère mis à jour',
                  )
                }
              >
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!mapLabelById.has(String(item.map_id || '')) && (
                  <option value={String(item.map_id || '')}>{String(item.map_id || '')}</option>
                )}
              </select>
              <span style={HINT_STYLE}>{isZone ? 'Zone' : 'Repère'}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={expanded}
                onClick={() =>
                  setExpandedKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              >
                {expanded ? '▾ Visite & détails' : '▸ Visite & détails'}
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                marginTop: 6,
                paddingLeft: 26,
              }}
            >
              <InlineField
                key={`${key}-desc-${isZone ? item.description || '' : item.note || ''}`}
                value={isZone ? item.description || '' : item.note || ''}
                ariaLabel={`Description de ${title}`}
                placeholder={isZone ? 'Description…' : 'Note…'}
                textarea
                rows={1}
                disabled={busy}
                style={{ flex: '2 1 220px', minWidth: 160 }}
                onSave={(next) =>
                  saveItem(
                    kind,
                    item,
                    isZone ? { description: next } : { note: next },
                    isZone ? 'Zone mise à jour' : 'Repère mis à jour',
                  )
                }
              />
              <RowSpeciesEditor
                rowKey={title}
                names={names}
                disabled={busy}
                onSave={(list) =>
                  saveItem(kind, item, { living_beings: list }, 'Espèces mises à jour')
                }
              />
              <RowCategoriesEditor
                kind={kind}
                item={item}
                catalog={categories}
                disabled={busy}
                onSave={(ids) =>
                  saveItem(kind, item, { category_ids: ids }, 'Catégories mises à jour')
                }
              />
            </div>

            {expanded && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 6,
                  paddingLeft: 26,
                }}
              >
                <InlineField
                  key={`${key}-vsub-${item.visit_subtitle || ''}`}
                  value={item.visit_subtitle || ''}
                  ariaLabel={`Sous-titre visite de ${title}`}
                  placeholder="Sous-titre (visite)"
                  disabled={busy}
                  style={{ flex: '1 1 160px' }}
                  onSave={(next) =>
                    saveItem(kind, item, { visit_subtitle: next }, 'Texte visite mis à jour')
                  }
                />
                <InlineField
                  key={`${key}-vshort-${item.visit_short_description || ''}`}
                  value={item.visit_short_description || ''}
                  ariaLabel={`Accroche visite de ${title}`}
                  placeholder="Accroche (visite)"
                  textarea
                  rows={1}
                  disabled={busy}
                  style={{ flex: '2 1 200px' }}
                  onSave={(next) =>
                    saveItem(
                      kind,
                      item,
                      { visit_short_description: next },
                      'Texte visite mis à jour',
                    )
                  }
                />
                <InlineField
                  key={`${key}-vtitle-${item.visit_details_title || ''}`}
                  value={item.visit_details_title || ''}
                  ariaLabel={`Titre du bloc dépliable de ${title}`}
                  placeholder="Titre du bloc dépliable"
                  disabled={busy}
                  style={{ flex: '1 1 140px' }}
                  onSave={(next) =>
                    saveItem(kind, item, { visit_details_title: next }, 'Texte visite mis à jour')
                  }
                />
                <InlineField
                  key={`${key}-vtext-${item.visit_details_text || ''}`}
                  value={item.visit_details_text || ''}
                  ariaLabel={`Détails dépliables de ${title}`}
                  placeholder="Détails dépliables (visite)"
                  textarea
                  rows={2}
                  disabled={busy}
                  style={{ flex: '2 1 220px' }}
                  onSave={(next) =>
                    saveItem(kind, item, { visit_details_text: next }, 'Texte visite mis à jour')
                  }
                />
                {isZone ? (
                  <InlineField
                    key={`${key}-color-${item.color || ''}`}
                    value={item.color || ''}
                    ariaLabel={`Couleur de ${title}`}
                    placeholder="#86efac90"
                    disabled={busy}
                    style={{ width: 110 }}
                    onSave={(next) => saveItem('zone', item, { color: next }, 'Zone mise à jour')}
                  />
                ) : (
                  <>
                    <InlineField
                      key={`${key}-x-${item.x_pct}`}
                      value={item.x_pct ?? ''}
                      ariaLabel={`Position X de ${title}`}
                      type="number"
                      min={0}
                      max={100}
                      disabled={busy}
                      style={{ width: 80 }}
                      onSave={(next) => {
                        const n = Number(next);
                        if (!Number.isFinite(n) || n < 0 || n > 100) {
                          onError?.('X % doit être entre 0 et 100');
                          return;
                        }
                        saveItem('marker', item, { x_pct: n }, 'Repère mis à jour');
                      }}
                    />
                    <InlineField
                      key={`${key}-y-${item.y_pct}`}
                      value={item.y_pct ?? ''}
                      ariaLabel={`Position Y de ${title}`}
                      type="number"
                      min={0}
                      max={100}
                      disabled={busy}
                      style={{ width: 80 }}
                      onSave={(next) => {
                        const n = Number(next);
                        if (!Number.isFinite(n) || n < 0 || n > 100) {
                          onError?.('Y % doit être entre 0 et 100');
                          return;
                        }
                        saveItem('marker', item, { y_pct: n }, 'Repère mis à jour');
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
