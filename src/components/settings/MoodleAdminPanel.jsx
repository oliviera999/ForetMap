import { useCallback, useEffect, useState } from 'react';
import { moodleAdminApi, isNotConfiguredError } from '../../services/moodleAdminApi.js';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { AdminSection } from '../../shared/components/AdminSection.jsx';
import { MoodleStatusCard, MoodleCheckReport } from './moodle/MoodleStatusCard.jsx';
import { MoodlePoliciesEditor } from './moodle/MoodlePoliciesEditor.jsx';
import { MoodleChapterCoursesTable } from './moodle/MoodleChapterCoursesTable.jsx';
import { MoodleRunForm } from './moodle/MoodleRunForm.jsx';
import { MoodleRunReport } from './moodle/MoodleRunReport.jsx';
import { MoodlePendingMatches } from './moodle/MoodlePendingMatches.jsx';
import { MoodleConflicts } from './moodle/MoodleConflicts.jsx';
import { MoodleRunHistory } from './moodle/MoodleRunHistory.jsx';
import { MoodleToolsCard } from './moodle/MoodleToolsCard.jsx';
import { MoodleLtiSection } from './moodle/MoodleLtiSection.jsx';

export function remoteMoodleErrorMessage(error) {
  if (isNotConfiguredError(error)) {
    return 'Intégration Moodle non configurée : renseigner MOODLE_BASE_URL et MOODLE_WS_TOKEN dans .env puis redémarrer.';
  }
  const raw = String(error?.message || '').trim();
  if (/Wasm|mémoire Wasm|CloudLinux/i.test(raw)) {
    return 'Moodle injoignable : le serveur n’a pas assez de mémoire pour le moteur HTTP de Node (limite de l’hébergeur). Un redéploiement est nécessaire.';
  }
  if (raw && !/^Erreur serveur/i.test(raw)) return raw;
  return 'Moodle injoignable (erreur serveur). Vérifier le jeton, la joignabilité du site, puis les journaux si ça persiste.';
}

export const MOODLE_SETTING_KEYS = Object.freeze({
  enabled: 'integration.moodle.enabled',
  yearPrefix: 'integration.moodle.year_prefix',
  emailDomains: 'integration.moodle.email_domains',
  policies: 'integration.moodle.policies',
  chapterCourses: 'integration.moodle.chapter_courses',
  thresholdCreatePct: 'integration.moodle.threshold_create_pct',
  thresholdDeactivatePct: 'integration.moodle.threshold_deactivate_pct',
  thresholdDeactivateAbs: 'integration.moodle.threshold_deactivate_abs',
  thresholdNamematchPct: 'integration.moodle.threshold_namematch_pct',
  thresholdOutboundRemoveAbs: 'integration.moodle.threshold_outbound_remove_abs',
});

const THRESHOLD_FIELDS = [
  [MOODLE_SETTING_KEYS.thresholdCreatePct, 'Créations max (% des élèves actifs)'],
  [MOODLE_SETTING_KEYS.thresholdDeactivatePct, 'Désactivations max (%)'],
  [MOODLE_SETTING_KEYS.thresholdDeactivateAbs, 'Désactivations max (nombre)'],
  [MOODLE_SETTING_KEYS.thresholdNamematchPct, 'Rapprochements par le nom max (%)'],
  [MOODLE_SETTING_KEYS.thresholdOutboundRemoveAbs, 'Retraits poussés vers Moodle max (nombre)'],
];

/**
 * Onglet « Moodle » de la console administrateur (lot M3, section 13 du chantier).
 *
 * `get` / `saveSetting` / `savingKey` viennent de `SettingsAdminView` : les réglages
 * `integration.moodle.*` sont édités ici (la grille générique ne sait pas éditer un `json`).
 * Tout ce qui parle à Moodle est grisé tant que `.env` ne porte pas l'URL et le jeton.
 */
export function MoodleAdminPanel({ get, saveSetting, savingKey, onMessage, onError }) {
  const { confirm } = useAppDialogs();
  const [status, setStatus] = useState(null);
  const [checkReport, setCheckReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [cohorts, setCohorts] = useState([]);
  const [courses, setCourses] = useState({ rows: [], chapters: [] });
  const [selectedIds, setSelectedIds] = useState([]);
  const [teams, setTeams] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const [lastDryRun, setLastDryRun] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [runs, setRuns] = useState({ items: [], total: 0 });
  const [pending, setPending] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remoteError, setRemoteError] = useState('');

  const report = useCallback((error, fallback) => onError?.(error?.message || fallback), [onError]);

  const loadLocal = useCallback(async () => {
    const [st, list, pend, conf] = await Promise.all([
      moodleAdminApi.status(),
      moodleAdminApi.runs({ limit: 20 }),
      moodleAdminApi.pendingMatches(),
      moodleAdminApi.conflicts(),
    ]);
    setStatus(st);
    setRuns({ items: list.items || [], total: list.total || 0 });
    setPending(pend.items || []);
    setConflicts(conf.items || []);
    return st;
  }, []);

  const loadRemote = useCallback(async () => {
    setRemoteError('');
    try {
      const [coh, crs] = await Promise.all([moodleAdminApi.cohorts(), moodleAdminApi.courses()]);
      setCohorts(coh.cohorts || []);
      setCourses({ rows: crs.rows || [], chapters: crs.chapters || [] });
    } catch (error) {
      setCohorts([]);
      setRemoteError(remoteMoodleErrorMessage(error));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const st = await loadLocal();
      if (st?.configured) await loadRemote();
      else setRemoteError('Intégration Moodle non configurée (URL et jeton absents de .env).');
    } catch (error) {
      report(error, 'Impossible de charger l’état du lien Moodle');
    }
    setLoading(false);
  }, [loadLocal, loadRemote, report]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const check = async () => {
    setChecking(true);
    try {
      const result = await moodleAdminApi.check();
      setCheckReport(result);
      setStatus(await moodleAdminApi.status());
      onMessage?.(result.ok ? 'Connexion Moodle vérifiée' : 'Contrôle terminé avec des problèmes');
      if (result.ok) await loadRemote();
    } catch (error) {
      report(error, 'Contrôle impossible');
    }
    setChecking(false);
  };

  const toggleCohort = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAll = () => {
    const eligible = cohorts.filter((c) => c.policyKey).map((c) => c.id);
    setSelectedIds((prev) => (prev.length === eligible.length ? [] : eligible));
  };

  const launch = async (mode, { force, forceReason }) => {
    if (mode === 'apply') {
      const ok = await confirm({
        message: `Appliquer la synchronisation sur ${selectedIds.length} cohorte(s) ? Les écritures sont journalisées et annulables, sauf les écritures vers Moodle.`,
        danger: true,
      });
      if (!ok) return;
    }
    setRunning(true);
    try {
      const result = await moodleAdminApi.startRun({
        mode,
        cohortIds: selectedIds,
        teams,
        force: Boolean(force),
        forceReason: force ? forceReason : undefined,
      });
      const run = {
        id: result.runId,
        mode,
        status: result.status,
        startedAt: result.startedAt || new Date().toISOString(),
        report: result.report,
        scope: result.report?.scope,
      };
      setCurrentRun(run);
      if (mode === 'dry_run') setLastDryRun(run);
      else setLastDryRun(null);
      onMessage?.(
        mode === 'dry_run'
          ? `Simulation #${result.runId} terminée`
          : `Exécution #${result.runId} : ${result.status}`,
      );
      await loadLocal();
    } catch (error) {
      report(error, 'Exécution refusée');
    }
    setRunning(false);
  };

  const openRun = async (id) => {
    try {
      const run = await moodleAdminApi.run(id);
      setCurrentRun(run);
    } catch (error) {
      report(error, 'Rapport introuvable');
    }
  };

  const undo = async (id) => {
    const ok = await confirm({
      message: `Annuler l’exécution #${id} ? Les comptes créés seront désactivés (jamais supprimés), les groupes et classes G&L créés retirés.`,
      danger: true,
    });
    if (!ok) return;
    setUndoing(true);
    try {
      const result = await moodleAdminApi.undoRun(id);
      onMessage?.(`Exécution #${id} annulée : ${result.undone} action(s) défaites`);
      await openRun(id);
      await loadLocal();
    } catch (error) {
      report(error, 'Annulation refusée');
    }
    setUndoing(false);
  };

  const decidePending = async (id, body) => {
    setBusyId(id);
    try {
      await moodleAdminApi.decidePendingMatch(id, body);
      onMessage?.('Décision enregistrée');
      setPending(await moodleAdminApi.pendingMatches().then((r) => r.items || []));
    } catch (error) {
      report(error, 'Décision refusée');
    }
    setBusyId(null);
  };

  const resolveConflict = async (id, resolution) => {
    setBusyId(id);
    try {
      await moodleAdminApi.resolveConflict(id, resolution);
      onMessage?.('Conflit tranché');
      setConflicts(await moodleAdminApi.conflicts().then((r) => r.items || []));
      setStatus(await moodleAdminApi.status());
    } catch (error) {
      report(error, 'Résolution refusée');
    }
    setBusyId(null);
  };

  const saveAndRefresh = async (key, value, okMsg) => {
    await saveSetting(key, value, okMsg);
    setStatus(await moodleAdminApi.status().catch(() => status));
    if (key === MOODLE_SETTING_KEYS.chapterCourses && status?.configured) await loadRemote();
  };

  if (loading && !status) {
    return (
      <div className="empty">
        <p>Chargement du lien Moodle…</p>
      </div>
    );
  }

  const configured = Boolean(status?.configured);

  return (
    <div className="moodle-admin" data-testid="moodle-admin-panel">
      <MoodleStatusCard
        status={status}
        checking={checking}
        onCheck={check}
        savingEnabled={savingKey === MOODLE_SETTING_KEYS.enabled}
        onToggleEnabled={(checked) =>
          saveAndRefresh(
            MOODLE_SETTING_KEYS.enabled,
            checked,
            checked ? 'Synchronisation activée' : 'Synchronisation désactivée',
          )
        }
      />
      {remoteError && (
        <div className="auth-error" data-testid="moodle-remote-error">
          {remoteError}
        </div>
      )}
      <MoodleCheckReport report={checkReport} />

      <AdminSection id="moodle-run" title="Synchroniser" defaultOpen>
        <MoodleRunForm
          cohorts={cohorts}
          selectedIds={selectedIds}
          onToggleCohort={toggleCohort}
          onSelectAll={selectAll}
          teams={teams}
          onToggleTeams={setTeams}
          lastDryRun={lastDryRun}
          running={running}
          configured={configured}
          enabled={Boolean(status?.enabled)}
          onSimulate={(opts) => launch('dry_run', opts)}
          onApply={(opts) => launch('apply', opts)}
        />
        <MoodleRunReport run={currentRun} onUndo={undo} undoing={undoing} />
      </AdminSection>

      <AdminSection
        id="moodle-pending"
        title={`Rapprochements en attente (${pending.length})`}
        defaultOpen={pending.length > 0}
      >
        <MoodlePendingMatches items={pending} onDecide={decidePending} busyId={busyId} />
      </AdminSection>

      <AdminSection
        id="moodle-conflicts"
        title={`Conflits à trancher (${conflicts.length})`}
        defaultOpen={conflicts.length > 0}
      >
        <MoodleConflicts items={conflicts} onResolve={resolveConflict} busyId={busyId} />
      </AdminSection>

      <AdminSection id="moodle-history" title="Historique des exécutions" defaultOpen={false}>
        <MoodleRunHistory
          runs={runs.items}
          total={runs.total}
          onOpen={openRun}
          selectedId={currentRun?.id}
        />
      </AdminSection>

      <AdminSection id="moodle-policies" title="Politiques par cohorte" defaultOpen={false}>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="moodle-year-prefix">Préfixe d’année des cohortes</label>
          <input
            id="moodle-year-prefix"
            type="text"
            maxLength={8}
            defaultValue={get(MOODLE_SETTING_KEYS.yearPrefix, '26')}
            key={`yp-${get(MOODLE_SETTING_KEYS.yearPrefix, '26')}`}
            disabled={savingKey === MOODLE_SETTING_KEYS.yearPrefix}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== get(MOODLE_SETTING_KEYS.yearPrefix, '26')) {
                saveAndRefresh(MOODLE_SETTING_KEYS.yearPrefix, next, 'Préfixe d’année enregistré');
              }
            }}
          />
        </div>
        <div className="field" style={{ maxWidth: 480 }}>
          <label htmlFor="moodle-email-domains">
            Domaines d’e-mail acceptés (séparés par des virgules, vide = tous)
          </label>
          <input
            id="moodle-email-domains"
            type="text"
            defaultValue={get(MOODLE_SETTING_KEYS.emailDomains, '')}
            key={`ed-${get(MOODLE_SETTING_KEYS.emailDomains, '')}`}
            disabled={savingKey === MOODLE_SETTING_KEYS.emailDomains}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== get(MOODLE_SETTING_KEYS.emailDomains, '')) {
                saveSetting(MOODLE_SETTING_KEYS.emailDomains, next, 'Domaines enregistrés');
              }
            }}
          />
        </div>
        <MoodlePoliciesEditor
          value={get(MOODLE_SETTING_KEYS.policies, [])}
          saving={savingKey === MOODLE_SETTING_KEYS.policies}
          onSave={(policies) =>
            saveAndRefresh(MOODLE_SETTING_KEYS.policies, policies, 'Politiques enregistrées')
          }
        />
      </AdminSection>

      <AdminSection id="moodle-courses" title="Chapitres G&L → cours Moodle" defaultOpen={false}>
        <MoodleChapterCoursesTable
          value={get(MOODLE_SETTING_KEYS.chapterCourses, {})}
          courses={courses.rows}
          chapters={courses.chapters}
          saving={savingKey === MOODLE_SETTING_KEYS.chapterCourses}
          disabled={false}
          onSave={(table) =>
            saveAndRefresh(
              MOODLE_SETTING_KEYS.chapterCourses,
              table,
              'Table chapitre → cours enregistrée',
            )
          }
        />
      </AdminSection>

      <AdminSection id="moodle-thresholds" title="Seuils de sécurité" defaultOpen={false}>
        <p className="section-sub" style={{ marginTop: 0 }}>
          Au-delà d’un seuil, l’exécution s’arrête avant toute écriture ; seul « forcer » avec un
          motif passe outre.
        </p>
        <div className="moodle-thresholds">
          {THRESHOLD_FIELDS.map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`moodle-th-${key}`}>{label}</label>
              <input
                id={`moodle-th-${key}`}
                type="number"
                min={0}
                key={`${key}-${get(key, '')}`}
                defaultValue={get(key, '')}
                disabled={savingKey === key}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next !== Number(get(key, NaN))) {
                    saveSetting(key, next, 'Seuil enregistré');
                  }
                }}
              />
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection id="moodle-lti" title="Entrée depuis le cours" defaultOpen={false}>
        <MoodleLtiSection
          get={get}
          saveSetting={saveSetting}
          savingKey={savingKey}
          courses={courses.rows}
          onMessage={onMessage}
          onError={onError}
        />
      </AdminSection>

      <AdminSection
        id="moodle-tools"
        title="Outils : hors synchronisation, fusion de comptes"
        defaultOpen={false}
      >
        <MoodleToolsCard onMessage={onMessage} onError={onError} />
      </AdminSection>
    </div>
  );
}
