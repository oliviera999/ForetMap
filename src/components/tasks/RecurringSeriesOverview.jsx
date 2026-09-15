import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api.js';

const RECURRENCE_LABELS = {
  weekly: 'Hebdo',
  biweekly: 'Bi-hebdo',
  monthly: 'Mensuelle',
};

/**
 * Panneau n3boss/admin : aperçu des tâches récurrentes + statut calendrier du jour.
 */
export function RecurringSeriesOverview({
  isTeacher = false,
  tasks = [],
  onFocusRecurring = null,
}) {
  const [todayStatus, setTodayStatus] = useState(null);

  useEffect(() => {
    if (!isTeacher) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/school-calendar');
        if (!cancelled) setTodayStatus(data?.today || null);
      } catch {
        if (!cancelled) setTodayStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher]);

  const recurring = useMemo(
    () =>
      (tasks || []).filter((t) => {
        const r = String(t.recurrence || '').trim();
        return r === 'weekly' || r === 'biweekly' || r === 'monthly';
      }),
    [tasks],
  );

  if (!isTeacher || recurring.length === 0) return null;

  const bySeries = new Map();
  for (const t of recurring) {
    const sid = String(t.recurrence_series_id || t.id);
    if (!bySeries.has(sid)) bySeries.set(sid, []);
    bySeries.get(sid).push(t);
  }

  const rows = [...bySeries.entries()]
    .map(([seriesId, list]) => {
      const sorted = list
        .slice()
        .sort((a, b) => String(b.due_date || '').localeCompare(String(a.due_date || '')));
      const head = sorted[0];
      return {
        seriesId,
        title: head.title,
        recurrence: head.recurrence,
        count: list.length,
        latestDue: head.due_date || '—',
        status: head.status,
        archived: Boolean(head.archived_at),
      };
    })
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'))
    .slice(0, 12);

  const calendarLine = todayStatus
    ? todayStatus.isOpen
      ? `Aujourd’hui (${todayStatus.today}) : jour ouvré scolaire — duplication possible.`
      : `Aujourd’hui (${todayStatus.today}) : jour fermé (${todayStatus.kind || 'fermé'}) — pas de duplication automatique.`
    : null;

  return (
    <section className="recurring-series-overview" aria-label="Séries récurrentes">
      <div className="recurring-series-overview-head">
        <strong>Séries récurrentes</strong>
        <span>
          {bySeries.size} série{bySeries.size > 1 ? 's' : ''} · {recurring.length} occurrence
          {recurring.length > 1 ? 's' : ''}
        </span>
        {onFocusRecurring && (
          <button type="button" className="btn-secondary" onClick={onFocusRecurring}>
            Filtrer récurrentes
          </button>
        )}
      </div>
      {calendarLine && <p className="recurring-series-overview-calendar">{calendarLine}</p>}
      <ul className="recurring-series-overview-list">
        {rows.map((row) => (
          <li key={row.seriesId}>
            <span className="recurring-series-title">{row.title}</span>
            <span className="recurring-series-meta">
              {RECURRENCE_LABELS[row.recurrence] || row.recurrence} · {row.count} occ. · échéance{' '}
              {row.latestDue}
              {row.archived ? ' · archivée' : ` · ${row.status}`}
            </span>
          </li>
        ))}
      </ul>
      {bySeries.size > rows.length && (
        <p className="recurring-series-overview-more">
          + {bySeries.size - rows.length} autre{bySeries.size - rows.length > 1 ? 's' : ''} série
          {bySeries.size - rows.length > 1 ? 's' : ''} — utilisez le filtre récurrence.
        </p>
      )}
    </section>
  );
}
