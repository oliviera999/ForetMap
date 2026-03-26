import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { getRoleTerms } from '../utils/n3-terminology';

function AuditHistoryPanel({ roleTerms }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEntries = () => {
    setLoading(true);
    setError('');
    api('/api/audit?limit=100').then(setEntries).catch(err => {
      console.error('[ForetMap] audit', err);
      setError(err.message || 'Impossible de charger l’audit');
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const actionLabels = {
    validate_task: 'Validation tâche',
    delete_task: 'Suppression tâche',
    delete_student: `Suppression ${roleTerms.studentSingular}`,
    delete_log: 'Suppression rapport',
    create_task: 'Création tâche',
    update_task: 'Modification tâche',
    create_zone: 'Création zone',
    delete_zone: 'Suppression zone',
  };

  if (loading) return <div className="loader" style={{ height: '40vh' }}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;
  if (error) {
    return (
      <div className="empty">
        <div className="empty-icon">⚠️</div>
        <p>{error}</p>
        <button className="btn btn-sm btn-ghost" onClick={loadEntries}>Réessayer</button>
      </div>
    );
  }

  return (
    <>
      {entries.length === 0
        ? <div className="empty"><div className="empty-icon">📜</div><p>Aucune action enregistrée</p></div>
        : <div className="activity-list">
          {entries.map(e => (
            <div key={e.id} className="activity-item">
              <div className="activity-dot validated" />
              <div className="activity-info">
                <div className="activity-title">{actionLabels[e.action] || e.action}</div>
                <div className="activity-meta">
                  {e.details && `${e.details} · `}
                  {e.target_type} {e.target_id ? `#${e.target_id.slice(0, 8)}` : ''}
                  {' · '}{new Date(e.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      }
    </>
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

  if (loading) return <div className="loader" style={{ height: '40vh' }}><div className="loader-leaf">📊</div><p>Chargement...</p></div>;
  if (error) {
    return (
      <div className="empty">
        <div className="empty-icon">⚠️</div>
        <p>{error}</p>
        <button className="btn btn-sm btn-ghost" onClick={loadStats}>Réessayer</button>
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
        <article className="stat-card highlight">
          <div className="stat-icon">👣</div>
          <div className="stat-number">{Number(kpis.sessions_total || 0).toLocaleString('fr-FR')}</div>
          <div className="stat-label">Sessions de visite</div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{Number(kpis.completed_visits_total || 0).toLocaleString('fr-FR')}</div>
          <div className="stat-label">Visites terminées</div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-number">{Number(kpis.seen_actions_total || 0).toLocaleString('fr-FR')}</div>
          <div className="stat-label">Actions marquées vu</div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-number">{Number(kpis.completion_rate_pct || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%</div>
          <div className="stat-label">Complétion moyenne</div>
        </article>
      </div>

      <div className="activity-list audit-stats-details">
        <div className="activity-item">
          <div className="activity-info">
            <div className="activity-title">Cibles actives de la visite</div>
            <div className="activity-meta">
              Total: {Number(activeTargets.total || 0).toLocaleString('fr-FR')} · Zones: {Number(activeTargets.zones || 0).toLocaleString('fr-FR')} · Repères: {Number(activeTargets.markers || 0).toLocaleString('fr-FR')}
            </div>
          </div>
        </div>
        <div className="activity-item">
          <div className="activity-info">
            <div className="activity-title">{roleTerms.studentPlural.charAt(0).toUpperCase() + roleTerms.studentPlural.slice(1)} connectés</div>
            <div className="activity-meta">
              Sessions: {Number(students.sessions || 0).toLocaleString('fr-FR')} · Visites terminées: {Number(students.completed_visits || 0).toLocaleString('fr-FR')} · Complétion: {Number(students.completion_rate_pct || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%
            </div>
          </div>
        </div>
        <div className="activity-item">
          <div className="activity-info">
            <div className="activity-title">Visiteurs anonymes (24h)</div>
            <div className="activity-meta">
              Sessions: {Number(anonymous.sessions || 0).toLocaleString('fr-FR')} · Visites terminées: {Number(anonymous.completed_visits || 0).toLocaleString('fr-FR')} · Complétion: {Number(anonymous.completion_rate_pct || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditLog({ isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [subTab, setSubTab] = useState('history');

  return (
    <div className="fade-in">
      <h2 className="section-title">📜 Audit & Statistiques</h2>
      <p className="section-sub">Historique des actions {roleTerms.teacherShort} et indicateurs de visite.</p>
      <div className="top-tabs audit-subtabs">
        <button className={`top-tab ${subTab === 'history' ? 'active' : ''}`} onClick={() => setSubTab('history')}>
          📜 Historique
        </button>
        <button className={`top-tab ${subTab === 'visit-stats' ? 'active' : ''}`} onClick={() => setSubTab('visit-stats')}>
          📊 Stats visite
        </button>
      </div>
      {subTab === 'history' ? <AuditHistoryPanel roleTerms={roleTerms} /> : <VisitStatsPanel roleTerms={roleTerms} />}
    </div>
  );
}

export { AuditLog };
