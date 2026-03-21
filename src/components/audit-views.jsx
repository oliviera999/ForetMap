import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/audit?limit=100').then(setEntries).catch(err => {
      console.error('[ForetMap] audit', err);
    }).finally(() => setLoading(false));
  }, []);

  const actionLabels = {
    validate_task: 'Validation tâche',
    delete_task: 'Suppression tâche',
    delete_student: 'Suppression élève',
    delete_log: 'Suppression rapport',
    create_task: 'Création tâche',
    update_task: 'Modification tâche',
    create_zone: 'Création zone',
    delete_zone: 'Suppression zone',
  };

  if (loading) return <div className="loader" style={{ height: '40vh' }}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  return (
    <div className="fade-in">
      <h2 className="section-title">📜 Historique d'actions</h2>
      <p className="section-sub">Dernières actions effectuées en mode professeur</p>
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
    </div>
  );
}

export { AuditLog };
