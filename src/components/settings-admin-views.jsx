import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { scopeLabel, buildConstraintHelp } from '../utils/settingDisplay.js';
import {
  resolveSettingLabel,
  buildSettingSections,
  filterSettingSections,
  countSectionRows,
} from '../utils/settingsAdminSections.js';
import { getRoleTerms } from '../utils/n3-terminology';
import { AdminTextSettingField, AdminNumberSettingField } from './settings/AdminSettingFields.jsx';
import { MapCategoriesPanel } from './settings/MapCategoriesPanel.jsx';
import { MapRoutesPanel } from './settings/MapRoutesPanel.jsx';
import { PlanSettingsPanel } from './settings/PlanSettingsPanel.jsx';
import { StaffPlanSettingsPanel } from './settings/StaffPlanSettingsPanel.jsx';
import { UsagePanel } from './settings/UsagePanel.jsx';
import { UserTrackingPanel } from './settings/UserTrackingPanel.jsx';
import { MapLocationsAdminPanel } from './settings/MapLocationsAdminPanel.jsx';
import { PlaceMessagesPanel } from './settings/PlaceMessagesPanel.jsx';
import { MapsAdminPanel } from './settings/MapsAdminPanel.jsx';
import { VisitMascotSettingsPanel } from './settings/VisitMascotSettingsPanel.jsx';
import { FMLearningGatingSettings } from './settings/FMLearningGatingSettings.jsx';
import { MoodleAdminPanel } from './settings/MoodleAdminPanel.jsx';
import { CategoryIdsMultiSelect } from './settings/CategoryIdsMultiSelect.jsx';
import { ForetBrandEditor } from './settings/ForetBrandEditor.jsx';
import { ForetMapHelpContentAdminPanel } from './help/ForetMapHelpContentAdminPanel.jsx';
import { HelpNarratorAdminPanel } from './help/HelpNarratorAdminPanel.jsx';
import { ForetMapReferenceDocsPanel } from './help/ForetMapReferenceDocsPanel.jsx';
import { DiscoveryTourAdminPanel } from './help/DiscoveryTourAdminPanel.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { AdminSection } from '../shared/components/AdminSection.jsx';
import { IconSettings, IconWarning } from '../shared/icons.jsx';
import { FORETMAP_BRAND_DEFAULTS } from '../constants/brand.js';
import { PLAN_BRAND_DEFAULTS } from '../plan/utils/planBrand.js';

const ACCUEIL_SECTION_IDS = ['auth', 'modules', 'content'];
const PEDAGO_SECTION_IDS = ['tasks', 'progression', 'imports'];
const OPS_SECTION_IDS = ['operations', 'security', 'other'];

const SEARCH_INDEX = [
  {
    id: 'accueil',
    label: 'Accueil & modules',
    keywords: ['accueil', 'auth', 'modules', 'connexion', 'authentification', 'contenu'],
  },
  {
    id: 'pedago',
    label: 'Pédagogie',
    keywords: [
      'pédagogie',
      'pedagogie',
      'pedago',
      'gating',
      'conditionnement',
      'progression',
      'tâches',
      'taches',
      'imports',
    ],
  },
  {
    id: 'carto',
    label: 'Cartographie',
    keywords: [
      'carto',
      'cartographie',
      'carte',
      'cartes',
      'calage',
      'catégories',
      'categories',
      'zones',
      'repères',
      'reperes',
      'parcours',
      'lieux',
      'messages',
      'signalements',
      'commentaires',
    ],
  },
  {
    id: 'plan',
    label: 'Plan Lyautey',
    keywords: ['plan', 'lyautey', 'qr', 'proflyautey', 'personnels', 'prof', 'code'],
  },
  {
    id: 'brand',
    label: 'Identité visuelle',
    keywords: ['identité', 'identite', 'marque', 'brand', 'logo', 'couleurs', 'charte'],
  },
  {
    id: 'visit',
    label: 'Visite',
    keywords: ['visite', 'mascotte', 'mascot', 'boussole', 'orienter'],
  },
  {
    id: 'integs',
    label: 'Intégrations',
    keywords: ['intégrations', 'integrations', 'moodle', 'lti'],
  },
  {
    id: 'aide',
    label: 'Aide & découverte',
    keywords: [
      'aide',
      'découverte',
      'decouverte',
      'narrateur',
      'olu',
      'tours',
      'visites guidées',
      'référence',
      'reference',
    ],
  },
  {
    id: 'ops',
    label: 'Usage & exploitation',
    keywords: [
      'usage',
      'exploitation',
      'ops',
      'logs',
      'diagnostic',
      'redémarrage',
      'redemarrage',
      'oauth',
      'sécurité',
      'securite',
    ],
  },
];

function pickSections(sections, ids) {
  const allowed = new Set(ids);
  return (sections || []).filter((s) => allowed.has(s.id));
}

function resolveInitialSection({ canReadSettings, canCarto }) {
  if (canReadSettings) return 'accueil';
  if (canCarto) return 'carto';
  return 'aide';
}

function summarizeDiagnostics(diag) {
  if (!diag || typeof diag !== 'object') return 'Diagnostic chargé.';
  const parts = [];
  if (diag.ok === true) parts.push('État global : OK');
  else if (diag.ok === false) parts.push('État global : problème détecté');
  if (diag.status != null && String(diag.status).trim()) {
    parts.push(`Statut : ${diag.status}`);
  }
  if (diag.summary != null && String(diag.summary).trim()) {
    parts.push(String(diag.summary));
  }
  if (diag.message != null && String(diag.message).trim()) {
    parts.push(String(diag.message));
  }
  return parts.length ? parts.join(' — ') : 'Diagnostic chargé (détail JSON ci-dessous).';
}

/**
 * Console de réglages administrateur.
 *
 * Droits : `admin.settings.read` / `.write`, `tours.manage`, `zones.manage`,
 * `map.manage_markers`, `integrations.moodle.manage`, `admin.settings.secrets.write`.
 * Les droits arrivent en props — `SessionContext` les exclut volontairement pour ne pas
 * réafficher des contrôles prof en vue élève.
 */
function SettingsAdminView({
  canReadSettings = true,
  canWriteSettings = true,
  canManageTours = false,
  canManageMoodle = false,
  canManageZones = false,
  canManageMarkers = false,
  canWriteSecrets = false,
}) {
  const { confirm } = useAppDialogs();
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);

  const canCarto = canReadSettings || canManageZones || canManageMarkers;
  const canAccessConsole = canReadSettings || canManageTours || canCarto;

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
  const [adminSection, setAdminSection] = useState(() =>
    resolveInitialSection({ canReadSettings, canCarto }),
  );
  const [cartoSub, setCartoSub] = useState('maps');
  const [aideSub, setAideSub] = useState(() =>
    canManageTours && !canReadSettings ? 'tours' : 'help',
  );

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
    [searchQuery, settingSections, roleTerms],
  );

  const searchActive = searchQuery.trim().length > 0;

  const searchTabHints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter((entry) => {
      if (entry.id === 'integs' && !canManageMoodle) return false;
      if (entry.id === 'carto' && !canCarto) return false;
      if (entry.id === 'aide' && !(canReadSettings || canManageTours)) return false;
      if (
        ['accueil', 'pedago', 'plan', 'brand', 'visit', 'ops'].includes(entry.id) &&
        !canReadSettings
      ) {
        return false;
      }
      const hay = [entry.label, ...entry.keywords].join(' ').toLowerCase();
      return hay.includes(q) || entry.keywords.some((k) => q.includes(k));
    });
  }, [searchQuery, canManageMoodle, canCarto, canReadSettings, canManageTours]);

  const topTabs = useMemo(() => {
    const tabs = [];
    if (canReadSettings) {
      tabs.push({ id: 'accueil', label: 'Accueil & modules' });
      tabs.push({ id: 'pedago', label: 'Pédagogie' });
    }
    if (canCarto) tabs.push({ id: 'carto', label: 'Cartographie' });
    if (canReadSettings) {
      tabs.push({ id: 'plan', label: 'Plan Lyautey' });
      tabs.push({ id: 'brand', label: 'Identité visuelle' });
      tabs.push({ id: 'visit', label: 'Visite' });
    }
    if (canManageMoodle) tabs.push({ id: 'integs', label: 'Intégrations' });
    if (canReadSettings || canManageTours) {
      tabs.push({ id: 'aide', label: 'Aide & découverte' });
    }
    if (canReadSettings) tabs.push({ id: 'ops', label: 'Usage & exploitation' });
    return tabs;
  }, [canReadSettings, canCarto, canManageMoodle, canManageTours]);

  const load = async () => {
    setErr('');
    setLoading(true);
    if (canReadSettings) {
      try {
        const data = await api('/api/settings/admin');
        setSettings(Array.isArray(data?.settings) ? data.settings : []);
        setMaps(Array.isArray(data?.maps) ? data.maps : []);
      } catch (e) {
        setErr(e.message || 'Impossible de charger les paramètres');
      }
      setLoading(false);
      return;
    }
    if (canCarto) {
      try {
        const data = await api('/api/maps');
        setSettings([]);
        setMaps(Array.isArray(data) ? data : Array.isArray(data?.maps) ? data.maps : []);
      } catch (e) {
        setErr(e.message || 'Impossible de charger les cartes');
      }
      setLoading(false);
      return;
    }
    setSettings([]);
    setMaps([]);
    setLoading(false);
  };

  const saveSetting = async (key, value, okMsg = 'Paramètre enregistré') => {
    if (!canWriteSettings) {
      setErr('Lecture seule…');
      return;
    }
    setErr('');
    setMsg('');
    setSavingKey(key);
    try {
      // PUT /api/settings/admin/:key renvoie { ok, key, value } avec la valeur
      // normalisée côté serveur : on met à jour la ligne localement plutôt que de
      // recharger tous les paramètres (et repasser par l'écran de chargement).
      const data = await api(`/api/settings/admin/${encodeURIComponent(key)}`, 'PUT', { value });
      if (data && Object.prototype.hasOwnProperty.call(data, 'value')) {
        setSettings((prev) =>
          prev.map((row) => (row.key === key ? { ...row, value: data.value } : row)),
        );
      } else {
        await load();
      }
      setMsg(okMsg);
    } catch (e) {
      // La validation croisée peut échouer après persistance : on resynchronise
      // l'état complet depuis le serveur avant d'afficher l'erreur.
      await load();
      setErr(e.message || 'Échec enregistrement');
    } finally {
      setSavingKey('');
    }
  };

  const renderSettingField = (row) => {
    const key = String(row.key || '');
    const value = get(key, row.default_value);
    const disabled = savingKey === key || !canWriteSettings;
    const label = resolveSettingLabel(key, roleTerms);
    const min = row?.constraints?.min;
    const max = row?.constraints?.max;
    const enumValues = Array.isArray(row?.constraints?.values) ? row.constraints.values : [];
    const isMapDefault = key.startsWith('ui.map.default_map_');
    const selectValues = isMapDefault ? (maps || []).map((m) => m.id) : enumValues;
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
            />{' '}
            {label}
            <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
              ({scopeLabel(row.scope)})
            </span>
          </label>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 3 }}>
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
            <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
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
                  ? (maps || []).find((m) => m.id === String(opt))?.label || String(opt)
                  : String(opt)}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 3 }}>
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

  const renderSettingsSearch = (scopedSections) => {
    const filtered = pickSections(filteredSettingSections, scopedSections);
    const count = countSectionRows(filtered);
    const totalInScope = countSectionRows(pickSections(settingSections, scopedSections));
    return (
      <>
        <div className="settings-admin-card" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Recherche dans les paramètres</label>
            <input
              type="text"
              value={searchQuery}
              placeholder="Ex: maintenance, oauth, jwt, carte, public…"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchTabHints.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
                Aller à :
              </span>
              {searchTabHints.map((hint) => (
                <button
                  key={hint.id}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAdminSection(hint.id)}
                >
                  {hint.label}
                </button>
              ))}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
              {count} paramètre(s) affiché(s) sur {totalInScope}
            </div>
            {searchQuery && (
              <button className="btn btn-secondary btn-sm" onClick={() => setSearchQuery('')}>
                Réinitialiser le filtre
              </button>
            )}
          </div>
        </div>
        <div className="settings-admin-grid">
          {filtered.map((section) => (
            <AdminSection
              key={section.id}
              id={section.id ?? section.title}
              title={section.title}
              defaultOpen={false}
              forceOpen={searchActive}
            >
              {section.rows.map((row) => renderSettingField(row))}
            </AdminSection>
          ))}
        </div>
        {count === 0 && (
          <div className="empty" style={{ marginTop: 12 }}>
            <p>Aucun paramètre ne correspond au filtre saisi.</p>
          </div>
        )}
      </>
    );
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadSettings, canCarto]);

  useEffect(() => {
    if (loading) return;
    let focus = null;
    try {
      focus = sessionStorage.getItem('foretmap:settings:focus');
    } catch (_) {
      /* ignore */
    }
    if (focus !== 'learning-gating') return;
    try {
      sessionStorage.removeItem('foretmap:settings:focus');
    } catch (_) {
      /* ignore */
    }
    if (adminSection !== 'pedago') {
      setAdminSection('pedago');
      return;
    }
    requestAnimationFrame(() => {
      const target = document.getElementById('settings-learning-gating');
      // Le panneau vit dans un accordéon (AdminSection) : on l'ouvre avant de
      // défiler — l'événement toggle natif déclenche la persistance côté composant.
      const details = target?.closest('details');
      if (details && !details.open) details.open = true;
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [loading, adminSection]);

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
    if (
      !(await confirm({
        message: 'Redémarrer l’application maintenant ?',
        confirmLabel: 'Redémarrer',
        danger: true,
      }))
    ) {
      return;
    }
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

  if (!canAccessConsole) {
    return (
      <div className="empty">
        <p>Vous n’avez pas accès à la console de paramètres.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="empty">
        <p>Chargement des paramètres admin…</p>
      </div>
    );
  }

  const allowRemoteLogs = get('ops.allow_remote_logs', true);
  const allowRemoteRestart = get('ops.allow_remote_restart', true);

  const renderCarto = () => {
    const cartoTabs = [
      ...(canReadSettings ? [{ id: 'maps', label: 'Cartes' }] : []),
      { id: 'locations', label: 'Zones & repères' },
      { id: 'categories', label: 'Catégories' },
      { id: 'routes', label: 'Parcours' },
      { id: 'messages', label: 'Messages' },
    ];
    const activeCarto = cartoTabs.some((t) => t.id === cartoSub)
      ? cartoSub
      : cartoTabs[0]?.id || 'locations';
    return (
      <>
        <div
          className="fm-subtabs settings-admin-subtabs"
          role="tablist"
          aria-label="Sous-sections cartographie"
        >
          {cartoTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeCarto === t.id}
              className={activeCarto === t.id ? 'is-active' : ''}
              onClick={() => setCartoSub(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeCarto === 'maps' && canReadSettings ? (
          <MapsAdminPanel
            maps={maps}
            get={get}
            saveSetting={saveSetting}
            savingKey={savingKey}
            canWrite={canWriteSettings}
            onMessage={(okMsg) => {
              setMsg(okMsg);
              setErr('');
            }}
            onError={(errMsg) => setErr(errMsg)}
            onMapsChanged={load}
          />
        ) : null}
        {activeCarto === 'locations' ? (
          <MapLocationsAdminPanel
            maps={maps}
            onMessage={(okMsg) => {
              setMsg(okMsg);
              setErr('');
            }}
            onError={(errMsg) => setErr(errMsg)}
          />
        ) : null}
        {activeCarto === 'categories' ? (
          <MapCategoriesPanel
            maps={maps}
            onMessage={(okMsg) => {
              setMsg(okMsg);
              setErr('');
            }}
            onError={(errMsg) => setErr(errMsg)}
          />
        ) : null}
        {activeCarto === 'routes' ? (
          <MapRoutesPanel
            maps={maps}
            onMessage={(okMsg) => {
              setMsg(okMsg);
              setErr('');
            }}
            onError={(errMsg) => setErr(errMsg)}
          />
        ) : null}
        {/* Les messages déposés sur un lieu se lisent ici, à côté des lieux eux-mêmes : c'est
            la seule vue qui répond à « qu'avons-nous reçu ? » sans rouvrir les fiches une par
            une (cf. `docs/AUDIT_COMMUNICATION_2026-09-18.md`). */}
        {activeCarto === 'messages' ? (
          <PlaceMessagesPanel onError={(errMsg) => setErr(errMsg)} />
        ) : null}
      </>
    );
  };

  const renderAide = () => {
    const aideTabs = [];
    if (canReadSettings) aideTabs.push({ id: 'help', label: "Bulles d'aide" });
    if (canReadSettings) aideTabs.push({ id: 'narrator', label: 'Narrateur OLU' });
    if (canManageTours) aideTabs.push({ id: 'tours', label: 'Visites guidées' });
    if (canReadSettings) aideTabs.push({ id: 'reference', label: 'Doc de référence' });
    const activeAide = aideTabs.some((t) => t.id === aideSub) ? aideSub : aideTabs[0]?.id || 'help';

    return (
      <>
        <div
          className="fm-subtabs settings-admin-subtabs"
          role="tablist"
          aria-label="Sous-sections aide"
        >
          {aideTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeAide === t.id}
              className={activeAide === t.id ? 'is-active' : ''}
              onClick={() => setAideSub(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeAide === 'help' && canReadSettings ? <ForetMapHelpContentAdminPanel /> : null}
        {activeAide === 'narrator' && canReadSettings ? <HelpNarratorAdminPanel /> : null}
        {activeAide === 'tours' ? (
          canManageTours ? (
            <DiscoveryTourAdminPanel />
          ) : (
            <div className="empty">
              <p>Cette section demande la permission « Édition visites guidées ».</p>
            </div>
          )
        ) : null}
        {activeAide === 'reference' && canReadSettings ? <ForetMapReferenceDocsPanel /> : null}
      </>
    );
  };

  return (
    <div className="fade-in settings-admin">
      <h2 className="section-title">
        <IconSettings size={20} /> Paramètres administrateur
      </h2>
      <p className="section-sub">
        Tout ce qui fait tourner l’app proprement : accueil, cartes, sécurité, exploitation.
      </p>
      {!canReadSettings && canManageTours ? (
        <div className="auth-success" role="status" style={{ marginBottom: 8 }}>
          Vous n’avez accès qu’aux Visites guidées.
        </div>
      ) : null}
      {!canReadSettings && canCarto ? (
        <div className="auth-success" role="status" style={{ marginBottom: 8 }}>
          Vous n’avez accès qu’à la Cartographie.
        </div>
      ) : null}
      {canReadSettings && !canWriteSettings ? (
        <div className="auth-success" role="status" style={{ marginBottom: 8 }}>
          Lecture seule : vous pouvez consulter les paramètres mais pas les modifier.
        </div>
      ) : null}
      {err && (
        <div className="auth-error">
          <IconWarning size={14} /> {err}
        </div>
      )}
      {msg && <div className="auth-success">{msg}</div>}
      <div
        className="fm-subtabs settings-admin-subtabs"
        role="tablist"
        aria-label="Sections paramètres"
      >
        {topTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={adminSection === t.id}
            className={adminSection === t.id ? 'is-active' : ''}
            onClick={() => setAdminSection(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {adminSection === 'accueil' && canReadSettings
        ? renderSettingsSearch(ACCUEIL_SECTION_IDS)
        : null}

      {adminSection === 'pedago' && canReadSettings ? (
        <>
          {renderSettingsSearch(PEDAGO_SECTION_IDS)}
          <AdminSection id="gating" title="Conditionnement pédagogique" defaultOpen={false}>
            <FMLearningGatingSettings get={get} saveSetting={saveSetting} savingKey={savingKey} />
          </AdminSection>
        </>
      ) : null}

      {adminSection === 'carto' && canCarto ? renderCarto() : null}

      {adminSection === 'plan' && canReadSettings ? (
        <>
          <PlanSettingsPanel
            maps={maps}
            get={get}
            saveSetting={saveSetting}
            savingKey={savingKey}
            canWrite={canWriteSettings}
            onMessage={(okMsg) => {
              setMsg(okMsg);
              setErr('');
              load();
            }}
            onError={(errMsg) => setErr(errMsg)}
          />
          {/* Les deux plans partagent leur carte et leurs lieux : les régler au même endroit
              évite d'avoir à se souvenir lequel des deux onglets on cherche. */}
          <h3 style={{ marginTop: 32 }}>Plan des personnels (proflyautey)</h3>
          <StaffPlanSettingsPanel
            maps={maps}
            get={get}
            saveSetting={saveSetting}
            savingKey={savingKey}
            canWrite={canWriteSettings}
            onMessage={(okMsg) => {
              setMsg(okMsg);
              setErr('');
              load();
            }}
            onError={(errMsg) => setErr(errMsg)}
          />
        </>
      ) : null}

      {adminSection === 'brand' && canReadSettings ? (
        <div className="settings-admin-grid">
          <ForetBrandEditor
            title="Marque ForetMap"
            value={get('ui.foret.brand', {})}
            defaults={FORETMAP_BRAND_DEFAULTS}
            disabled={!canWriteSettings}
            saving={savingKey === 'ui.foret.brand'}
            onSave={(next) => saveSetting('ui.foret.brand', next, 'Identité ForetMap enregistrée')}
          />
          <ForetBrandEditor
            title="Marque Plan Lyautey"
            value={get('ui.plan.brand', {})}
            defaults={PLAN_BRAND_DEFAULTS}
            disabled={!canWriteSettings}
            saving={savingKey === 'ui.plan.brand'}
            onSave={(next) => saveSetting('ui.plan.brand', next, 'Identité Plan enregistrée')}
          />
        </div>
      ) : null}

      {adminSection === 'visit' && canReadSettings ? (
        <AdminSection id="mascots" title="Mascottes de visite" defaultOpen>
          <label
            className="field"
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}
            data-testid="visit-heading-up-setting"
          >
            <input
              type="checkbox"
              checked={Boolean(get('ui.visit.heading_up_enabled', false))}
              disabled={savingKey === 'ui.visit.heading_up_enabled' || !canWriteSettings}
              onChange={(e) =>
                saveSetting(
                  'ui.visit.heading_up_enabled',
                  e.target.checked,
                  e.target.checked
                    ? 'Orientation boussole autorisée sur la Visite'
                    : 'Orientation boussole désactivée sur la Visite',
                )
              }
            />
            <span>
              Autoriser « Me situer » / « Orienter » sur la Visite (la carte affichée doit aussi
              l’autoriser dans son calage GPS).
            </span>
          </label>
          <CategoryIdsMultiSelect
            label="Catégories cochées d’office sur la Visite"
            value={get('ui.visit.default_category_ids', '')}
            disabled={!canWriteSettings || savingKey === 'ui.visit.default_category_ids'}
            hint="Les catégories sélectionnées sont pré-cochées pour les visiteurs."
            testId="visit-default-category-ids"
            onSave={(next) =>
              saveSetting(
                'ui.visit.default_category_ids',
                next,
                'Catégories Visite par défaut enregistrées',
              )
            }
          />
          <VisitMascotSettingsPanel
            defaultValue={get('ui.visit.mascot.default_id', '')}
            onSave={(key, value) => saveSetting(key, value, 'Réglages mascottes enregistrés')}
          />
        </AdminSection>
      ) : null}

      {adminSection === 'integs' && canManageMoodle ? (
        <MoodleAdminPanel
          get={get}
          saveSetting={saveSetting}
          savingKey={savingKey}
          onMessage={(okMsg) => {
            setMsg(okMsg);
            setErr('');
          }}
          onError={(errMsg) => setErr(errMsg)}
        />
      ) : null}

      {adminSection === 'aide' && (canReadSettings || canManageTours) ? renderAide() : null}

      {adminSection === 'ops' && canReadSettings ? (
        <>
          {renderSettingsSearch(OPS_SECTION_IDS)}
          <AdminSection id="user-tracking" title="Suivi utilisateurs" defaultOpen={false}>
            <UserTrackingPanel onError={(errMsg) => setErr(errMsg)} />
          </AdminSection>
          <AdminSection id="usage" title="Usage (compteurs anonymes)" defaultOpen={false}>
            <UsagePanel onError={(errMsg) => setErr(errMsg)} />
          </AdminSection>
          <div
            className="settings-admin-grid settings-admin-grid--single-on-mobile"
            style={{ marginTop: 12 }}
          >
            <AdminSection id="system" title="Actions système" defaultOpen={false}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={fetchSystemDiagnostics}>
                  Diagnostic complet
                </button>
                {allowRemoteLogs ? (
                  <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
                    Charger logs
                  </button>
                ) : null}
                <button className="btn btn-secondary btn-sm" onClick={fetchOauthDebug}>
                  Diagnostic OAuth
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={fetchSpeciesAutofillProvidersTest}
                  disabled={savingKey === 'species-autofill-test'}
                >
                  {savingKey === 'species-autofill-test'
                    ? 'Test…'
                    : 'Test connectivité (Pl@ntNet / OpenAI)'}
                </button>
                {canWriteSecrets && allowRemoteRestart ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={triggerRestart}
                    disabled={savingKey === 'restart'}
                  >
                    {savingKey === 'restart' ? '…' : 'Redémarrer'}
                  </button>
                ) : null}
              </div>
              <p
                style={{ margin: '8px 0 0', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}
              >
                Vérifie les clés <code>PLANTNET_API_KEY</code> et <code>OPENAI_API_KEY</code>{' '}
                définies sur le serveur (variables d’environnement). Aucune clé n’est affichée ni
                enregistrée ici.
              </p>
            </AdminSection>
          </div>

          {(logs.length > 0 || oauthDebug || speciesAutofillTest || systemDiagnostics) && (
            <AdminSection id="diagnostics" title="Diagnostics" defaultOpen={false}>
              {systemDiagnostics && (
                <div
                  style={{
                    marginBottom: oauthDebug || logs.length > 0 || speciesAutofillTest ? 8 : 0,
                  }}
                >
                  <p style={{ marginTop: 0, fontSize: 'var(--text-sm)' }}>
                    {summarizeDiagnostics(systemDiagnostics)}
                  </p>
                  <details>
                    <summary style={{ cursor: 'pointer', minHeight: 44 }}>
                      Détail technique (JSON)
                    </summary>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        maxHeight: 280,
                        overflow: 'auto',
                        fontSize: 'var(--text-sm)',
                        background: '#eff6ff',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      {JSON.stringify(systemDiagnostics, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
              {speciesAutofillTest && (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: 280,
                    overflow: 'auto',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--tint-success)',
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: oauthDebug || logs.length > 0 ? 8 : 0,
                  }}
                >
                  {JSON.stringify(speciesAutofillTest, null, 2)}
                </pre>
              )}
              {oauthDebug && (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: 220,
                    overflow: 'auto',
                    fontSize: 'var(--text-sm)',
                    background: '#f9fafb',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {JSON.stringify(oauthDebug, null, 2)}
                </pre>
              )}
              {logs.length > 0 && (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: 260,
                    overflow: 'auto',
                    fontSize: 'var(--text-xs)',
                    background: '#111827',
                    color: '#f9fafb',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {logs.join('\n')}
                </pre>
              )}
            </AdminSection>
          )}
        </>
      ) : null}
    </div>
  );
}

export { SettingsAdminView };
