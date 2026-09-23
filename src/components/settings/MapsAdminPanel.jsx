import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { compressImageWithPreset } from '../../shared/platform/image';
import { MediaLibraryMenu } from '../MediaLibraryMenu.jsx';
import { AdminTextSettingField, AdminNumberSettingField } from './AdminSettingFields.jsx';
import { MapGeorefPanel } from './MapGeorefPanel.jsx';
import { CategoryIdsMultiSelect } from './CategoryIdsMultiSelect.jsx';
import { IconCamera, IconGallery } from '../../shared/icons.jsx';

const DEFAULT_CATEGORY_IDS_KEY = 'ui.map.default_category_ids';

/**
 * Panneau admin « Cartes & plans » : réglages d’affichage, création de cartes,
 * liste éditable (libellé, ordre, image, bibliothèque, calage GPS).
 *
 * @param {object} props
 * @param {Array<object>} [props.maps]
 * @param {(key: string, fallback?: unknown) => unknown} props.get
 * @param {(key: string, value: unknown, okMsg?: string) => Promise<void>} props.saveSetting
 * @param {string} [props.savingKey]
 * @param {boolean} [props.canWrite] — désactive tous les contrôles d’édition si faux
 * @param {(msg: string) => void} [props.onMessage]
 * @param {(msg: string) => void} [props.onError]
 * @param {() => void|Promise<void>} [props.onMapsChanged] — recharger la liste côté parent
 */
export function MapsAdminPanel({
  maps = [],
  get,
  saveSetting,
  savingKey = '',
  canWrite = true,
  onMessage = null,
  onError = null,
  onMapsChanged = null,
}) {
  const mapGalleryFileRefs = useRef({});
  const mapCameraFileRefs = useRef({});
  const [newMapId, setNewMapId] = useState('');
  const [newMapLabel, setNewMapLabel] = useState('');
  const [newMapSort, setNewMapSort] = useState('3');
  const [mapSavingKey, setMapSavingKey] = useState('');
  // Copie locale pour upserts optimistes sans recharger toute la console admin.
  const [localMaps, setLocalMaps] = useState(() => (Array.isArray(maps) ? maps : []));

  useEffect(() => {
    setLocalMaps(Array.isArray(maps) ? maps : []);
  }, [maps]);

  const busyKey = mapSavingKey || savingKey;
  const readOnly = !canWrite;

  const upsertMapLocally = (updated) => {
    setLocalMaps((prev) =>
      prev
        .map((m) => (m.id === updated.id ? updated : m))
        .sort(
          (a, b) =>
            (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
            String(a.label || '').localeCompare(String(b.label || ''), 'fr'),
        ),
    );
  };

  const saveMap = async (mapId, patch, okMsg = 'Carte mise à jour') => {
    if (readOnly) return;
    setMapSavingKey(`map:${mapId}`);
    try {
      // PUT /api/settings/admin/maps/:id renvoie la carte normalisée complète.
      const updated = await api(
        `/api/settings/admin/maps/${encodeURIComponent(mapId)}`,
        'PUT',
        patch,
      );
      if (updated?.id) upsertMapLocally(updated);
      else await onMapsChanged?.();
      onMessage?.(okMsg);
    } catch (e) {
      await onMapsChanged?.();
      onError?.(e.message || 'Échec mise à jour carte');
    }
    setMapSavingKey('');
  };

  const uploadMapImage = async (mapId, file) => {
    if (readOnly || !file) return;
    setMapSavingKey(`map-image:${mapId}`);
    try {
      const dataUrl = await compressImageWithPreset(file, 'adminProfile');
      // POST .../image renvoie aussi la carte normalisée complète.
      const updated = await api(
        `/api/settings/admin/maps/${encodeURIComponent(mapId)}/image`,
        'POST',
        {
          image_data: dataUrl,
        },
      );
      if (updated?.id) upsertMapLocally(updated);
      else await onMapsChanged?.();
      onMessage?.('Image de plan mise à jour');
    } catch (e) {
      await onMapsChanged?.();
      onError?.(e.message || 'Échec upload image');
    }
    setMapSavingKey('');
  };

  const createMap = async () => {
    if (readOnly) return;
    const id = String(newMapId || '')
      .trim()
      .toLowerCase();
    const label = String(newMapLabel || '').trim();
    if (!id || !label) {
      onError?.('Identifiant et libellé sont requis pour créer une carte');
      return;
    }
    setMapSavingKey('map:create');
    try {
      const sortOrder = parseInt(newMapSort, 10);
      await api('/api/settings/admin/maps', 'POST', {
        id,
        label,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 99,
        map_image_url: '/map.png',
        is_active: true,
      });
      setNewMapId('');
      setNewMapLabel('');
      setNewMapSort(String(Math.max(3, (localMaps?.length || 2) + 1)));
      await onMapsChanged?.();
      onMessage?.('Carte créée — configure l’URL ou l’image ci-dessous si besoin.');
    } catch (e) {
      onError?.(e.message || 'Échec création carte');
    }
    setMapSavingKey('');
  };

  const fetchMediaLibrary = async () => {
    const data = await api('/api/settings/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  };

  const uploadMediaLibrary = async (mediaData, options = {}) => {
    await api('/api/settings/admin/media-library', 'POST', {
      media_data: mediaData,
      original_name: options.originalName || null,
    });
    onMessage?.('Média ajouté à la bibliothèque');
  };

  const deleteMediaLibrary = async (relativePath) => {
    await api('/api/settings/admin/media-library', 'DELETE', { relative_path: relativePath });
    onMessage?.('Média supprimé de la bibliothèque');
  };

  return (
    <div className="maps-admin-panel" data-testid="maps-admin-panel">
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-soft)',
          marginBottom: 10,
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Nouveau plan : identifiant technique stable (ex. <code>potager</code>), libellé affiché dans
        l’app, puis image (URL ou upload). Chaque compte voit les cartes actives de son périmètre :
        celui de ses groupes, ou toutes les cartes sans périmètre de groupe.
      </p>

      <CategoryIdsMultiSelect
        label="Catégories de lieux affichées par défaut sur la carte"
        hint="Cochez les catégories visibles d’office sur la carte de travail (modifiable ensuite par l’élève)."
        value={String(get(DEFAULT_CATEGORY_IDS_KEY, '') || '')}
        disabled={readOnly || busyKey === DEFAULT_CATEGORY_IDS_KEY}
        testId="map-default-category-ids"
        onSave={(next) =>
          saveSetting(
            DEFAULT_CATEGORY_IDS_KEY,
            next,
            'Catégories par défaut de la carte enregistrées',
          )
        }
      />

      <label
        className="field"
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}
        data-testid="map-heading-up-setting"
      >
        <input
          type="checkbox"
          checked={Boolean(get('ui.map.heading_up_enabled', false))}
          disabled={readOnly || busyKey === 'ui.map.heading_up_enabled'}
          onChange={(e) =>
            saveSetting(
              'ui.map.heading_up_enabled',
              e.target.checked,
              e.target.checked
                ? 'Orientation boussole autorisée sur la carte'
                : 'Orientation boussole désactivée sur la carte',
            )
          }
        />
        <span>
          Autoriser « Orienter » sur la carte de travail (chaque carte doit aussi l’autoriser dans
          son calage GPS).
        </span>
      </label>
      <label
        className="field"
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}
        data-testid="map-show-tutorial-dots-setting"
      >
        <input
          type="checkbox"
          checked={Boolean(get('ui.map.show_tutorial_dots', false))}
          disabled={readOnly || busyKey === 'ui.map.show_tutorial_dots'}
          onChange={(e) =>
            saveSetting(
              'ui.map.show_tutorial_dots',
              e.target.checked,
              e.target.checked
                ? 'Pastilles tutoriel visibles sur la carte'
                : 'Pastilles tutoriel masquées sur la carte',
            )
          }
        />
        <span>
          Afficher le point violet sur les zones et repères liés à un tutoriel (désactivé par défaut
          : le point reste invisible).
        </span>
      </label>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div className="field" style={{ margin: 0, flex: '1 1 120px' }}>
          <label>Identifiant (slug)</label>
          <input
            value={newMapId}
            onChange={(e) => setNewMapId(e.target.value)}
            placeholder="ex. potager"
            autoComplete="off"
            disabled={readOnly}
          />
        </div>
        <div className="field" style={{ margin: 0, flex: '1 1 180px' }}>
          <label>Libellé</label>
          <input
            value={newMapLabel}
            onChange={(e) => setNewMapLabel(e.target.value)}
            placeholder="ex. Potager pédagogique"
            autoComplete="off"
            disabled={readOnly}
          />
        </div>
        <div className="field" style={{ margin: 0, width: 96 }}>
          <label>Ordre</label>
          <input
            type="number"
            min={0}
            value={newMapSort}
            onChange={(e) => setNewMapSort(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={createMap}
          disabled={readOnly || mapSavingKey === 'map:create'}
        >
          {mapSavingKey === 'map:create' ? '…' : '+ Ajouter la carte'}
        </button>
      </div>
      <div className="settings-admin-maps-list">
        {localMaps.map((m) => (
          <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
            <div className="settings-admin-map-row">
              <div>
                <div style={{ fontWeight: 'var(--fw-bold)' }}>{m.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{m.id}</div>
              </div>
              {/* Champs pilotés (resynchronisés si le serveur normalise la valeur). */}
              <AdminTextSettingField
                rowKey={`map:${m.id}:label`}
                label="Libellé"
                row={{ type: 'string', scope: 'admin' }}
                serverValue={m.label || ''}
                disabled={readOnly || mapSavingKey === `map:${m.id}`}
                onSave={(_key, next) => {
                  const label = String(next || '').trim();
                  if (label) saveMap(m.id, { label });
                }}
              />
              <AdminNumberSettingField
                rowKey={`map:${m.id}:sort_order`}
                label="Ordre"
                row={{ type: 'number', scope: 'admin' }}
                serverValue={m.sort_order ?? 0}
                disabled={readOnly || mapSavingKey === `map:${m.id}`}
                fallback={0}
                onSave={(_key, next) => saveMap(m.id, { sort_order: next })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={!!m.is_active}
                  disabled={readOnly}
                  onChange={(e) => saveMap(m.id, { is_active: e.target.checked })}
                />{' '}
                Active
              </label>
              <label className="field" style={{ minWidth: 160 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', marginBottom: 2 }}>
                  Niveau pédagogique
                </span>
                <select
                  value={m.pedago_level || ''}
                  disabled={readOnly || mapSavingKey === `map:${m.id}`}
                  onChange={(e) =>
                    saveMap(
                      m.id,
                      { pedago_level: e.target.value || null },
                      'Niveau pédagogique enregistré',
                    )
                  }
                  data-testid={`map-pedago-level-${m.id}`}
                >
                  <option value="">— Hériter (défaut site) —</option>
                  <option value="college">Collège</option>
                  <option value="lycee">Lycée</option>
                  <option value="universite">Université</option>
                </select>
              </label>
            </div>
            <div style={{ marginTop: 8 }}>
              <AdminTextSettingField
                rowKey={`map:${m.id}:map_image_url`}
                label="URL image du plan"
                row={{ type: 'string', scope: 'admin' }}
                serverValue={m.map_image_url || ''}
                disabled={readOnly || mapSavingKey === `map:${m.id}`}
                onSave={(_key, next) => saveMap(m.id, { map_image_url: next || '' })}
              />
            </div>
            {!readOnly ? (
              <MediaLibraryMenu
                title="Bibliothèque globale (images, audio, vidéo)"
                fetchItems={fetchMediaLibrary}
                uploadDataUrl={uploadMediaLibrary}
                removeItem={deleteMediaLibrary}
                onPickUrl={(url) =>
                  saveMap(
                    m.id,
                    { map_image_url: url },
                    'URL de carte définie depuis la bibliothèque',
                  )
                }
              />
            ) : null}
            <div className="settings-admin-map-tools">
              <div className="field">
                <label>Padding cadre (0-32 px)</label>
                {/* Champ non piloté (vide = null « hérite ») : la clé force le remontage
                    quand le serveur renvoie une valeur normalisée, comme le faisait
                    l'ancien rechargement complet. */}
                <input
                  key={`frame-padding-${m.id}-${m.frame_padding_px ?? ''}`}
                  type="number"
                  min={0}
                  max={32}
                  defaultValue={m.frame_padding_px ?? ''}
                  disabled={readOnly}
                  onBlur={(e) => {
                    if (readOnly) return;
                    saveMap(m.id, {
                      frame_padding_px:
                        e.target.value === '' ? null : parseInt(e.target.value || '0', 10),
                    });
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const el = mapGalleryFileRefs.current[m.id];
                    if (el) el.value = '';
                    el?.click();
                  }}
                  disabled={readOnly || mapSavingKey === `map-image:${m.id}`}
                >
                  {mapSavingKey === `map-image:${m.id}` ? (
                    'Envoi…'
                  ) : (
                    <>
                      <IconGallery size={15} /> Galerie
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const el = mapCameraFileRefs.current[m.id];
                    if (el) el.value = '';
                    el?.click();
                  }}
                  disabled={readOnly || mapSavingKey === `map-image:${m.id}`}
                >
                  {mapSavingKey === `map-image:${m.id}` ? (
                    'Envoi…'
                  ) : (
                    <>
                      <IconCamera size={15} /> Appareil photo
                    </>
                  )}
                </button>
                <input
                  ref={(el) => {
                    mapGalleryFileRefs.current[m.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={readOnly}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    uploadMapImage(m.id, f);
                  }}
                />
                <input
                  ref={(el) => {
                    mapCameraFileRefs.current[m.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  disabled={readOnly}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    uploadMapImage(m.id, f);
                  }}
                />
              </div>
            </div>
            <MapGeorefPanel
              map={m}
              imageUrl={m.map_image_url}
              busy={readOnly}
              onSaved={(okMsg) => {
                onMessage?.(okMsg);
                onMapsChanged?.();
              }}
              onError={(errMsg) => onError?.(errMsg)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
