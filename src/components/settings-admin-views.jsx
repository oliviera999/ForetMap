import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { compressImageWithPreset } from '../utils/image';
import { getRoleTerms } from '../utils/n3-terminology';
import { MediaLibraryMenu } from './MediaLibraryMenu.jsx';
import { useSession } from '../contexts/SessionContext.jsx';

const SECTION_DEFS = {
  auth: { title: 'Accueil & authentification', order: 10 },
  modules: { title: 'Modules UI', order: 20 },
  content: { title: 'Contenus du site', order: 22 },
  tasks: { title: 'Tâches & inscriptions n3beurs', order: 23 },
  progression: { title: 'Progression n3beurs', order: 25 },
  security: { title: 'Sécurité', order: 30 },
  operations: { title: 'Exploitation', order: 40 },
  other: { title: 'Autres paramètres', order: 90 },
};

const KEY_META = {
  'ui.auth.allow_register': { label: 'Afficher "Créer un compte"', section: 'auth', order: 10 },
  'ui.auth.allow_google_student': { section: 'auth', order: 20, dynamicLabel: 'googleStudent' },
  'ui.auth.allow_google_teacher': { section: 'auth', order: 30, dynamicLabel: 'googleTeacher' },
  'ui.auth.allow_guest_visit': { label: 'Afficher "Visiter sans compte"', section: 'auth', order: 40 },
  'ui.auth.default_mode': { label: 'Mode auth par défaut', section: 'auth', order: 50 },
  'ui.auth.welcome_message': { label: 'Message d’accueil', section: 'auth', order: 60, multiline: true },
  'content.auth.title': { label: 'Titre écran de connexion', section: 'content', order: 10 },
  'content.auth.subtitle': { label: 'Sous-titre écran de connexion', section: 'content', order: 20, multiline: true },
  'content.auth.login_tab': { label: 'Texte onglet connexion', section: 'content', order: 30 },
  'content.auth.register_tab': { label: 'Texte onglet création de compte', section: 'content', order: 40 },
  'content.auth.guest_visit_cta': { label: 'Bouton visite sans compte', section: 'content', order: 50 },
  'content.app.loader': { label: 'Message global de chargement', section: 'content', order: 60 },
  'content.app.server_down_notice': { label: 'Message serveur indisponible', section: 'content', order: 70, multiline: true },
  'content.app.retry_now': { label: 'Bouton réessayer', section: 'content', order: 80 },
  'content.app.footer_version_prefix': { label: 'Préfixe version footer', section: 'content', order: 90 },
  'content.visit.title': { label: 'Titre page visite', section: 'content', order: 100 },
  'content.visit.subtitle': { label: 'Sous-titre page visite', section: 'content', order: 110, multiline: true },
  'content.visit.empty_selection': { label: 'Texte zone non sélectionnée', section: 'content', order: 120, multiline: true },
  'content.visit.tutorials_title': { label: 'Titre bloc tutoriels visite', section: 'content', order: 130 },
  'content.visit.tutorials_empty': { label: 'Texte tutoriels vides', section: 'content', order: 140, multiline: true },
  'content.about.title': { label: 'Titre page à propos', section: 'content', order: 150 },
  'content.about.subtitle': { label: 'Sous-titre page à propos', section: 'content', order: 160, multiline: true },
  'content.about.purpose_title': { label: 'Titre carte objet de l’application', section: 'content', order: 170 },
  'content.about.purpose_body': { label: 'Texte objet de l’application', section: 'content', order: 180, multiline: true },
  'content.about.docs_title': { label: 'Titre carte documentation', section: 'content', order: 190 },
  'content.about.help_title': { label: 'Titre carte aide contextuelle', section: 'content', order: 210 },
  'content.about.help_body': { label: 'Texte aide contextuelle', section: 'content', order: 220, multiline: true },
  'content.about.help_reenable_cta': { label: 'Bouton réactiver aides', section: 'content', order: 230 },
  'content.about.help_reset_metrics_cta': { label: 'Bouton reset compteurs aide', section: 'content', order: 240 },
  'content.help.hint_prefix': { label: 'Préfixe mini-astuce contextuelle', section: 'content', order: 245 },
  'content.help.panel_title_prefix': { label: 'Préfixe titre panneau aide (?)', section: 'content', order: 246 },
  'content.help.panel_close_cta': { label: 'Bouton fermer panneau aide (?)', section: 'content', order: 247 },
  'content.help.panel_dismiss_cta': { label: 'Bouton masquer panneau aide (?)', section: 'content', order: 248 },
  'content.help.map_quick_tip': { label: 'Mini-astuce carte', section: 'content', order: 249, multiline: true },
  'content.help.tasks_quick_tip': { label: 'Mini-astuce tâches', section: 'content', order: 250, multiline: true },
  'content.help.visit_quick_tip': { label: 'Mini-astuce visite', section: 'content', order: 251, multiline: true },

  'ui.modules.tutorials_enabled': { label: 'Tutoriels', section: 'modules', order: 10 },
  'ui.modules.visit_enabled': { label: 'Visite', section: 'modules', order: 20 },
  'ui.modules.stats_enabled': { label: 'Statistiques', section: 'modules', order: 30 },
  'ui.modules.observations_enabled': { label: 'Carnet observations', section: 'modules', order: 40 },
  'ui.modules.help_enabled': { label: 'Aide contextuelle (tooltips + panneau ?)', section: 'modules', order: 45 },
  'ui.modules.forum_enabled': { label: 'Forum', section: 'modules', order: 46 },
  'ui.modules.context_comments_enabled': { label: 'Commentaires de contexte (zones, tâches, projets, biodiversité, tutoriels)', section: 'modules', order: 47 },
  'ui.help.show_context_hints': { label: 'Afficher les mini-astuces contextuelles', section: 'modules', order: 47.1 },
  'ui.help.pulse_unseen_panels': { label: 'Animer le bouton ? tant que l’aide n’est pas vue', section: 'modules', order: 47.2 },
  'ui.reactions.allowed_emojis': { label: 'Emojis de réaction (séparés par espaces)', section: 'modules', order: 48 },
  'ui.map.location_emojis': {
    label:
      'Emojis zones/repères/tâches (séparés par espaces) — catalogue proposé dans les sélecteurs ; le rendu coloré est assuré par la police Noto auto-hébergée (voir npm run fonts:sync-noto-emoji, docs/LOCAL_DEV.md).',
    section: 'modules',
    order: 49,
    multiline: true,
  },
  'ui.map.default_map_student': { section: 'modules', order: 50, dynamicLabel: 'defaultStudentMap' },
  'ui.map.default_map_teacher': { section: 'modules', order: 60, dynamicLabel: 'defaultTeacherMap' },
  'ui.map.default_map_visit': { label: 'Carte par défaut (visite publique)', section: 'modules', order: 70 },
  'ui.map.emoji_label_center_gap': {
    label: 'Carte — écart emoji / nom (coefficient × inv ; zones + repères, 14 = défaut)',
    section: 'modules',
    order: 71,
  },
  'ui.map.overlay_emoji_size_percent': {
    label: 'Carte — taille des emojis zones & repères (%)',
    section: 'modules',
    order: 72,
  },
  'ui.map.overlay_label_size_percent': {
    label: 'Carte — taille des noms sous les repères (%)',
    section: 'modules',
    order: 73,
  },
  'tasks.student_max_active_assignments': {
    label: 'Plafond par défaut d’inscriptions (tâches non validées par n3boss, toutes cartes ; 0 = illimité). Surclassé par le plafond défini sur chaque profil n3beur dans Profils & utilisateurs lorsqu’il est renseigné. Les affectations par un n3boss ne sont pas plafonnées.',
    section: 'tasks',
    order: 10,
  },
  'tasks.recurring_automation_enabled': {
    label: 'Duplication automatique des tâches récurrentes (job quotidien). Désactiver pendant les vacances pour bloquer la création auto ; le rattrapage manuel via `npm run tasks:spawn-recurring` reste possible.',
    section: 'tasks',
    order: 20,
  },
  'rbac.progression_by_validated_tasks': {
    label: 'Montée de niveau auto. selon les tâches validées',
    section: 'progression',
    order: 5,
  },
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
  if (normalized.startsWith('content.')) return 'content';
  if (normalized.startsWith('ui.modules.') || normalized.startsWith('ui.map.')) return 'modules';
  if (normalized.startsWith('tasks.')) return 'tasks';
  if (normalized.startsWith('progression.') || normalized.startsWith('rbac.')) return 'progression';
  if (normalized.startsWith('security.') || normalized.startsWith('integration.')) return 'security';
  if (normalized.startsWith('system.') || normalized.startsWith('ops.')) return 'operations';
  return 'other';
}

function scopeLabel(scope) {
  const s = String(scope || '').toLowerCase();
  if (s === 'admin') return 'Admin';
  if (s === 'teacher') return 'n3boss';
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
  // Ne pas utiliser Number(null) === 0 : les contraintes absentes arrivent en null depuis l’API.
  if (constraints.min != null && Number.isFinite(Number(constraints.min))) {
    parts.push(`min ${Number(constraints.min)}`);
  }
  if (constraints.max != null && Number.isFinite(Number(constraints.max))) {
    parts.push(`max ${Number(constraints.max)}`);
  }
  if (constraints.maxLength != null && Number.isFinite(Number(constraints.maxLength))) {
    parts.push(`max ${Number(constraints.maxLength)} caractères`);
  }
  if (Array.isArray(constraints.values) && constraints.values.length > 0) {
    parts.push(`valeurs: ${constraints.values.map((v) => String(v)).join(', ')}`);
  }
  if (row?.default_value != null && row?.default_value !== '') {
    parts.push(`défaut: ${String(row.default_value)}`);
  }
  return parts.join(' • ');
}

/** Champs texte pilotés par l’état : collage (Ctrl+V / presse-papiers) fiable + resync après chargement serveur. */
function AdminTextSettingField({
  rowKey,
  label,
  row,
  serverValue,
  disabled,
  onSave,
}) {
  const multiline = row._multiline || (row?.constraints?.maxLength != null && row.constraints.maxLength > 100);
  const maxLength = row?.constraints?.maxLength;
  const maxLenN = maxLength == null ? NaN : Number(maxLength);
  const maxLenProp = Number.isFinite(maxLenN) && maxLenN > 0 ? maxLenN : undefined;
  const synced = serverValue == null ? '' : String(serverValue);
  const [draft, setDraft] = useState(synced);
  useEffect(() => {
    setDraft(synced);
  }, [rowKey, synced]);

  const commit = () => {
    const next = draft || '';
    if (next === synced) return;
    onSave(rowKey, next);
  };

  return (
    <div className="field">
      <label>
        {label}
        <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
          ({scopeLabel(row.scope)})
        </span>
      </label>
      {multiline ? (
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          maxLength={maxLenProp}
          disabled={disabled}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          maxLength={maxLenProp}
          disabled={disabled}
        />
      )}
      <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
        {buildConstraintHelp(row)}
      </div>
    </div>
  );
}

/** Champ nombre piloté : resynchronisation après chargement serveur (comme AdminTextSettingField). */
function AdminNumberSettingField({
  rowKey,
  label,
  row,
  serverValue,
  disabled,
  min,
  max,
  fallback,
  onSave,
}) {
  const synced = Number.isFinite(Number(serverValue)) ? Number(serverValue) : fallback;
  const [draft, setDraft] = useState(String(synced));
  useEffect(() => {
    setDraft(String(Number.isFinite(Number(serverValue)) ? Number(serverValue) : fallback));
  }, [rowKey, serverValue, fallback]);

  const commit = () => {
    const n = parseInt(String(draft).trim(), 10);
    const next = Number.isFinite(n) ? n : fallback;
    if (next === synced) return;
    onSave(rowKey, next);
  };

  return (
    <div className="field">
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
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
        {buildConstraintHelp(row)}
      </div>
    </div>
  );
}

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
