import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { downloadApiFile } from '../utils/downloadApiFile.js';
import { getRoleTerms } from '../utils/n3-terminology';
import { useSession } from '../contexts/SessionContext.jsx';
import {
  IconAudit,
  IconCheck,
  IconFootprints,
  IconGoal,
  IconLeaf,
  IconStats,
  IconTrend,
  IconWarning,
} from '../shared/icons.jsx';

function buildAuditActionLabels(roleTerms) {
  return {
    validate_task: 'Validation tâche',
    delete_task: 'Suppression tâche',
    delete_student: `Suppression ${roleTerms.studentSingular}`,
    delete_log: 'Suppression rapport',
    create_task: 'Création tâche',
    update_task: 'Modification tâche',
    create_zone: 'Création zone',
    update_zone: 'Modification zone',
    delete_zone: 'Suppression zone',
    create_plant: 'Création plante',
    update_plant: 'Modification plante',
    delete_plant: 'Suppression plante',
    create_marker: 'Création repère',
    update_marker: 'Modification repère',
    delete_marker: 'Suppression repère',
    create_group: 'Création groupe',
    update_group: 'Modification groupe',
    delete_group: 'Suppression groupe',
    create_tutorial: 'Création tutoriel',
    update_tutorial: 'Modification tutoriel',
    delete_tutorial: 'Désactivation tutoriel',
    visit_mascot_pack_create: 'Création pack mascotte',
    visit_mascot_pack_update: 'Modification pack mascotte',
    visit_mascot_pack_delete: 'Suppression pack mascotte',
    create_quiz: 'Création question QCM',
    update_quiz: 'Modification question QCM',
    food_web_create: 'Création lien trophique',
    food_web_update: 'Modification lien trophique',
    food_web_delete: 'Suppression lien trophique',
    auth_impersonate_start: 'Prise de contrôle compte',
    auth_impersonate_stop: 'Fin prise de contrôle',
  };
}

function defaultSecurityDayRange() {
  const to = new Date();
  const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function truncateUa(ua, max = 72) {
  const s = String(ua || '').trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function AuditHistoryPanel({ roleTerms }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEntries = () => {
    setLoading(true);
    setError('');
    api('/api/audit?limit=100')
      .then(setEntries)
      .catch((err) => {
        console.error('[ForetMap] audit', err);
        setError(err.message || 'Impossible de charger l’audit');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const actionLabels = buildAuditActionLabels(roleTerms);

  if (loading)
    return (
      <div className="loader" style={{ height: '40vh' }}>
        <div className="loader-leaf">
          <IconLeaf size={48} />
        </div>
        <p>Chargement…</p>
      </div>
    );
  if (error) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <IconWarning size={28} />
        </div>
        <p>{error}</p>
        <button className="btn btn-sm btn-ghost" onClick={loadEntries}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <>
      {entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconAudit size={28} />
          </div>
          <p>Aucune action enregistrée</p>
        </div>
      ) : (
        <div className="activity-list">
          {entries.map((e) => (
            <div key={e.id} className="activity-item">
              <div className="activity-dot validated" />
              <div className="activity-info">
                <div className="activity-title">{actionLabels[e.action] || e.action}</div>
                <div className="activity-meta">
                  {e.details && `${e.details} · `}
                  {e.target_type} {e.target_id ? `#${String(e.target_id).slice(0, 8)}` : ''}
                  {' · '}
                  {new Date(e.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SecurityEventsPanel({ roleTerms }) {
  const defaults = defaultSecurityDayRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [actorUserId, setActorUserId] = useState('');
  const [action, setAction] = useState('');
  const [ip, setIp] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  const actionLabels = buildAuditActionLabels(roleTerms);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (actorUserId.trim()) params.set('actorUserId', actorUserId.trim());
    if (action.trim()) params.set('action', action.trim());
    if (ip.trim()) params.set('ip', ip.trim());
    params.set('limit', '100');
    return params.toString();
  }, [from, to, actorUserId, action, ip]);

  const loadRows = useCallback(() => {
    setLoading(true);
    setError('');
    api(`/api/audit/security?${buildQuery()}`)
      .then((data) => {
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setTotal(Number(data?.total) || 0);
      })
      .catch((err) => {
        console.error('[ForetMap] security audit', err);
        setError(err.message || 'Impossible de charger le journal de sécurité');
      })
      .finally(() => setLoading(false));
  }, [buildQuery]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const exportFile = async (format) => {
    setExporting(format);
    try {
      const qs = `${buildQuery()}&format=${format}`;
      const stamp = `${from || 'debut'}_${to || 'fin'}`.replace(/[^0-9_-]/g, '');
      const filename = `foretmap-security-events-${stamp}.${format === 'json' ? 'json' : 'csv'}`;
      await downloadApiFile(`/api/audit/security/export?${qs}`, filename);
    } catch (err) {
      console.error('[ForetMap] security export', err);
      setError(err.message || 'Export impossible');
    } finally {
      setExporting('');
    }
  };

  return (
    <div className="fade-in">
      <p className="section-sub" style={{ marginBottom: 12 }}>
        Événements de sécurité avec adresse IP et navigateur. Réservé aux administrateurs. La
        déconnexion d’un compte n’efface pas cet historique.
      </p>
      <form
        className="fm-panel"
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          padding: 12,
          marginBottom: 14,
        }}
        onSubmit={(e) => {
          e.preventDefault();
          loadRows();
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Du
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Au
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Compte (id)
          <input
            type="text"
            className="input"
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            placeholder="identifiant utilisateur"
            autoComplete="off"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Action
          <input
            type="text"
            className="input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="préfixe, ex. auth.login"
            autoComplete="off"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          IP
          <input
            type="text"
            className="input"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="préfixe IP"
            autoComplete="off"
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <button type="submit" className="btn btn-sm">
            Filtrer
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={!!exporting}
            onClick={() => exportFile('csv')}
          >
            {exporting === 'csv' ? 'Export…' : 'Exporter CSV'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={!!exporting}
            onClick={() => exportFile('json')}
          >
            {exporting === 'json' ? 'Export…' : 'Exporter JSON'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="loader" style={{ height: '30vh' }}>
          <div className="loader-leaf">
            <IconLeaf size={48} />
          </div>
          <p>Chargement…</p>
        </div>
      ) : error ? (
        <div className="empty">
          <div className="empty-icon">
            <IconWarning size={28} />
          </div>
          <p>{error}</p>
          <button className="btn btn-sm btn-ghost" onClick={loadRows}>
            Réessayer
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconAudit size={28} />
          </div>
          <p>Aucun événement sur cette période</p>
        </div>
      ) : (
        <>
          <p className="section-sub" style={{ marginBottom: 8 }}>
            {total.toLocaleString('fr-FR')} événement{total > 1 ? 's' : ''} — affichage de{' '}
            {rows.length}
          </p>
          <div className="activity-list">
            {rows.map((e) => (
              <div key={e.id} className="activity-item">
                <div
                  className={`activity-dot ${e.result === 'failure' || e.result === 'fail' ? '' : 'validated'}`}
                />
                <div className="activity-info">
                  <div className="activity-title">{actionLabels[e.action] || e.action}</div>
                  <div className="activity-meta">
                    {e.actor_user_id ? `compte ${e.actor_user_id}` : 'sans compte'}
                    {e.actor_user_type ? ` (${e.actor_user_type})` : ''}
                    {' · '}
                    IP {e.ip_address || '—'}
                    {' · '}
                    {truncateUa(e.user_agent)}
                    {' · '}
                    {e.result || 'success'}
                    {' · '}
                    {e.occurred_at
                      ? new Date(e.occurred_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VisitStatsPanel({ roleTerms }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);

  const loadStats = () => {
    setLoading(true);
    setError('');
    api('/api/visit/stats')
      .then(setStats)
      .catch((err) => {
        console.error('[ForetMap] visit stats', err);
        setError(err.message || 'Impossible de charger les statistiques de visite');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading)
    return (
      <div className="loader" style={{ height: '40vh' }}>
        <div className="loader-leaf">
          <IconStats size={48} />
        </div>
        <p>Chargement…</p>
      </div>
    );
  if (error) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <IconWarning size={28} />
        </div>
        <p>{error}</p>
        <button className="btn btn-sm btn-ghost" onClick={loadStats}>
          Réessayer
        </button>
      </div>
    );
  }

  const kpis = stats?.kpis || {};
  const activeTargets = stats?.active_targets || {};
  const breakdown = stats?.breakdown || {};
  const students = breakdown.students || {};
  const anonymous = breakdown.anonymous || {};

  return (
    <div className="fade-in">
      <div className="stats-grid audit-stats-grid">
        <article className="fm-panel stat-card highlight">
          <div className="stat-icon">
            <IconFootprints size={20} />
          </div>
          <div className="stat-number">
            {Number(kpis.sessions_total || 0).toLocaleString('fr-FR')}
          </div>
          <div className="stat-label">Sessions de visite</div>
        </article>
        <article className="fm-panel stat-card">
          <div className="stat-icon">
            <IconCheck size={20} />
          </div>
          <div className="stat-number">
            {Number(kpis.completed_visits_total || 0).toLocaleString('fr-FR')}
          </div>
          <div className="stat-label">Visites terminées</div>
        </article>
        <article className="fm-panel stat-card">
          <div className="stat-icon">
            <IconGoal size={20} />
          </div>
          <div className="stat-number">
            {Number(kpis.seen_actions_total || 0).toLocaleString('fr-FR')}
          </div>
          <div className="stat-label">Actions marquées vu</div>
        </article>
        <article className="fm-panel stat-card">
          <div className="stat-icon">
            <IconTrend size={20} />
          </div>
          <div className="stat-number">
            {Number(kpis.completion_rate_pct || 0).toLocaleString('fr-FR', {
              maximumFractionDigits: 1,
            })}
            %
          </div>
          <div className="stat-label">Complétion moyenne</div>
        </article>
      </div>

      <div className="activity-list audit-stats-details">
        <div className="activity-item">
          <div className="activity-info">
            <div className="activity-title">Cibles actives de la visite</div>
            <div className="activity-meta">
              Total: {Number(activeTargets.total || 0).toLocaleString('fr-FR')} · Zones:{' '}
              {Number(activeTargets.zones || 0).toLocaleString('fr-FR')} · Repères:{' '}
              {Number(activeTargets.markers || 0).toLocaleString('fr-FR')}
            </div>
          </div>
        </div>
        <div className="activity-item">
          <div className="activity-info">
            <div className="activity-title">
              {roleTerms.studentPlural.charAt(0).toUpperCase() + roleTerms.studentPlural.slice(1)}{' '}
              connectés
            </div>
            <div className="activity-meta">
              Sessions: {Number(students.sessions || 0).toLocaleString('fr-FR')} · Visites
              terminées: {Number(students.completed_visits || 0).toLocaleString('fr-FR')} ·
              Complétion:{' '}
              {Number(students.completion_rate_pct || 0).toLocaleString('fr-FR', {
                maximumFractionDigits: 1,
              })}
              %
            </div>
          </div>
        </div>
        <div className="activity-item">
          <div className="activity-info">
            <div className="activity-title">Visiteurs anonymes (24h)</div>
            <div className="activity-meta">
              Sessions: {Number(anonymous.sessions || 0).toLocaleString('fr-FR')} · Visites
              terminées: {Number(anonymous.completed_visits || 0).toLocaleString('fr-FR')} ·
              Complétion:{' '}
              {Number(anonymous.completion_rate_pct || 0).toLocaleString('fr-FR', {
                maximumFractionDigits: 1,
              })}
              %
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditLog({ canReadSecurity = false }) {
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [subTab, setSubTab] = useState('history');

  return (
    <div className="fade-in">
      <h2 className="section-title">
        <IconAudit size={20} /> Audit & Statistiques
      </h2>
      <p className="section-sub">
        Historique des actions {roleTerms.teacherShort} et indicateurs de visite.
        {canReadSecurity
          ? ' Les administrateurs disposent aussi du journal de sécurité (IP, navigateur).'
          : ''}
      </p>
      <div className="fm-subtabs audit-subtabs" role="tablist" aria-label="Sections audit">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'history'}
          onClick={() => setSubTab('history')}
        >
          <IconAudit size={14} /> Historique
        </button>
        {canReadSecurity ? (
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'security'}
            onClick={() => setSubTab('security')}
          >
            <IconWarning size={14} /> Sécurité
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'visit-stats'}
          onClick={() => setSubTab('visit-stats')}
        >
          <IconStats size={14} /> Stats visite
        </button>
      </div>
      {subTab === 'history' ? (
        <AuditHistoryPanel roleTerms={roleTerms} />
      ) : subTab === 'security' && canReadSecurity ? (
        <SecurityEventsPanel roleTerms={roleTerms} />
      ) : (
        <VisitStatsPanel roleTerms={roleTerms} />
      )}
    </div>
  );
}

export { AuditLog };
