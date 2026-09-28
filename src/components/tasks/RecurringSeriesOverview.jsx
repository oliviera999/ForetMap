import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../services/api.js';
import { TASK_STATUS_ENUM } from '../../shared/enums/taskEnums.js';

const RECURRENCE_LABELS = {
  weekly: 'Hebdo',
  biweekly: 'Bi-hebdo',
  monthly: 'Mensuelle',
};

/** « 04/06/2026 » : l'échéance courante peut être ancienne, l'année compte. */
function formatDueDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

/** Les abréviations de mois se terminent par un point : pas de second point final. */
function sentence(text) {
  return text.endsWith('.') ? text : `${text}.`;
}

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
 * Renvoie `null` quand le serveur n'a rien pu calculer ou que la série est à l'arrêt.
 */
export function previewLine(preview) {
  if (!preview || preview.already_spawned) return null;
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
  return sentence(`Prochaine occurrence ${fenetre}`);
}

/**
 * Jour où le job dupliquera la tâche. Le job ne passe qu'une fois par jour : pour une
 * tâche encore à valider, la date n'est tenue que si la validation arrive avant.
 */
export function spawnLine(preview, today = null) {
  if (!preview) return null;
  if (preview.already_spawned) {
    return preview.without_due
      ? 'Déjà dupliquée, mais la copie n’existe plus (supprimée ou archivée) : la série est à l’arrêt. Donnez une échéance à cette tâche pour la relancer.'
      : 'Déjà dupliquée pour cette échéance, mais la copie n’existe plus (supprimée ou archivée) : la série est à l’arrêt. Changez l’échéance de cette tâche pour la relancer.';
  }
  if (preview.without_due && preview.pending === 'validation') {
    return 'Duplication dès sa validation (un jour d’école).';
  }
  const raw = String(preview.spawn_date || '').trim();
  const spawn = formatOccurrenceDate(raw);
  if (!spawn) return null;
  const quand = today && raw === today ? 'aujourd’hui' : `le ${spawn}`;
  if (preview.pending === 'validation') {
    return `Duplication ${quand} au plus tôt, si elle est validée d’ici là.`;
  }
  return sentence(`Duplication prévue ${quand}`);
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
  // Le serveur borne sa liste : quand il le signale, une série sans prévision n'est pas une
  // série sans prochaine occurrence — c'est une série que le calcul n'a pas atteinte.
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewToday, setPreviewToday] = useState(null);
  const [automationEnabled, setAutomationEnabled] = useState(true);

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
        setPreviewTruncated(Boolean(data?.truncated));
        setPreviewToday(data?.today || null);
        setAutomationEnabled(data?.automation_enabled !== false);
      } catch {
        // Prévision indisponible : le panneau reste utile sans elle.
        if (!cancelled) {
          setPreviews(null);
          setPreviewTruncated(false);
          setPreviewToday(null);
          setAutomationEnabled(true);
        }
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
      // Tête = échéance la plus récente ; sans échéance, la dernière créée.
      const sorted = list
        .slice()
        .sort(
          (a, b) =>
            String(b.due_date || '').localeCompare(String(a.due_date || '')) ||
            String(b.created_at || '').localeCompare(String(a.created_at || '')),
        );
      const head = sorted[0];
      return {
        seriesId,
        title: head.title,
        recurrence: head.recurrence,
        count: list.length,
        latestDue: formatDueDate(head.due_date),
        status: TASK_STATUS_ENUM.labels[head.status] || head.status,
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
              className="btn btn-secondary recurring-series-overview-filter"
              onClick={onToggleRecurringFilter}
              aria-pressed={isRecurringFilterActive}
            >
              {isRecurringFilterActive ? 'Retirer le filtre récurrentes' : 'Filtrer récurrentes'}
            </button>
          )}
          {calendarLine && <p className="recurring-series-overview-calendar">{calendarLine}</p>}
          {!automationEnabled && (
            <p className="recurring-series-overview-calendar">
              Duplication automatique suspendue dans les réglages : aucune copie ne sera créée.
            </p>
          )}
          <ul className="recurring-series-overview-list">
            {rows.map((row) => {
              const prevision = previewLine(row.preview);
              const ancre = formatOccurrenceDate(row.preview?.anchor_date);
              const duplication =
                automationEnabled || row.preview?.already_spawned
                  ? spawnLine(row.preview, previewToday)
                  : null;
              return (
                <li key={row.seriesId}>
                  <span className="recurring-series-title">{row.title}</span>
                  <span className="recurring-series-meta">
                    {RECURRENCE_LABELS[row.recurrence] || row.recurrence} · {row.count} occ. ·{' '}
                    {row.latestDue ? `échéance ${row.latestDue}` : 'sans échéance'}
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
                  {!row.archived && duplication && (
                    <span
                      className={`recurring-series-next recurring-series-spawn${
                        row.preview?.already_spawned ? ' recurring-series-next--stopped' : ''
                      }`}
                    >
                      {duplication}
                    </span>
                  )}
                  {/* Sans ce repère, une série hors de la fenêtre de calcul s'affichait
                      exactement comme une série sans prochaine occurrence. */}
                  {!row.archived && !row.preview && previewTruncated && (
                    <span className="recurring-series-next recurring-series-next--unknown">
                      Prévision non calculée : trop de séries à traiter d’un coup.
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
