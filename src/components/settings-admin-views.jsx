import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { compressImageWithPreset } from '../utils/image';
import { scopeLabel, buildConstraintHelp } from '../utils/settingDisplay.js';
import {
  resolveSettingLabel,
  buildSettingSections,
  filterSettingSections,
  countSectionRows,
} from '../utils/settingsAdminSections.js';
import { getRoleTerms } from '../utils/n3-terminology';
import { MediaLibraryMenu } from './MediaLibraryMenu.jsx';
import { AdminTextSettingField, AdminNumberSettingField } from './settings/AdminSettingFields.jsx';
import { useSession } from '../contexts/SessionContext.jsx';

function SettingsAdminView() {
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [settings, setSettings] = useState([]);
  const [maps, setMaps] = useState([]);
  const [logs, setLogs] = useState([]);
  const [oauthDebug, setOauthDebug] = useState(null);
  const [speciesAutofillTest, setSpeciesAutofillTest] = useState(null);
  const [systemDiagnostics, setSystemDiagnostics] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const mapGalleryFileRefs = useRef({});
  const mapCameraFileRefs = useRef({});
  const [newMapId, setNewMapId] = useState('');
  const [newMapLabel, setNewMapLabel] = useState('');
  const [newMapSort, setNewMapSort] = useState('3');

  const settingByKey = useMemo(() => {
    const out = {};
    for (const row of settings) out[row.key] = row;
    return out;
  }, [settings]);

  const get = (key, fallback) => {
    if (!settingByKey[key]) return fallback;
    return settingByKey[key].value;
  };

  const settingSections = useMemo(() => buildSettingSections(settings), [settings]);

  const filteredSettingSections = useMemo(
    () => filterSettingSections(settingSections, searchQuery, roleTerms),
    [searchQuery, settingSections, roleTerms]
  );

  const filteredCount = useMemo(() => countSectionRows(filteredSettingSections), [filteredSettingSections]);

  const renderSettingField = (row) => {
    const key = String(row.key || '');
    const value = get(key, row.default_value);
    const disabled = savingKey === key;
    const label = resolveSettingLabel(key, roleTerms);
    const maxLength = row?.constraints?.maxLength;
    const min = row?.constraints?.min;
    const max = row?.constraints?.max;
    const enumValues = Array.isArray(row?.constraints?.values) ? row.constraints.values : [];
    const isMapDefault = key.startsWith('ui.map.default_map_');
    const selectValues = isMapDefault
      ? (maps || []).map((m) => m.id)
      : enumValues;
    const hasSelectValues = selectValues.length > 0;

    if (row.type === 'boolean') {
      return (
        <div key={key} style={{ marginBottom: 8 }}>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={!!value}
              disabled={disabled}
              onChange={(e) => saveSetting(key, e.target.checked)}
            />
            {' '}
            {label}
            <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
              ({scopeLabel(row.scope)})
            </span>
          </label>
          <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
            {buildConstraintHelp(row)}
          </div>
        </div>
      );
    }

    if (row.type === 'enum' || hasSelectValues) {
      const options = hasSelectValues ? selectValues : enumValues;
      return (
        <div key={key} className="field">
          <label>
            {label}
            <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
              ({scopeLabel(row.scope)})
            </span>
          </label>
          <select
            value={String(value ?? '')}
            disabled={disabled}
            onChange={(e) => saveSetting(key, e.target.value)}
          >
            {options.map((opt) => (
              <option key={String(opt)} value={String(opt)}>
                {isMapDefault
                  ? ((maps || []).find((m) => m.id === String(opt))?.label || String(opt))
                  : String(opt)}
              </option>
            ))}
          </select>
          <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
            {buildConstraintHelp(row)}
          </div>
        </div>
      );
    }

    if (row.type === 'number') {
      const fallback = Number.isFinite(Number(row.default_value)) ? Number(row.default_value) : 0;
      return (
        <div key={key}>
          <AdminNumberSettingField
            rowKey={key}
            label={label}
            row={row}
            serverValue={value}
            disabled={disabled}
            min={min}
            max={max}
            fallback={fallback}
            onSave={saveSetting}
          />
        </div>
      );
    }

    const stringValue = value == null ? '' : String(value);
    return (
      <AdminTextSettingField
        key={key}
        rowKey={key}
        label={label}
        row={row}
        serverValue={stringValue}
        disabled={disabled}
        onSave={saveSetting}
      />
    );
  };

  const load = async () => {
    setErr('');
    setLoading(true);
    try {
      const data = await api('/api/settings/admin');
      setSettings(Array.isArray(data?.settings) ? data.settings : []);
      setMaps(Array.isArray(data?.maps) ? data.maps : []);
    } catch (e) {
      setErr(e.message || 'Impossible de charger les paramètres');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveSetting = async (key, value, okMsg = 'Paramètre enregistré') => {
    setErr('');
    setMsg('');
    setSavingKey(key);
    try {
      await api(`/api/settings/admin/${encodeURIComponent(key)}`, 'PUT', { value });
      await load();
      setMsg(okMsg);
    } catch (e) {
      setErr(e.message || 'Échec enregistrement');
    } finally {
      setSavingKey('');
    }
  };

  const saveMap = async (mapId, patch, okMsg = 'Carte mise à jour') => {
    setErr('');
    setMsg('');
    setSavingKey(`map:${mapId}`);
    try {
      await api(`/api/settings/admin/maps/${encodeURIComponent(mapId)}`, 'PUT', patch);
      await load();
      setMsg(okMsg);
    } catch (e) {
      setErr(e.message || 'Échec mise à jour carte');
    }
    setSavingKey('');
  };

  const uploadMapImage = async (mapId, file) => {
    if (!file) return;
    setErr('');
    setMsg('');
    setSavingKey(`map-image:${mapId}`);
    try {
      const dataUrl = await compressImageWithPreset(file, 'adminProfile');
      await api(`/api/settings/admin/maps/${encodeURIComponent(mapId)}/image`, 'POST', { image_data: dataUrl });
      await load();
      setMsg('Image de plan mise à jour');
    } catch (e) {
      setErr(e.message || 'Échec upload image');
    }
    setSavingKey('');
  };

  const createMap = async () => {
    const id = String(newMapId || '').trim().toLowerCase();
    const label = String(newMapLabel || '').trim();
    if (!id || !label) {
      setErr('Identifiant et libellé sont requis pour créer une carte');
      return;
    }
    setErr('');
    setMsg('');
    setSavingKey('map:create');
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
      setNewMapSort(String(Math.max(3, (maps?.length || 2) + 1)));
      await load();
      setMsg('Carte créée — configure l’URL ou l’image ci-dessous si besoin.');
    } catch (e) {
      setErr(e.message || 'Échec création carte');
    }
    setSavingKey('');
  };

  const fetchMediaLibrary = async () => {
    const data = await api('/api/settings/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  };

  const uploadMediaLibrary = async (mediaData) => {
    await api('/api/settings/admin/media-library', 'POST', { media_data: mediaData });
    setMsg('Média ajouté à la bibliothèque');
  };

  const deleteMediaLibrary = async (relativePath) => {
    await api('/api/settings/admin/media-library', 'DELETE', { relative_path: relativePath });
    setMsg('Média supprimé de la bibliothèque');
  };

  const fetchLogs = async () => {
    setErr('');
    try {
      const data = await api('/api/settings/admin/system/logs?lines=200');
      setLogs(Array.isArray(data?.entries) ? data.entries : []);
      setMsg('Logs chargés');
    } catch (e) {
      setErr(e.message || 'Impossible de charger les logs');
    }
  };

  const fetchOauthDebug = async () => {
    setErr('');
    try {
      const data = await api('/api/settings/admin/system/oauth-debug');
      setOauthDebug(data || null);
      setMsg('Diagnostic OAuth chargé');
    } catch (e) {
      setErr(e.message || 'Impossible de charger le diagnostic OAuth');
    }
  };

  const fetchSystemDiagnostics = async () => {
    setErr('');
    try {
      const data = await api('/api/settings/admin/system/diagnostics');
      setSystemDiagnostics(data || null);
      setMsg('Diagnostic système chargé');
    } catch (e) {
      setErr(e.message || 'Impossible de charger le diagnostic système');
    }
  };

  const fetchSpeciesAutofillProvidersTest = async () => {
    setErr('');
    setMsg('');
    setSavingKey('species-autofill-test');
    try {
      const data = await api('/api/settings/admin/system/species-autofill-providers-test');
      setSpeciesAutofillTest(data || null);
      setMsg(
        data?.ok
          ? 'Test connectivité Pl@ntNet / OpenAI : OK'
          : 'Test connectivité terminé — voir le détail ci-dessous (au moins un fournisseur en échec ou non testé).',
      );
    } catch (e) {
      setSpeciesAutofillTest(null);
      setErr(e.message || 'Impossible d’exécuter le test des fournisseurs pré-saisie');
    } finally {
      setSavingKey('');
    }
  };

  const triggerRestart = async () => {
    if (!window.confirm('Redémarrer l’application maintenant ?')) return;
    setErr('');
    setMsg('');
    setSavingKey('restart');
    try {
      await api('/api/settings/admin/system/restart', 'POST', {});
      setMsg('Redémarrage déclenché. La session peut être coupée quelques secondes.');
    } catch (e) {
      setErr(e.message || 'Redémarrage refusé');
    }
    setSavingKey('');
  };

  if (loading) {
    return <div className="empty"><p>Chargement des paramètres admin...</p></div>;
  }

  return (
    <div className="fade-in settings-admin">
      <h2 className="section-title">⚙️ Paramètres administrateur</h2>
      <p className="section-sub">Tout ce qui fait tourner l’app proprement : accueil, cartes, sécurité, exploitation.</p>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {msg && <div className="auth-success">{msg}</div>}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Recherche dans les paramètres</label>
          <input
            type="text"
            value={searchQuery}
            placeholder="Ex: maintenance, oauth, jwt, carte, public..."
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '.82rem', color: '#6b7280' }}>
            {filteredCount} paramètre(s) affiché(s) sur {settings.length}
          </div>
          {searchQuery && (
            <button className="btn btn-secondary btn-sm" onClick={() => setSearchQuery('')}>
              Réinitialiser le filtre
            </button>
          )}
        </div>
      </div>

      <div className="settings-admin-grid">
        {filteredSettingSections.map((section) => (
          <div key={section.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>{section.title}</h3>
            {section.rows.map((row) => renderSettingField(row))}
          </div>
        ))}
      </div>
      {filteredCount === 0 && (
        <div className="empty" style={{ marginTop: 12 }}>
          <p>Aucun paramètre ne correspond au filtre saisi.</p>
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Cartes & plans</h3>
        <p style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 10, lineHeight: 1.45 }}>
          Nouveau plan : identifiant technique stable (ex. <code>potager</code>), libellé affiché dans l’app, puis image (URL ou upload). Les élèves « les deux espaces » voient toutes les cartes actives ; une affiliation peut cibler un seul plan (y compris ceux ajoutés ici).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
          <div className="field" style={{ margin: 0, flex: '1 1 120px' }}>
            <label>Identifiant (slug)</label>
            <input value={newMapId} onChange={(e) => setNewMapId(e.target.value)} placeholder="ex. potager" autoComplete="off" />
          </div>
          <div className="field" style={{ margin: 0, flex: '1 1 180px' }}>
            <label>Libellé</label>
            <input value={newMapLabel} onChange={(e) => setNewMapLabel(e.target.value)} placeholder="ex. Potager pédagogique" autoComplete="off" />
          </div>
          <div className="field" style={{ margin: 0, width: 96 }}>
            <label>Ordre</label>
            <input type="number" min={0} value={newMapSort} onChange={(e) => setNewMapSort(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={createMap} disabled={savingKey === 'map:create'}>
            {savingKey === 'map:create' ? '…' : '+ Ajouter la carte'}
          </button>
        </div>
        <div className="settings-admin-maps-list">
          {maps.map((m) => (
            <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
              <div className="settings-admin-map-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{m.id}</div>
                </div>
                <input
                  defaultValue={m.label}
                  placeholder="Libellé"
                  onBlur={(e) => e.target.value.trim() && saveMap(m.id, { label: e.target.value.trim() })}
                />
                <input
                  type="number"
                  defaultValue={m.sort_order ?? 0}
                  placeholder="Ordre"
                  onBlur={(e) => saveMap(m.id, { sort_order: parseInt(e.target.value || '0', 10) || 0 })}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={!!m.is_active}
                    onChange={(e) => saveMap(m.id, { is_active: e.target.checked })}
                  />
                  {' '}
                  Active
                </label>
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label>URL image du plan</label>
                <input
                  defaultValue={m.map_image_url || ''}
                  onBlur={(e) => saveMap(m.id, { map_image_url: e.target.value || '' })}
                />
              </div>
              <MediaLibraryMenu
                title="Bibliothèque globale (images, audio, vidéo)"
                fetchItems={fetchMediaLibrary}
                uploadDataUrl={uploadMediaLibrary}
                removeItem={deleteMediaLibrary}
                onPickUrl={(url) => saveMap(m.id, { map_image_url: url }, 'URL de carte définie depuis la bibliothèque')}
              />
              <div className="settings-admin-map-tools">
                <div className="field">
                  <label>Padding cadre (0-32 px)</label>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    defaultValue={m.frame_padding_px ?? ''}
                    onBlur={(e) => saveMap(m.id, { frame_padding_px: e.target.value === '' ? null : parseInt(e.target.value || '0', 10) })}
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
                    disabled={savingKey === `map-image:${m.id}`}
                  >
                    {savingKey === `map-image:${m.id}` ? 'Envoi…' : '📁 Galerie'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const el = mapCameraFileRefs.current[m.id];
                      if (el) el.value = '';
                      el?.click();
                    }}
                    disabled={savingKey === `map-image:${m.id}`}
                  >
                    {savingKey === `map-image:${m.id}` ? 'Envoi…' : '📸 Appareil photo'}
                  </button>
                  <input
                    ref={(el) => { mapGalleryFileRefs.current[m.id] = el; }}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      uploadMapImage(m.id, f);
                    }}
                  />
                  <input
                    ref={(el) => { mapCameraFileRefs.current[m.id] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      uploadMapImage(m.id, f);
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-admin-grid settings-admin-grid--single-on-mobile" style={{ marginTop: 12 }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Actions système</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={fetchSystemDiagnostics}>Diagnostic complet</button>
            <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>Charger logs</button>
            <button className="btn btn-secondary btn-sm" onClick={fetchOauthDebug}>Diagnostic OAuth</button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchSpeciesAutofillProvidersTest}
              disabled={savingKey === 'species-autofill-test'}
            >
              {savingKey === 'species-autofill-test' ? 'Test…' : 'Test connectivité (Pl@ntNet / OpenAI)'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={triggerRestart} disabled={savingKey === 'restart'}>
              {savingKey === 'restart' ? '...' : 'Redémarrer'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '.78rem', color: '#6b7280' }}>
            Vérifie les clés <code>PLANTNET_API_KEY</code> et <code>OPENAI_API_KEY</code> définies sur le serveur (variables d’environnement). Aucune clé n’est affichée ni enregistrée ici.
          </p>
        </div>
      </div>

      {(logs.length > 0 || oauthDebug || speciesAutofillTest || systemDiagnostics) && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Diagnostics</h3>
          {systemDiagnostics && (
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto', fontSize: '.78rem', background: '#eff6ff', borderRadius: 8, padding: 8, marginBottom: oauthDebug || logs.length > 0 || speciesAutofillTest ? 8 : 0 }}>
              {JSON.stringify(systemDiagnostics, null, 2)}
            </pre>
          )}
          {speciesAutofillTest && (
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto', fontSize: '.78rem', background: '#f0fdf4', borderRadius: 8, padding: 8, marginBottom: oauthDebug || logs.length > 0 ? 8 : 0 }}>
              {JSON.stringify(speciesAutofillTest, null, 2)}
            </pre>
          )}
          {oauthDebug && (
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', fontSize: '.78rem', background: '#f9fafb', borderRadius: 8, padding: 8 }}>
              {JSON.stringify(oauthDebug, null, 2)}
            </pre>
          )}
          {logs.length > 0 && (
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', fontSize: '.75rem', background: '#111827', color: '#f9fafb', borderRadius: 8, padding: 8 }}>
              {logs.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export { SettingsAdminView };
