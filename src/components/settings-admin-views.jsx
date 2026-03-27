import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { compressImage } from '../utils/image';
import { getRoleTerms } from '../utils/n3-terminology';

const SECTION_DEFS = {
  auth: { title: 'Accueil & authentification', order: 10 },
  modules: { title: 'Modules UI', order: 20 },
  progression: { title: 'Progression élèves', order: 25 },
  security: { title: 'Sécurité', order: 30 },
  operations: { title: 'Exploitation', order: 40 },
  other: { title: 'Autres paramètres', order: 90 },
};

const KEY_META = {
  'ui.auth.allow_register': { label: 'Afficher "Créer un compte"', section: 'auth', order: 10 },
  'ui.auth.allow_google_student': { section: 'auth', order: 20, dynamicLabel: 'googleStudent' },
  'ui.auth.allow_google_teacher': { section: 'auth', order: 30, dynamicLabel: 'googleTeacher' },
  'ui.auth.allow_guest_visit': { label: 'Afficher "Visiter sans connexion"', section: 'auth', order: 40 },
  'ui.auth.default_mode': { label: 'Mode auth par défaut', section: 'auth', order: 50 },
  'ui.auth.welcome_message': { label: 'Message d’accueil', section: 'auth', order: 60, multiline: true },

  'ui.modules.tutorials_enabled': { label: 'Tutoriels', section: 'modules', order: 10 },
  'ui.modules.visit_enabled': { label: 'Visite', section: 'modules', order: 20 },
  'ui.modules.stats_enabled': { label: 'Statistiques', section: 'modules', order: 30 },
  'ui.modules.observations_enabled': { label: 'Carnet observations', section: 'modules', order: 40 },
  'ui.modules.help_enabled': { label: 'Aide contextuelle (tooltips + panneau ?)', section: 'modules', order: 45 },
  'ui.map.default_map_student': { section: 'modules', order: 50, dynamicLabel: 'defaultStudentMap' },
  'ui.map.default_map_teacher': { section: 'modules', order: 60, dynamicLabel: 'defaultTeacherMap' },
  'ui.map.default_map_visit': { label: 'Carte par défaut (visite publique)', section: 'modules', order: 70 },
  'progression.student_role_min_done_eleve_avance': { label: 'Seuil profil élève avancé (tâches validées)', section: 'progression', order: 10 },
  'progression.student_role_min_done_eleve_chevronne': { label: 'Seuil profil élève chevronné (tâches validées)', section: 'progression', order: 20 },

  'security.password_min_length': { label: 'Longueur min mot de passe', section: 'security', order: 10 },
  'security.jwt_ttl_base_seconds': { label: 'Durée session standard (secondes)', section: 'security', order: 20 },
  'security.jwt_ttl_elevated_seconds': { label: 'Durée session élevée (secondes)', section: 'security', order: 30 },
  'security.allow_pin_elevation': { label: 'Autoriser l’élévation PIN', section: 'security', order: 40 },
  'integration.google.enabled': { label: 'Autoriser OAuth Google côté serveur', section: 'security', order: 50 },

  'system.maintenance_mode': { label: 'Activer le mode maintenance', section: 'operations', order: 10 },
  'system.maintenance_message': { label: 'Message maintenance', section: 'operations', order: 20, multiline: true },
  'ops.allow_remote_logs': { label: 'Autoriser consultation logs', section: 'operations', order: 30 },
  'ops.allow_remote_restart': { label: 'Autoriser redémarrage distant', section: 'operations', order: 40 },
};

function humanizeKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  const last = raw.split('.').pop() || raw;
  return last
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferSectionFromKey(key) {
  const normalized = String(key || '').toLowerCase();
  if (normalized.startsWith('ui.auth.')) return 'auth';
  if (normalized.startsWith('ui.modules.') || normalized.startsWith('ui.map.')) return 'modules';
  if (normalized.startsWith('progression.')) return 'progression';
  if (normalized.startsWith('security.') || normalized.startsWith('integration.')) return 'security';
  if (normalized.startsWith('system.') || normalized.startsWith('ops.')) return 'operations';
  return 'other';
}

function scopeLabel(scope) {
  const s = String(scope || '').toLowerCase();
  if (s === 'admin') return 'Admin';
  if (s === 'teacher') return 'Enseignant';
  return 'Public';
}

function typeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'boolean') return 'booléen';
  if (t === 'number') return 'numérique';
  if (t === 'enum') return 'liste';
  if (t === 'string') return 'texte';
  return t || 'inconnu';
}

function buildConstraintHelp(row) {
  const parts = [`Type: ${typeLabel(row?.type)}`];
  const constraints = row?.constraints || {};
  if (Number.isFinite(Number(constraints.min))) parts.push(`min ${Number(constraints.min)}`);
  if (Number.isFinite(Number(constraints.max))) parts.push(`max ${Number(constraints.max)}`);
  if (Number.isFinite(Number(constraints.maxLength))) parts.push(`max ${Number(constraints.maxLength)} caractères`);
  if (Array.isArray(constraints.values) && constraints.values.length > 0) {
    parts.push(`valeurs: ${constraints.values.map((v) => String(v)).join(', ')}`);
  }
  if (row?.default_value != null && row?.default_value !== '') {
    parts.push(`défaut: ${String(row.default_value)}`);
  }
  return parts.join(' • ');
}

function SettingsAdminView({ isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [settings, setSettings] = useState([]);
  const [maps, setMaps] = useState([]);
  const [logs, setLogs] = useState([]);
  const [oauthDebug, setOauthDebug] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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

  const resolveSettingLabel = (key) => {
    const meta = KEY_META[key];
    if (!meta) return humanizeKey(key);
    if (meta.dynamicLabel === 'googleStudent') return `Afficher "Google ${roleTerms.studentSingular}"`;
    if (meta.dynamicLabel === 'googleTeacher') return `Afficher "Google ${roleTerms.teacherShort}"`;
    if (meta.dynamicLabel === 'defaultStudentMap') return `Carte par défaut (${roleTerms.studentSingular})`;
    if (meta.dynamicLabel === 'defaultTeacherMap') return `Carte par défaut (${roleTerms.teacherSingular})`;
    return meta.label || humanizeKey(key);
  };

  const settingSections = useMemo(() => {
    const rows = settings.map((row) => {
      const meta = KEY_META[row.key] || {};
      const sectionId = meta.section || inferSectionFromKey(row.key);
      const sectionDef = SECTION_DEFS[sectionId] || SECTION_DEFS.other;
      return {
        ...row,
        _sectionId: sectionId,
        _sectionTitle: sectionDef.title,
        _sectionOrder: sectionDef.order,
        _fieldOrder: meta.order ?? 999,
        _multiline: !!meta.multiline,
      };
    });
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row._sectionId)) {
        grouped.set(row._sectionId, {
          id: row._sectionId,
          title: row._sectionTitle,
          order: row._sectionOrder,
          rows: [],
        });
      }
      grouped.get(row._sectionId).rows.push(row);
    }
    const ordered = Array.from(grouped.values())
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    for (const section of ordered) {
      section.rows.sort((a, b) => a._fieldOrder - b._fieldOrder || String(a.key).localeCompare(String(b.key)));
    }
    return ordered;
  }, [settings]);

  const filteredSettingSections = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    if (!query) return settingSections;
    return settingSections
      .map((section) => {
        const rows = section.rows.filter((row) => {
          const label = resolveSettingLabel(row.key).toLowerCase();
          const key = String(row.key || '').toLowerCase();
          const scope = scopeLabel(row.scope).toLowerCase();
          const help = buildConstraintHelp(row).toLowerCase();
          return label.includes(query) || key.includes(query) || scope.includes(query) || help.includes(query);
        });
        return { ...section, rows };
      })
      .filter((section) => section.rows.length > 0);
  }, [resolveSettingLabel, searchQuery, settingSections]);

  const filteredCount = useMemo(() => {
    let n = 0;
    for (const section of filteredSettingSections) n += section.rows.length;
    return n;
  }, [filteredSettingSections]);

  const renderSettingField = (row) => {
    const key = String(row.key || '');
    const value = get(key, row.default_value);
    const disabled = savingKey === key;
    const label = resolveSettingLabel(key);
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
        <div key={key} className="field">
          <label>
            {label}
            <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
              ({scopeLabel(row.scope)})
            </span>
          </label>
          <input
            type="number"
            min={Number.isFinite(Number(min)) ? Number(min) : undefined}
            max={Number.isFinite(Number(max)) ? Number(max) : undefined}
            defaultValue={Number.isFinite(Number(value)) ? Number(value) : fallback}
            disabled={disabled}
            onBlur={(e) => {
              const n = parseInt(e.target.value || String(fallback), 10);
              saveSetting(key, Number.isFinite(n) ? n : fallback);
            }}
          />
          <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
            {buildConstraintHelp(row)}
          </div>
        </div>
      );
    }

    const stringValue = value == null ? '' : String(value);
    if (row._multiline || (maxLength != null && maxLength > 100)) {
      return (
        <div key={key} className="field">
          <label>
            {label}
            <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
              ({scopeLabel(row.scope)})
            </span>
          </label>
          <textarea
            rows={2}
            defaultValue={stringValue}
            maxLength={Number.isFinite(Number(maxLength)) ? Number(maxLength) : undefined}
            disabled={disabled}
            onBlur={(e) => saveSetting(key, e.target.value || '')}
          />
          <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
            {buildConstraintHelp(row)}
          </div>
        </div>
      );
    }

    return (
      <div key={key} className="field">
        <label>
          {label}
          <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
            ({scopeLabel(row.scope)})
          </span>
        </label>
        <input
          type="text"
          defaultValue={stringValue}
          maxLength={Number.isFinite(Number(maxLength)) ? Number(maxLength) : undefined}
          disabled={disabled}
          onBlur={(e) => saveSetting(key, e.target.value || '')}
        />
        <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
          {buildConstraintHelp(row)}
        </div>
      </div>
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

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        {filteredSettingSections.map((section) => (
          <div key={section.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
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
          <h3 style={{ marginTop: 0 }}>Actions système</h3>
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
