import React from 'react';

import { daysUntil } from '../../utils/badges';
import { studentUrgentDueTasks } from '../../utils/taskSectioning.js';

/** Libellé court d'échéance du bandeau urgence (retard, aujourd'hui, demain, J+x). */
export function urgencyDueLabel(d) {
  if (d < 0) return `Retard ${-d}j`;
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Demain';
  return `${d} jours`;
}

/**
 * Bandeau « 🔥 Échéances proches » côté n3beur (O6, extrait de tasks-views).
 *
 * Calcule lui-même les tâches dues entre J-2 et J+3 via `studentUrgentDueTasks`
 * et n'affiche rien côté n3boss ou sans échéance proche.
 */
export function TaskUrgencyBanner({ isTeacher = false, tasks = [], maxItems = 5 }) {
  if (isTeacher) return null;
  const urgentTasks = studentUrgentDueTasks(tasks);
  if (urgentTasks.length === 0) return null;
  return (
    <div className="urgency-banner">
      <h4>🔥 Échéances proches</h4>
      {urgentTasks.slice(0, maxItems).map((t) => (
        <div key={t.id} className="urgency-item">
          <span className="urgency-days">{urgencyDueLabel(daysUntil(t.due_date))}</span>
          <span style={{ flex: 1, color: 'var(--forest)', fontWeight: 500 }}>{t.title}</span>
          {(t.zones_linked?.[0]?.name || t.zone_name) && (
            <span style={{ fontSize: '.76rem', color: '#aaa' }}>{t.zones_linked?.[0]?.name || t.zone_name}</span>
          )}
        </div>
      ))}
    </div>
  );
}
