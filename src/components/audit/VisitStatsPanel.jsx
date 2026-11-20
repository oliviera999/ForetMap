import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import {
  IconCheck,
  IconFootprints,
  IconGoal,
  IconStats,
  IconTrend,
  IconWarning,
} from '../../shared/icons.jsx';

/** Indicateurs de la visite guidée (sous-onglet « Stats visite » de l'audit). */
export function VisitStatsPanel({ roleTerms }) {
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
  /** Compteurs agrégés sans identifiant (migration 374) : seule mesure au-delà de 24 h. */
  const anonymous30 = breakdown.anonymous_last_30_days || null;

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
        {anonymous30 ? (
          <div className="activity-item" data-testid="visit-stats-anonymous-30d">
            <div className="activity-info">
              <div className="activity-title">Visiteurs anonymes (30 jours, compteurs agrégés)</div>
              <div className="activity-meta">
                Sessions : {Number(anonymous30.sessions || 0).toLocaleString('fr-FR')} · Lieux vus :{' '}
                {Number(anonymous30.seen_actions || 0).toLocaleString('fr-FR')} · Visites terminées
                : {Number(anonymous30.completed_visits || 0).toLocaleString('fr-FR')}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
