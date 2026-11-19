import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { useLatestRequest } from '../../shared/hooks/useLatestRequest.js';
import { IconAudit, IconLeaf, IconWarning } from '../../shared/icons.jsx';
import { AuditFiltersBar } from './AuditFiltersBar.jsx';
import { AuditEventRow } from './AuditEventRow.jsx';
import { dayGroupLabel, dayKey, defaultDayRange, filtersToParams } from './auditFormat.js';
import { useAuditCatalog } from './useAuditCatalog.js';

const PAGE_SIZE = 50;

export function defaultEventFilters() {
  return {
    ...defaultDayRange(),
    mode: 'main',
    category: '',
    result: '',
    actorQuery: '',
    actorUserId: '',
    q: '',
    action: '',
    ip: '',
  };
}

/** Regroupe les événements par jour local, dans l'ordre reçu (plus récents d'abord). */
export function groupEventsByDay(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    const key = dayKey(row.occurred_at);
    if (!current || current.key !== key) {
      current = { key, label: dayGroupLabel(row.occurred_at), rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

/**
 * Liste filtrée d'un journal : historique (`audit`, sans IP) ou sécurité (`security`, avec
 * IP, navigateur et export). `locked` force des filtres (fiche utilisateur) et `hide` masque
 * les champs correspondants.
 *
 * @param {{ source: 'audit'|'security', roleTerms: object, locked?: object, hide?: string[],
 *   initialFilters?: object, onSelectActor?: (actor: object) => void, actorChipLabel?: string,
 *   intro?: import('react').ReactNode }} props
 */
export function AuditEventsPanel({
  source,
  roleTerms,
  locked = null,
  hide = [],
  initialFilters = null,
  onSelectActor,
  actorChipLabel = '',
  intro = null,
}) {
  const categories = useAuditCatalog();
  const isSecurity = source === 'security';
  const endpoint = isSecurity ? '/api/audit/security' : '/api/audit/history';
  const [filters, setFilters] = useState(() => ({
    ...defaultEventFilters(),
    ...(initialFilters || {}),
  }));
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const latest = useLatestRequest();

  const lockedKey = JSON.stringify(locked || {});
  const query = useMemo(() => {
    const merged = { ...filters, ...JSON.parse(lockedKey) };
    if (!isSecurity) delete merged.ip;
    if (merged.mode !== 'all') delete merged.action;
    return merged;
  }, [filters, lockedKey, isSecurity]);

  const load = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    setError('');
    try {
      const data = await api(`${endpoint}?${filtersToParams(query, { limit: PAGE_SIZE })}`);
      if (!isCurrent()) return;
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      if (!isCurrent()) return;
      console.error('[ForetMap] journal', err);
      setError(err.message || 'Impossible de charger le journal');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [endpoint, query, latest]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    const isCurrent = latest();
    setLoadingMore(true);
    try {
      const data = await api(
        `${endpoint}?${filtersToParams(query, { limit: PAGE_SIZE, offset: rows.length })}`,
      );
      if (!isCurrent()) return;
      const more = Array.isArray(data?.rows) ? data.rows : [];
      setRows((prev) => [...prev, ...more]);
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      if (isCurrent()) setError(err.message || 'Impossible de charger la suite');
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  };

  const exportFile = async (format) => {
    setExporting(format);
    try {
      const qs = filtersToParams(query, { format });
      const stamp = `${filters.from || 'debut'}_${filters.to || 'fin'}`.replace(/[^0-9_-]/g, '');
      const filename = `foretmap-security-events-${stamp}.${format === 'json' ? 'json' : 'csv'}`;
      await downloadApiFile(`/api/audit/security/export?${qs}`, filename);
    } catch (err) {
      console.error('[ForetMap] security export', err);
      setError(err.message || 'Export impossible');
    } finally {
      setExporting('');
    }
  };

  const groups = useMemo(() => groupEventsByDay(rows), [rows]);
  const extended = filters.mode === 'all';

  return (
    <div className="fade-in">
      {intro}
      <AuditFiltersBar
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onReset={() =>
          setFilters({ ...defaultEventFilters(), ...(initialFilters || {}), actorUserId: '' })
        }
        categories={categories}
        showIp={isSecurity}
        hide={hide}
        actorChipLabel={filters.actorUserId ? actorChipLabel || 'compte sélectionné' : ''}
        actions={
          isSecurity ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={!!exporting}
                onClick={() => exportFile('csv')}
              >
                {exporting === 'csv' ? 'Export…' : 'Exporter CSV'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={!!exporting}
                onClick={() => exportFile('json')}
              >
                {exporting === 'json' ? 'Export…' : 'Exporter JSON'}
              </button>
            </>
          ) : null
        }
      />

      {loading ? (
        <div className="loader" style={{ height: '30vh' }}>
          <div className="loader-leaf">
            <IconLeaf size={48} />
          </div>
          <p>Chargement…</p>
        </div>
      ) : error && rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconWarning size={28} />
          </div>
          <p>{error}</p>
          <button className="btn btn-sm btn-ghost" onClick={load}>
            Réessayer
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconAudit size={28} />
          </div>
          <p>
            Aucun événement pour ces filtres
            {filters.mode === 'main' ? ' — essayez la vue étendue.' : '.'}
          </p>
        </div>
      ) : (
        <>
          <p className="section-sub audit-count" aria-live="polite">
            {total.toLocaleString('fr-FR')} événement{total > 1 ? 's' : ''}
            {filters.mode === 'main' ? ' principaux' : ''} — {rows.length.toLocaleString('fr-FR')}{' '}
            affiché{rows.length > 1 ? 's' : ''}
          </p>
          <div className="audit-days">
            {groups.map((g) => (
              <section key={g.key} className="audit-day">
                <h3 className="audit-day-title">{g.label}</h3>
                <ul className="audit-events">
                  {g.rows.map((e) => (
                    <AuditEventRow
                      key={e.id}
                      event={e}
                      roleTerms={roleTerms}
                      extended={extended}
                      showIp={isSecurity}
                      onSelectActor={onSelectActor}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {error ? <p className="audit-inline-error">{error}</p> : null}
          {rows.length < total ? (
            <div className="audit-more">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore
                  ? 'Chargement…'
                  : `Afficher plus (${(total - rows.length).toLocaleString('fr-FR')} restants)`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
