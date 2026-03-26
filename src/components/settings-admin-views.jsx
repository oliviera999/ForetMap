import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { compressImage } from '../utils/image';

function SettingsAdminView() {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [settings, setSettings] = useState([]);
  const [maps, setMaps] = useState([]);
  const [logs, setLogs] = useState([]);
  const [oauthDebug, setOauthDebug] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const mapFileRefs = useRef({});

  const settingByKey = useMemo(() => {
    const out = {};
    for (const row of settings) out[row.key] = row;
    return out;
  }, [settings]);

  const get = (key, fallback) => {
    if (!settingByKey[key]) return fallback;
    return settingByKey[key].value;
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
    }
    setSavingKey('');
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
      const dataUrl = await compressImage(file, 2200, 0.85);
      await api(`/api/settings/admin/maps/${encodeURIComponent(mapId)}/image`, 'POST', { image_data: dataUrl });
      await load();
      setMsg('Image de plan mise à jour');
    } catch (e) {
      setErr(e.message || 'Échec upload image');
    }
    setSavingKey('');
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
    <div className="fade-in">
      <h2 className="section-title">⚙️ Paramètres administrateur</h2>
      <p className="section-sub">Console centralisée pour l’accueil, les cartes/plans, la sécurité et l’exploitation.</p>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {msg && <div className="auth-success">{msg}</div>}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Accueil & authentification</h3>
          {[
            ['ui.auth.allow_register', 'Afficher "Créer un compte"'],
            ['ui.auth.allow_google_student', 'Afficher "Google élève"'],
            ['ui.auth.allow_google_teacher', 'Afficher "Google prof"'],
            ['ui.auth.allow_guest_visit', 'Afficher "Visiter sans connexion"'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'block', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={!!get(key, true)}
                disabled={savingKey === key}
                onChange={(e) => saveSetting(key, e.target.checked)}
              />
              {' '}
              {label}
            </label>
          ))}
          <div className="field">
            <label>Mode auth par défaut</label>
            <select
              value={get('ui.auth.default_mode', 'login')}
              onChange={(e) => saveSetting('ui.auth.default_mode', e.target.value)}
              disabled={savingKey === 'ui.auth.default_mode'}
            >
              <option value="login">Connexion</option>
              <option value="register">Inscription</option>
            </select>
          </div>
          <div className="field">
            <label>Message d’accueil</label>
            <textarea
              rows={2}
              defaultValue={get('ui.auth.welcome_message', '')}
              placeholder="Message court sous le logo"
              onBlur={(e) => saveSetting('ui.auth.welcome_message', e.target.value || '')}
            />
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Modules UI</h3>
          {[
            ['ui.modules.tutorials_enabled', 'Tutoriels'],
            ['ui.modules.visit_enabled', 'Visite'],
            ['ui.modules.stats_enabled', 'Statistiques'],
            ['ui.modules.observations_enabled', 'Carnet observations'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'block', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={!!get(key, true)}
                disabled={savingKey === key}
                onChange={(e) => saveSetting(key, e.target.checked)}
              />
              {' '}
              {label}
            </label>
          ))}
          <div className="field">
            <label>Carte par défaut (élève)</label>
            <select value={get('ui.map.default_map_student', 'foret')} onChange={(e) => saveSetting('ui.map.default_map_student', e.target.value)}>
              {maps.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Carte par défaut (professeur)</label>
            <select value={get('ui.map.default_map_teacher', 'foret')} onChange={(e) => saveSetting('ui.map.default_map_teacher', e.target.value)}>
              {maps.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Carte par défaut (visite publique)</label>
            <select value={get('ui.map.default_map_visit', 'foret')} onChange={(e) => saveSetting('ui.map.default_map_visit', e.target.value)}>
              {maps.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Cartes & plans</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {maps.map((m) => (
            <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px auto', gap: 8, alignItems: 'center' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
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
                <div>
                  <button className="btn btn-secondary btn-sm" onClick={() => mapFileRefs.current[m.id]?.click()} disabled={savingKey === `map-image:${m.id}`}>
                    {savingKey === `map-image:${m.id}` ? 'Upload...' : 'Uploader une image'}
                  </button>
                  <input
                    ref={(el) => { mapFileRefs.current[m.id] = el; }}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => uploadMapImage(m.id, e.target.files?.[0])}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Sécurité</h3>
          <div className="field">
            <label>Longueur min mot de passe</label>
            <input
              type="number"
              min={4}
              max={32}
              value={get('security.password_min_length', 4)}
              onChange={(e) => saveSetting('security.password_min_length', parseInt(e.target.value || '4', 10))}
            />
          </div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!get('security.allow_pin_elevation', true)}
              onChange={(e) => saveSetting('security.allow_pin_elevation', e.target.checked)}
            />
            {' '}
            Autoriser l’élévation PIN
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!get('integration.google.enabled', true)}
              onChange={(e) => saveSetting('integration.google.enabled', e.target.checked)}
            />
            {' '}
            Autoriser OAuth Google côté serveur
          </label>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Exploitation</h3>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!get('ops.allow_remote_logs', true)}
              onChange={(e) => saveSetting('ops.allow_remote_logs', e.target.checked)}
            />
            {' '}
            Autoriser consultation logs
          </label>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!get('ops.allow_remote_restart', true)}
              onChange={(e) => saveSetting('ops.allow_remote_restart', e.target.checked)}
            />
            {' '}
            Autoriser redémarrage distant
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>Charger logs</button>
            <button className="btn btn-secondary btn-sm" onClick={fetchOauthDebug}>Diagnostic OAuth</button>
            <button className="btn btn-danger btn-sm" onClick={triggerRestart} disabled={savingKey === 'restart'}>
              {savingKey === 'restart' ? '...' : 'Redémarrer'}
            </button>
          </div>
        </div>
      </div>

      {(logs.length > 0 || oauthDebug) && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Diagnostics</h3>
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
