import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../../services/api';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { getRoleTerms } from '../../utils/n3-terminology';
import { useSession } from '../../contexts/SessionContext.jsx';

const TOOLTIP_SECTIONS = [
  { id: 'header', label: 'En-tête' },
  { id: 'map', label: 'Carte' },
  { id: 'tasks', label: 'Tâches' },
  { id: 'plants', label: 'Biodiversité' },
  { id: 'visit', label: 'Visite' },
  { id: 'profiles', label: 'Profils' },
];

const PANEL_LABELS = {
  map: 'Carte',
  tasks: 'Tâches',
  plants: 'Biodiversité',
  visit: 'Visite',
  profiles: 'Profils et comptes',
  groups: 'Groupes',
  groupFilters: 'Filtre groupe',
};

const MAP_HINT_LABELS = {
  drawZoneMin: 'Tracé zone (min. points)',
  drawZoneReady: 'Tracé zone (prêt — `{count}`)',
  addMarker: 'Pose repère',
  editPoints: 'Édition contour',
  pageScroll: 'Gestes page + carte',
  gesturesActive: 'Gestes carte actifs',
};

const REALTIME_LABELS = {
  live: 'Temps réel actif',
  polling: 'Mode secours (polling)',
  connecting: 'Connexion…',
  offline: 'Hors ligne',
  noClient: 'Module indisponible',
};

function groupTooltipKeys(tooltips = {}) {
  const groups = {};
  for (const key of Object.keys(tooltips)) {
    const [zone, action] = key.split('.');
    if (!zone || !action) continue;
    if (!groups[zone]) groups[zone] = [];
    groups[zone].push({ key, action, entry: tooltips[key] });
  }
  for (const zone of Object.keys(groups)) {
    groups[zone].sort((a, b) => a.action.localeCompare(b.action));
  }
  return groups;
}

function updateNested(setDraft, path, value) {
  setDraft((prev) => {
    const next = JSON.parse(JSON.stringify(prev));
    let ref = next;
    for (let i = 0; i < path.length - 1; i += 1) {
      const part = path[i];
      if (!ref[part] || typeof ref[part] !== 'object') ref[part] = {};
      ref = ref[part];
    }
    ref[path[path.length - 1]] = value;
    return next;
  });
}

export function ForetMapHelpContentAdminPanel() {
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [draft, setDraft] = useState(null);
  const [section, setSection] = useState('tooltips');
  const [loadRevision, setLoadRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setError('');
    const data = await api('/api/settings/admin/help-content');
    setDraft(data);
    setLoadRevision((value) => value + 1);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Chargement impossible'));
  }, []);

  const persistHelp = useCallback(async () => {
    if (!draft) return draft;
    await api('/api/settings/admin/help-content', 'PUT', draft);
    setInfo('Bulles d’aide enregistrées.');
    return draft;
  }, [draft]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: draft,
    resetKey: loadRevision,
    enabled: draft != null,
    onSave: persistHelp,
  });

  async function resetDefaults() {
    if (!window.confirm('Réinitialiser tous les textes d’aide ForetMap aux valeurs par défaut ?'))
      return;
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/settings/admin/help-content/reset', 'POST');
      setDraft(data);
      setInfo('Textes réinitialisés.');
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return <p className="section-sub">Chargement des bulles d’aide…</p>;
  }

  const tooltipGroups = groupTooltipKeys(draft.tooltips);

  return (
    <div>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Tooltips, panneaux ?, mini-astuces, bandeaux carte et infobulles temps réel prof.
      </p>
      {error && <div className="auth-error">⚠️ {error}</div>}
      {saveError ? <div className="auth-error">⚠️ {saveError}</div> : null}
      {info && <div className="auth-success">{info}</div>}

      <nav className="gl-subtabs" style={{ marginBottom: 12 }}>
        {[
          ['tooltips', 'Tooltips'],
          ['panels', 'Panneaux ?'],
          ['quickTips', 'Mini-astuces'],
          ['chrome', 'Libellés'],
          ['mapCanvasHints', 'Bandeaux carte'],
          ['realtime', 'Temps réel prof'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? 'is-active' : ''}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        {section === 'tooltips' &&
          TOOLTIP_SECTIONS.map(({ id, label }) => (
            <details key={id} open style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{label}</summary>
              <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                {(tooltipGroups[id] || []).map(({ key, action, entry }) => (
                  <div key={key} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                    <div style={{ fontSize: '.78rem', color: '#64748b', marginBottom: 4 }}>
                      {action}
                    </div>
                    {'text' in entry || !entry.textTeacher ? (
                      <div className="field">
                        <label>{roleTerms.studentSingular}</label>
                        <textarea
                          rows={2}
                          value={entry.text || ''}
                          onChange={(e) =>
                            updateNested(setDraft, ['tooltips', key, 'text'], e.target.value)
                          }
                        />
                      </div>
                    ) : null}
                    {'textTeacher' in entry || entry.textTeacher !== undefined ? (
                      <div className="field">
                        <label>{roleTerms.teacherSingular}</label>
                        <textarea
                          rows={2}
                          value={entry.textTeacher || ''}
                          onChange={(e) =>
                            updateNested(setDraft, ['tooltips', key, 'textTeacher'], e.target.value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ))}

        {section === 'panels' &&
          Object.keys(PANEL_LABELS).map((panelId) => {
            const panel = draft.panels?.[panelId] || { title: '', items: [] };
            return (
              <details key={panelId} style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {PANEL_LABELS[panelId]}
                </summary>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Titre du panneau</label>
                  <input
                    type="text"
                    value={panel.title || ''}
                    onChange={(e) =>
                      updateNested(setDraft, ['panels', panelId, 'title'], e.target.value)
                    }
                  />
                </div>
                {(panel.items || []).map((item, index) => (
                  <div
                    key={`${panelId}-${index}`}
                    style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}
                  >
                    <div style={{ fontSize: '.78rem', color: '#64748b' }}>Point {index + 1}</div>
                    <div className="field">
                      <label>{roleTerms.studentSingular}</label>
                      <textarea
                        rows={2}
                        value={item.text || ''}
                        onChange={(e) => {
                          setDraft((prev) => {
                            const next = JSON.parse(JSON.stringify(prev));
                            next.panels[panelId].items[index].text = e.target.value;
                            return next;
                          });
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>{roleTerms.teacherSingular}</label>
                      <textarea
                        rows={2}
                        value={item.textTeacher || ''}
                        onChange={(e) => {
                          setDraft((prev) => {
                            const next = JSON.parse(JSON.stringify(prev));
                            next.panels[panelId].items[index].textTeacher = e.target.value;
                            return next;
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </details>
            );
          })}

        {section === 'quickTips' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              ['map', 'Carte'],
              ['tasks', 'Tâches'],
              ['visit', 'Visite'],
            ].map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <textarea
                  rows={2}
                  value={draft.quickTips?.[key] || ''}
                  onChange={(e) => updateNested(setDraft, ['quickTips', key], e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {section === 'chrome' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              ['hintPrefix', 'Préfixe astuce'],
              ['panelTitlePrefix', 'Préfixe titre panneau ?'],
              ['panelCloseCta', 'Bouton fermer'],
              ['panelDismissCta', 'Bouton ne plus afficher'],
            ].map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type="text"
                  value={draft.chrome?.[key] || ''}
                  onChange={(e) => updateNested(setDraft, ['chrome', key], e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {section === 'mapCanvasHints' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(MAP_HINT_LABELS).map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type="text"
                  value={draft.mapCanvasHints?.[key] || ''}
                  onChange={(e) => updateNested(setDraft, ['mapCanvasHints', key], e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {section === 'realtime' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(REALTIME_LABELS).map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <textarea
                  rows={2}
                  value={draft.realtime?.[key] || ''}
                  onChange={(e) => updateNested(setDraft, ['realtime', key], e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <AutoSaveStatus status={saveStatus} />
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={resetDefaults}>
          Réinitialiser aux défauts
        </button>
      </div>
    </div>
  );
}
