import React, { useState, useEffect, useCallback } from 'react';
import { API, api } from '../services/api';
import { statusBadge } from '../utils/badges';

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast">{msg}</div>;
}

function StudentStats({ student }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api(`/api/stats/me/${student.id}`).then(setData).catch(err => {
      console.error('[ForetMap] stats élève', err);
    });
  }, [student.id]);

  if (!data) return <div className="loader" style={{ height: '60vh' }}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  const { stats, assignments } = data;
  const RANKS = [
    { min: 0, label: '🪨 Nouveau', color: '#94a3b8' },
    { min: 1, label: '🌱 Débutant', color: '#86efac' },
    { min: 5, label: '🌿 Actif', color: '#52b788' },
    { min: 10, label: '🏆 Expert', color: '#1a4731' },
  ];
  const currentRank = [...RANKS].reverse().find(r => stats.done >= r.min) || RANKS[0];
  const nextRank = RANKS[RANKS.indexOf(currentRank) + 1];
  const progressPct = nextRank
    ? Math.min(100, ((stats.done - currentRank.min) / (nextRank.min - currentRank.min)) * 100)
    : 100;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 className="section-title">📊 Mes statistiques</h2>
        <span style={{ background: 'var(--parchment)', borderRadius: 20, padding: '4px 12px', fontSize: '.8rem', fontWeight: 600, color: 'var(--soil)' }}>{currentRank.label}</span>
      </div>
      <p className="section-sub">Bonjour {data.first_name} ! Voici ton bilan dans la forêt.</p>

      <div className="rank-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--forest)' }}>{currentRank.label}</span>
          {nextRank && <span style={{ fontSize: '.76rem', color: '#aaa' }}>Prochain : {nextRank.label} ({nextRank.min - stats.done} tâche{nextRank.min - stats.done > 1 ? 's' : ''} restante{nextRank.min - stats.done > 1 ? 's' : ''})</span>}
          {!nextRank && <span style={{ fontSize: '.76rem', color: currentRank.color, fontWeight: 600 }}>Rang maximum atteint !</span>}
        </div>
        <div className="rank-bar-bg">
          <div className="rank-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="rank-steps">
          {RANKS.map(r => (
            <span key={r.min} className={stats.done >= r.min ? 'current' : ''}>{r.label.split(' ')[0]}</span>
          ))}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{stats.done}</div>
          <div className="stat-label">Tâches validées</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-number">{stats.pending}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-number">{stats.submitted}</div>
          <div className="stat-label">En attente prof</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🌱</div>
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total prises</div>
        </div>
      </div>

      <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: '1.1rem', marginBottom: 12, color: 'var(--forest)' }}>Activité récente</h3>
      <div className="activity-list">
        {assignments.length === 0
          ? <div className="empty"><div className="empty-icon">🌿</div><p>Aucune tâche prise pour l'instant</p></div>
          : assignments.slice(0, 10).map((a, i) => (
            <div key={i} className="activity-item">
              <div className={`activity-dot ${a.status}`} />
              <div className="activity-info">
                <div className="activity-title">{a.title}</div>
                <div className="activity-meta">
                  {a.zone_name && `📍 ${a.zone_name} · `}
                  {new Date(a.assigned_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </div>
              </div>
              {statusBadge(a.status)}
            </div>
          ))
        }
      </div>
    </div>
  );
}

function TeacherStats() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmStudent, setConfirmStudent] = useState(null);

  const load = useCallback(() => api('/api/stats/all').then(setData).catch(err => {
    console.error('[ForetMap] stats tous', err);
    setToast('Impossible de charger les statistiques.');
  }), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e.detail && e.detail.domain === 'students') load();
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [load]);

  const deleteStudent = async (s) => {
    setConfirmStudent(s);
  };

  const confirmDelete = async () => {
    const s = confirmStudent;
    setConfirmStudent(null);
    try {
      await api(`/api/students/${s.id}`, 'DELETE');
      setToast(`${s.first_name} ${s.last_name} supprimé`);
      await load();
    } catch (e) { setToast('Erreur : ' + e.message); }
  };

  if (!data) return <div className="loader" style={{ height: '60vh' }}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  const filtered = data.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const maxDone = Math.max(...data.map(s => s.stats.done), 1);
  const rankIcon = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
  const rankClass = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

  const totalValidated = data.reduce((s, d) => s + d.stats.done, 0);
  const totalPending = data.reduce((s, d) => s + d.stats.pending, 0);
  const activeStudents = data.filter(d => d.stats.total > 0).length;

  return (
    <div className="fade-in">
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {confirmStudent && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmStudent(null)}>
          <div className="log-modal fade-in" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>Supprimer l'élève ?</h3>
            <p style={{ fontSize: '.95rem', color: '#444', marginBottom: 6, lineHeight: 1.5 }}>
              <strong>{confirmStudent.first_name} {confirmStudent.last_name}</strong>
            </p>
            <p style={{ fontSize: '.85rem', color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
              Ses assignations de tâches seront également supprimées.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={confirmDelete}>Supprimer</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmStudent(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 className="section-title">📊 Gestion des élèves</h2>
      </div>
      <p className="section-sub">{data.length} élève{data.length > 1 ? 's' : ''} inscrits</p>

      <div className="export-row">
        <button className="btn btn-secondary btn-sm" onClick={() => {
          const token = localStorage.getItem('foretmap_teacher_token');
          const link = document.createElement('a');
          link.href = API + '/api/stats/export';
          const headers = new Headers();
          if (token) headers.set('Authorization', 'Bearer ' + token);
          fetch(API + '/api/stats/export', { headers })
            .then(r => r.blob())
            .then(blob => {
              link.href = URL.createObjectURL(blob);
              link.download = `foretmap-stats-${new Date().toISOString().slice(0, 10)}.csv`;
              link.click();
              URL.revokeObjectURL(link.href);
            })
            .catch(() => setToast('Erreur lors de l\'export'));
        }}>
          📥 Exporter CSV
        </button>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="stat-card highlight">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{totalValidated}</div>
          <div className="stat-label">Tâches validées</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-number">{totalPending}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-number">{activeStudents}</div>
          <div className="stat-label">Actifs</div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un élève..."
          style={{ background: 'white' }} />
      </div>

      <div className="leaderboard">
        {filtered.length === 0
          ? <div className="empty" style={{ padding: 32 }}>
            <div className="empty-icon">👤</div>
            <p>{search ? 'Aucun élève trouvé' : 'Aucun élève inscrit'}</p>
          </div>
          : filtered.map((s) => {
            const realRank = data.findIndex(d => d.id === s.id);
            return (
              <div key={s.id} className="lb-row" style={{ gap: 8 }}>
                <div className={`lb-rank ${rankClass(realRank)}`}>{rankIcon(realRank)}</div>
                <div className="lb-name" style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.first_name} {s.last_name}</strong>
                  <small>
                    {s.last_seen
                      ? `Vu le ${new Date(s.last_seen).toLocaleDateString('fr-FR')}`
                      : 'Jamais connecté'}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div className="lb-stat">
                    <div className="lb-stat-num" style={{ color: 'var(--sage)' }}>{s.stats.done}</div>
                    <div className="lb-stat-label">✅</div>
                  </div>
                  <div className="lb-stat">
                    <div className="lb-stat-num" style={{ color: '#f59e0b' }}>{s.stats.pending}</div>
                    <div className="lb-stat-label">⏳</div>
                  </div>
                  <div className="lb-stat">
                    <div className="lb-stat-num">{s.stats.total}</div>
                    <div className="lb-stat-label">total</div>
                  </div>
                  <div style={{ width: 60, display: 'none' }} className="lb-bar-desktop">
                    <div className="lb-bar-bg">
                      <div className="lb-bar-fill" style={{ width: `${(s.stats.done / maxDone) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <button className="btn btn-danger btn-sm"
                  style={{ flexShrink: 0 }}
                  onClick={() => deleteStudent(s)}
                  title={`Supprimer ${s.first_name}`}>
                  🗑️
                </button>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

export { StudentStats, TeacherStats };
