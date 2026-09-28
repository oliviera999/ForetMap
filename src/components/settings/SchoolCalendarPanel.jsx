import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';
import {
  PERIOD_KIND_LABELS,
  WEEKDAYS,
  describeOpenWeekdays,
  formatPeriodRange,
  groupCalendarPeriods,
} from '../../utils/schoolCalendarPeriods.js';

const ADD_ACTIONS = Object.freeze([
  { value: 'vacation', label: 'Fermer — vacances', action: 'close', kind: 'vacation' },
  { value: 'holiday', label: 'Fermer — jour férié', action: 'close', kind: 'holiday' },
  { value: 'closed', label: 'Fermer — fermeture exceptionnelle', action: 'close', kind: 'closed' },
  { value: 'extra_open', label: 'Ouvrir exceptionnellement', action: 'open', kind: null },
]);

const EMPTY_PERIOD_FORM = Object.freeze({ type: 'vacation', from: '', to: '', label: '' });
const EMPTY_YEAR_FORM = Object.freeze({ label: '', starts_on: '', ends_on: '' });

function sameWeekdays(a, b) {
  const x = [...a].sort().join(',');
  const y = [...b].sort().join(',');
  return x === y;
}

/**
 * « Calendrier scolaire » — jours ouvrables, congés, fériés et fermetures.
 *
 * C'est ce calendrier qui décide quand le job duplique les tâches récurrentes (jamais un
 * jour fermé) et sur quels jours tombent les échéances des copies. Chaque action écrit
 * immédiatement côté serveur ; aucune sauvegarde globale.
 *
 * @param {{
 *   canWrite?: boolean,
 *   confirm?: ((opts: object) => Promise<boolean>)|null,
 *   onError?: ((msg: string) => void)|null,
 * }} props
 */
export function SchoolCalendarPanel({ canWrite = false, confirm = null, onError = null }) {
  const [data, setData] = useState(null);
  const [yearId, setYearId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [weekdays, setWeekdays] = useState([]);
  const [periodForm, setPeriodForm] = useState(EMPTY_PERIOD_FORM);
  const [yearForm, setYearForm] = useState(EMPTY_YEAR_FORM);

  const report = useCallback(
    (msg) => {
      setError(msg);
      if (msg) onError?.(msg);
    },
    [onError],
  );

  const load = useCallback(
    async (wantedYearId) => {
      setLoading(true);
      try {
        const query = wantedYearId ? `?year_id=${encodeURIComponent(wantedYearId)}` : '';
        const res = await api(`/api/school-calendar/admin${query}`);
        setData(res);
        setYearId(res?.year_id ?? null);
        setWeekdays(Array.isArray(res?.open_weekdays) ? res.open_weekdays : []);
      } catch (e) {
        report(e?.message || 'Impossible de charger le calendrier scolaire.');
      } finally {
        setLoading(false);
      }
    },
    [report],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const years = data?.years || [];
  const currentYear = years.find((y) => y.id === yearId) || null;
  const savedWeekdays = data?.open_weekdays || [];
  const weekdaysDirty = !sameWeekdays(weekdays, savedWeekdays);
  const periods = useMemo(() => groupCalendarPeriods(data?.days || []), [data]);

  const run = async (key, work, successMessage) => {
    setBusy(key);
    setMessage('');
    setError('');
    try {
      await work();
      setMessage(successMessage);
      await load(yearId);
      return true;
    } catch (e) {
      report(e?.message || 'Modification impossible.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggleWeekday = (value) => {
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const saveWeekdays = async () => {
    if (weekdays.length === 0) {
      report('Cochez au moins un jour ouvrable.');
      return;
    }
    if (
      confirm &&
      !(await confirm({
        message: `Jours ouvrables : ${describeOpenWeekdays(weekdays)}. Les jours ordinaires des années en cours et à venir seront recalculés ; les congés, fériés et ouvertures exceptionnelles sont conservés.`,
        confirmLabel: 'Appliquer',
      }))
    ) {
      return;
    }
    await run(
      'weekdays',
      () => api('/api/school-calendar/weekdays', 'PUT', { open_weekdays: weekdays }),
      'Jours ouvrables enregistrés.',
    );
  };

  const addPeriod = async (event) => {
    event.preventDefault();
    const choice = ADD_ACTIONS.find((a) => a.value === periodForm.type) || ADD_ACTIONS[0];
    const to = periodForm.to || periodForm.from;
    const ok = await run(
      'period',
      () =>
        api('/api/school-calendar/days', 'PUT', {
          from: periodForm.from,
          to,
          action: choice.action,
          kind: choice.kind,
          label: periodForm.label,
        }),
      choice.action === 'open' ? 'Ouverture exceptionnelle ajoutée.' : 'Fermeture ajoutée.',
    );
    if (ok) setPeriodForm(EMPTY_PERIOD_FORM);
  };

  const resetPeriod = async (period) => {
    const what = PERIOD_KIND_LABELS[period.kind] || 'Période';
    if (
      confirm &&
      !(await confirm({
        message: `${what} ${formatPeriodRange(period)} : revenir aux jours ouvrables habituels ?`,
        confirmLabel: 'Annuler la période',
        danger: true,
      }))
    ) {
      return;
    }
    await run(
      `reset:${period.from}`,
      () =>
        api('/api/school-calendar/days', 'PUT', {
          from: period.from,
          to: period.to,
          action: 'reset',
        }),
      'Période annulée : retour aux jours ouvrables.',
    );
  };

  const createYear = async (event) => {
    event.preventDefault();
    const ok = await run(
      'year',
      () => api('/api/school-calendar/years', 'POST', yearForm),
      `Année scolaire « ${yearForm.label} » créée.`,
    );
    if (ok) setYearForm(EMPTY_YEAR_FORM);
  };

  if (loading && !data) return <p className="section-sub">Chargement du calendrier scolaire…</p>;

  return (
    <div className="school-calendar-panel" data-testid="school-calendar-panel">
      <p className="section-sub">
        Le calendrier scolaire décide des jours où l’application duplique les tâches récurrentes
        (jamais un jour fermé) et des jours sur lesquels tombent leurs échéances.
        {data?.today?.today
          ? ` Aujourd’hui (${data.today.today}) : ${data.today.isOpen ? 'jour ouvert' : 'jour fermé'}.`
          : ''}
      </p>
      {message ? (
        <p className="school-calendar-panel__message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="school-calendar-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="school-calendar-panel__block" aria-labelledby="school-calendar-weekdays">
        <h4 id="school-calendar-weekdays">Jours ouvrables</h4>
        <p className="section-sub">
          Jours d’école ordinaires de la semaine. Un changement s’applique aux années en cours et à
          venir, sans toucher aux congés ni aux ouvertures exceptionnelles déjà saisis.
        </p>
        <div className="school-calendar-panel__weekdays" role="group" aria-label="Jours ouvrables">
          {WEEKDAYS.map((w) => (
            <label key={w.value} className="school-calendar-panel__weekday">
              <input
                type="checkbox"
                checked={weekdays.includes(w.value)}
                onChange={() => toggleWeekday(w.value)}
                disabled={!canWrite}
                aria-label={w.long}
              />
              {w.short}
            </label>
          ))}
        </div>
        {canWrite ? (
          <Button
            variant="primary"
            size="sm"
            onClick={saveWeekdays}
            disabled={!weekdaysDirty}
            loading={busy === 'weekdays'}
          >
            Enregistrer les jours ouvrables
          </Button>
        ) : null}
      </section>

      <section className="school-calendar-panel__block" aria-labelledby="school-calendar-periods">
        <h4 id="school-calendar-periods">Congés et fermetures</h4>
        {years.length > 1 ? (
          <div className="field">
            <label htmlFor="school-calendar-year">Année scolaire</label>
            <select
              id="school-calendar-year"
              value={yearId ?? ''}
              onChange={(e) => load(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {currentYear ? (
          <p className="section-sub">
            Année {currentYear.label} : du {currentYear.starts_on} au {currentYear.ends_on}.
          </p>
        ) : (
          <p className="section-sub">
            Aucune année scolaire : créez-en une ci-dessous pour saisir des congés.
          </p>
        )}
        {currentYear && periods.length === 0 ? (
          <p className="section-sub">Aucun congé ni fermeture sur cette année.</p>
        ) : null}
        {periods.length > 0 ? (
          <ul className="school-calendar-panel__periods">
            {periods.map((p) => (
              <li key={`${p.from}-${p.kind}`} className="school-calendar-panel__period">
                <span>
                  <strong>{PERIOD_KIND_LABELS[p.kind] || p.kind}</strong>
                  {p.label ? ` « ${p.label} »` : ''} {formatPeriodRange(p)}
                </span>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetPeriod(p)}
                    loading={busy === `reset:${p.from}`}
                    aria-label={`Annuler : ${PERIOD_KIND_LABELS[p.kind] || p.kind} ${formatPeriodRange(p)}`}
                  >
                    Annuler
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {canWrite && currentYear ? (
          <form className="school-calendar-panel__form" onSubmit={addPeriod}>
            <div className="field">
              <label htmlFor="school-calendar-type">Ajouter</label>
              <select
                id="school-calendar-type"
                value={periodForm.type}
                onChange={(e) => setPeriodForm((f) => ({ ...f, type: e.target.value }))}
              >
                {ADD_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="school-calendar-from">Du</label>
              <input
                id="school-calendar-from"
                type="date"
                required
                min={currentYear.starts_on}
                max={currentYear.ends_on}
                value={periodForm.from}
                onChange={(e) => setPeriodForm((f) => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="school-calendar-to">Au (inclus, vide = un seul jour)</label>
              <input
                id="school-calendar-to"
                type="date"
                min={periodForm.from || currentYear.starts_on}
                max={currentYear.ends_on}
                value={periodForm.to}
                onChange={(e) => setPeriodForm((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="school-calendar-label">Libellé (facultatif)</label>
              <input
                id="school-calendar-label"
                type="text"
                maxLength={128}
                placeholder="Ex. : Vacances de la Toussaint"
                value={periodForm.label}
                onChange={(e) => setPeriodForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!periodForm.from}
              loading={busy === 'period'}
            >
              Ajouter
            </Button>
          </form>
        ) : null}
      </section>

      {canWrite ? (
        <section
          className="school-calendar-panel__block"
          aria-labelledby="school-calendar-new-year"
        >
          <h4 id="school-calendar-new-year">Nouvelle année scolaire</h4>
          <p className="section-sub">
            Les jours sont créés d’après les jours ouvrables ; ajoutez ensuite les congés. Au-delà
            des années saisies, seuls les jours ouvrables s’appliquent.
          </p>
          <form className="school-calendar-panel__form" onSubmit={createYear}>
            <div className="field">
              <label htmlFor="school-calendar-year-label">Libellé</label>
              <input
                id="school-calendar-year-label"
                type="text"
                required
                maxLength={64}
                placeholder="Ex. : 2027-2028"
                value={yearForm.label}
                onChange={(e) => setYearForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="school-calendar-year-start">Début</label>
              <input
                id="school-calendar-year-start"
                type="date"
                required
                value={yearForm.starts_on}
                onChange={(e) => setYearForm((f) => ({ ...f, starts_on: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="school-calendar-year-end">Fin</label>
              <input
                id="school-calendar-year-end"
                type="date"
                required
                min={yearForm.starts_on || undefined}
                value={yearForm.ends_on}
                onChange={(e) => setYearForm((f) => ({ ...f, ends_on: e.target.value }))}
              />
            </div>
            <Button type="submit" variant="secondary" size="sm" loading={busy === 'year'}>
              Créer l’année
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
