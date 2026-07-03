/**
 * Classement des élèves de TeacherStats : filtre par nom, rang réel
 * (médailles 🥇🥈🥉 sur le classement complet), badges de profil et
 * compteurs (validées/en attente/en cours/total/taux/biodiv/tutos).
 * Présentation pure : `students` est le classement complet déjà trié
 * côté serveur, le filtre de recherche est appliqué ici.
 */
import { useMemo } from 'react';
import { StudentAvatar } from '../student-avatar';

export function TeacherLeaderboard({ students = [], search = '', roleTerms }) {
  const filtered = useMemo(
    () =>
      students.filter((s) =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [students, search],
  );
  const maxDone = useMemo(() => Math.max(...students.map((s) => s.stats.done), 1), [students]);
  // Rang réel dans le classement complet : Map id → index (remplace un findIndex par ligne, O(n²)).
  const rankById = useMemo(() => {
    const ranks = new Map();
    students.forEach((s, i) => {
      if (!ranks.has(s.id)) ranks.set(s.id, i);
    });
    return ranks;
  }, [students]);
  const rankIcon = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
  const rankClass = (i) => (i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '');

  return (
    <div className="leaderboard">
      {filtered.length === 0 ? (
        <div className="empty" style={{ padding: 32 }}>
          <div className="empty-icon">👤</div>
          <p>
            {search
              ? `Aucun ${roleTerms.studentSingular} ne correspond à ta recherche`
              : `Aucun ${roleTerms.studentSingular} dans le classement pour l’instant`}
          </p>
        </div>
      ) : (
        filtered.map((s) => {
          const realRank = rankById.get(s.id) ?? -1;
          const completionRate =
            s.stats.total > 0 ? Math.round((s.stats.done / s.stats.total) * 100) : 0;
          return (
            <div key={s.id} className="lb-row" style={{ gap: 8 }}>
              <div className={`lb-rank ${rankClass(realRank)}`}>{rankIcon(realRank)}</div>
              <StudentAvatar student={s} size={30} style={{ border: '1px solid #ddd' }} />
              <div className="lb-name" style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {s.first_name} {s.last_name}
                </strong>
                {s.pseudo && (
                  <div
                    className="lb-pseudo"
                    style={{ fontSize: '.72rem', color: '#4b5563', marginTop: 1 }}
                  >
                    @{s.pseudo}
                  </div>
                )}
                {s.description && (
                  <div
                    className="lb-description"
                    style={{
                      fontSize: '.72rem',
                      color: '#6b7280',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 220,
                    }}
                    title={s.description}
                  >
                    {s.description}
                  </div>
                )}
                {s?.progression?.roleDisplayName && (
                  <div className="lb-profile-badge-wrap" style={{ marginTop: 2 }}>
                    <span
                      className="lb-profile-badge"
                      style={{
                        display: 'inline-block',
                        fontSize: '.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: '#ecfdf5',
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                      }}
                    >
                      Profil : {s.progression.roleEmoji ? `${s.progression.roleEmoji} ` : ''}
                      {s.progression.roleDisplayName}
                    </span>
                  </div>
                )}
                <small>
                  {s.last_seen
                    ? `Vu le ${new Date(s.last_seen).toLocaleDateString('fr-FR')}`
                    : 'Jamais connecté'}
                </small>
              </div>
              <div
                className="lb-stats"
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexShrink: 0,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                  maxWidth: '100%',
                }}
              >
                <div className="lb-stat lb-stat-done">
                  <div className="lb-stat-num" style={{ color: 'var(--sage)' }}>
                    {s.stats.done}
                  </div>
                  <div className="lb-stat-label">✅</div>
                </div>
                <div className="lb-stat lb-stat-submitted">
                  <div className="lb-stat-num" style={{ color: '#6366f1' }}>
                    {s.stats.submitted}
                  </div>
                  <div className="lb-stat-label">📋</div>
                </div>
                <div className="lb-stat lb-stat-pending">
                  <div className="lb-stat-num" style={{ color: '#f59e0b' }}>
                    {s.stats.pending}
                  </div>
                  <div className="lb-stat-label">⏳</div>
                </div>
                <div className="lb-stat lb-stat-total">
                  <div className="lb-stat-num">{s.stats.total}</div>
                  <div className="lb-stat-label">total</div>
                </div>
                <div
                  className="lb-stat lb-stat-rate"
                  title="Part des tâches validées sur le total des tâches prises"
                >
                  <div className="lb-stat-num" style={{ color: '#0f766e' }}>
                    {completionRate}%
                  </div>
                  <div className="lb-stat-label">🎯</div>
                </div>
                <div className="lb-stat" title="Espèces distinctes observées (fiches plantes)">
                  <div className="lb-stat-num" style={{ color: '#15803d' }}>
                    {Number(s.stats?.plant_species_observed ?? 0)}
                  </div>
                  <div className="lb-stat-label">🌿</div>
                </div>
                <div
                  className="lb-stat"
                  title="Nombre d’observations sur les fiches plantes (toutes espèces)"
                >
                  <div className="lb-stat-num" style={{ color: '#0369a1' }}>
                    {Number(s.stats?.plant_observation_events ?? 0)}
                  </div>
                  <div className="lb-stat-label">🔭</div>
                </div>
                <div className="lb-stat" title="Tutoriels marqués comme lus">
                  <div className="lb-stat-num" style={{ color: '#7c3aed' }}>
                    {Number(s.stats?.tutorials_read ?? 0)}
                  </div>
                  <div className="lb-stat-label">📖</div>
                </div>
                <div style={{ width: 60, display: 'none' }} className="lb-bar-desktop">
                  <div className="lb-bar-bg">
                    <div
                      className="lb-bar-fill"
                      style={{ width: `${(s.stats.done / maxDone) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
