import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../services/api.js';

const RECURRENCE_LABELS = {
  weekly: 'Hebdo',
  biweekly: 'Bi-hebdo',
  monthly: 'Mensuelle',
};

/** « mar. 22 sept. » — le jour de semaine est l'information utile ici : c'est lui qui dérivait. */
export function formatOccurrenceDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Phrase de prévision d'une série : ce que le job posera, et ce qu'il attend pour le faire.
 * Renvoie `null` quand le serveur n'a rien pu calculer (série sans échéance exploitable).
 */
export function previewLine(preview) {
  if (!preview) return null;
  const next = formatOccurrenceDate(preview.next_start);
  const due = formatOccurrenceDate(preview.next_due);
  if (!next) return null;
  const fenetre = due && due !== next ? `${next} → ${due}` : next;
  if (preview.pending === 'validation') {
    return `Prochaine occurrence ${fenetre}, une fois celle-ci validée.`;
  }
  if (preview.pending === 'due_date') {
    return `Prochaine occurrence ${fenetre}, une fois l’échéance atteinte.`;
  }
  return `Prochaine occurrence ${fenetre}.`;
}

/**
 * Panneau n3boss/admin : aperçu des tâches récurrentes + statut calendrier du jour.
 *
 * Le cadre arrive **replié** (on n'affiche que le titre et le compte de séries) et se
 * déplie au clic sur son en-tête : la liste ne mange plus le haut de l'onglet Tâches.
 * Le filtre « Récurrentes seulement » n'est jamais appliqué à l'arrivée sur l'onglet —
 * il reste une action explicite, proposée dans le corps déplié et réversible d'un clic.
 */
export function RecurringSeriesOverview({
  isTeacher = false,
  tasks = [],
  onToggleRecurringFilter = null,
  isRecurringFilterActive = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [todayStatus, setTodayStatus] = useState(null);
  const bodyId = useId();
  const [previews, setPreviews] = useState(null);

  // Le calendrier scolaire n'est lu qu'au premier dépliage : replié, le cadre n'a
  // rien à en afficher, inutile de payer la requête à chaque visite de l'onglet.
  useEffect(() => {
    if (!isTeacher || !expanded) return undefined;
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
  }, [isTeacher, expanded]);

  // Prévision des prochaines occurrences : le calcul dépend du calendrier scolaire, qui
  // n'existe qu'en base — le front ne peut pas le refaire. Comme le statut du jour, elle
  // n'est demandée qu'au premier dépliage : repliée, la liste ne l'affiche pas.
  useEffect(() => {
    if (!isTeacher || !expanded) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/tasks/recurring-preview');
        if (cancelled) return;
        const bySeries = new Map();
        for (const row of data?.series || []) {
          if (row?.series_id) bySeries.set(String(row.series_id), row);
        }
        setPreviews(bySeries);
      } catch {
        // Prévision indisponible : le panneau reste utile sans elle.
        if (!cancelled) setPreviews(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, expanded]);

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
        preview: previews?.get(String(seriesId)) || null,
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
      <button
        type="button"
        className="recurring-series-overview-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <strong>Séries récurrentes</strong>
        <span>
          {bySeries.size} série{bySeries.size > 1 ? 's' : ''} · {recurring.length} occurrence
          {recurring.length > 1 ? 's' : ''}
        </span>
        <span className="recurring-series-overview-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="recurring-series-overview-body">
          {onToggleRecurringFilter && (
            <button
              type="button"
              className="btn-secondary recurring-series-overview-filter"
              onClick={onToggleRecurringFilter}
              aria-pressed={isRecurringFilterActive}
            >
              {isRecurringFilterActive ? 'Retirer le filtre récurrentes' : 'Filtrer récurrentes'}
            </button>
          )}
          {calendarLine && <p className="recurring-series-overview-calendar">{calendarLine}</p>}
          <ul className="recurring-series-overview-list">
            {rows.map((row) => {
              const prevision = previewLine(row.preview);
              const ancre = formatOccurrenceDate(row.preview?.anchor_date);
              return (
                <li key={row.seriesId}>
                  <span className="recurring-series-title">{row.title}</span>
                  <span className="recurring-series-meta">
                    {RECURRENCE_LABELS[row.recurrence] || row.recurrence} · {row.count} occ. ·
                    échéance {row.latestDue}
                    {row.archived ? ' · archivée' : ` · ${row.status}`}
                  </span>
                  {!row.archived && prevision && (
                    <span className="recurring-series-next">
                      {prevision}
                      {ancre && (
                        <span className="recurring-series-anchor">
                          {' '}
                          Rythme calé sur le {ancre.split(' ')[0]}
                        </span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {bySeries.size > rows.length && (
            <p className="recurring-series-overview-more">
              + {bySeries.size - rows.length} autre{bySeries.size - rows.length > 1 ? 's' : ''}{' '}
              série{bySeries.size - rows.length > 1 ? 's' : ''} — utilisez le filtre récurrence.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
