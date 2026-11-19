import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useLatestRequest } from '../../shared/hooks/useLatestRequest.js';
import { IconAudit, IconLeaf, IconWarning } from '../../shared/icons.jsx';
import { AuditFiltersBar } from './AuditFiltersBar.jsx';
import { AuditEventsPanel } from './AuditEventsPanel.jsx';
import {
  actorName,
  defaultDayRange,
  filtersToParams,
  formatDateTime,
  summarizeUserAgent,
  userTypeLabel,
} from './auditFormat.js';
import { useAuditCatalog } from './useAuditCatalog.js';

const PAGE_SIZE = 50;

const SORTS = Object.freeze([
  { id: 'recent', label: 'Activité la plus récente' },
  { id: 'count', label: 'Les plus actifs' },
  { id: 'failures', label: 'Le plus d’échecs' },
]);

function defaultUserFilters() {
  return {
    ...defaultDayRange(),
    mode: 'all',
    category: '',
    result: '',
    actorQuery: '',
    actorType: '',
    sort: 'recent',
  };
}

function Loader() {
  return (
    <div className="loader" style={{ height: '30vh' }}>
      <div className="loader-leaf">
        <IconLeaf size={48} />
      </div>
      <p>Chargement…</p>
    </div>
  );
}

function UserBadges({ user, roleTerms }) {
  const type = userTypeLabel(user?.user_type, roleTerms);
  return (
    <>
      {type ? <span className="audit-badge">{type}</span> : null}
      {user?.is_active === false ? (
        <span className="audit-badge audit-badge--warn">désactivé</span>
      ) : null}
      {user?.deleted ? <span className="audit-badge audit-badge--failure">supprimé</span> : null}
    </>
  );
}

/** Fiche d'un utilisateur : synthèse de la période puis journal de ses actions. */
function UserActivityDetail({ actor, source, roleTerms, range, onBack }) {
  const [period, setPeriod] = useState(range);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('actor');
  const latest = useLatestRequest();
  const isSecurity = source === 'security';

  const load = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    setError('');
    try {
      const qs = filtersToParams({ from: period.from, to: period.to, source });
      const data = await api(`/api/audit/users/${encodeURIComponent(actor.id)}?${qs}`);
      if (!isCurrent()) return;
      setSummary(data);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err.message || 'Impossible de charger la fiche');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [actor.id, period.from, period.to, source, latest]);

  useEffect(() => {
    load();
  }, [load]);

  const user = summary?.user || actor;
  const totals = summary?.totals || {};
  const maxCat = Math.max(1, ...(summary?.by_category || []).map((c) => c.count));
  const locked =
    subject === 'actor'
      ? { actorUserId: actor.id, from: period.from, to: period.to }
      : { targetId: actor.id, from: period.from, to: period.to };

  return (
    <div className="fade-in audit-user-detail">
      <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>
        ← Tous les utilisateurs
      </button>
      <header className="audit-user-header">
        <h3>
          {actorName(user)} <UserBadges user={user} roleTerms={roleTerms} />
        </h3>
        <p className="section-sub">
          {user.pseudo ? `@${user.pseudo} · ` : ''}
          {summary?.user?.created_at
            ? `compte créé le ${formatDateTime(summary.user.created_at)} · `
            : ''}
          {summary?.user?.last_seen
            ? `vu pour la dernière fois le ${formatDateTime(summary.user.last_seen)}`
            : ''}
        </p>
      </header>

      <AuditFiltersBar
        filters={{ ...period, mode: 'all' }}
        onChange={(patch) =>
          setPeriod((p) => ({ from: patch.from ?? p.from, to: patch.to ?? p.to }))
        }
        onReset={() => setPeriod(defaultDayRange())}
        hide={['mode', 'category', 'result', 'actor', 'q', 'action', 'ip']}
      />

      {loading ? (
        <Loader />
      ) : error ? (
        <div className="empty">
          <div className="empty-icon">
            <IconWarning size={28} />
          </div>
          <p>{error}</p>
          <button className="btn btn-sm btn-ghost" onClick={load}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div className="stats-grid audit-stats-grid audit-user-kpis">
            <article className="fm-panel stat-card highlight">
              <div className="stat-number">{(totals.total || 0).toLocaleString('fr-FR')}</div>
              <div className="stat-label">Actions</div>
            </article>
            <article className="fm-panel stat-card">
              <div className="stat-number">{(totals.major || 0).toLocaleString('fr-FR')}</div>
              <div className="stat-label">Principales</div>
            </article>
            <article className="fm-panel stat-card">
              <div className="stat-number">{(totals.failures || 0).toLocaleString('fr-FR')}</div>
              <div className="stat-label">Échecs</div>
            </article>
            <article className="fm-panel stat-card">
              <div className="stat-number">{(totals.targeted || 0).toLocaleString('fr-FR')}</div>
              <div className="stat-label">Le concernant</div>
            </article>
          </div>

          <div className="audit-user-columns">
            {summary?.by_category?.length ? (
              <section className="fm-panel audit-user-block">
                <h4>Par catégorie</h4>
                <ul className="audit-bars">
                  {summary.by_category.map((c) => (
                    <li key={c.category}>
                      <span className="audit-bar-label">{c.category_label}</span>
                      <span className="audit-bar-track" aria-hidden="true">
                        <span
                          className={`audit-bar-fill audit-cat-${c.category}`}
                          style={{ width: `${Math.max(4, (c.count / maxCat) * 100)}%` }}
                        />
                      </span>
                      <span className="audit-bar-value">
                        {c.count.toLocaleString('fr-FR')}
                        {c.failures ? ` (${c.failures} échec${c.failures > 1 ? 's' : ''})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {summary?.top_actions?.length ? (
              <section className="fm-panel audit-user-block">
                <h4>Actions les plus fréquentes</h4>
                <ul className="audit-top-actions">
                  {summary.top_actions.map((a) => (
                    <li key={a.action}>
                      <span>{a.action_label}</span>
                      <span className="audit-top-count">
                        {a.count.toLocaleString('fr-FR')}
                        {a.failures ? ` · ${a.failures} échec${a.failures > 1 ? 's' : ''}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {isSecurity && summary?.ips?.length ? (
              <section className="fm-panel audit-user-block">
                <h4>Adresses IP et appareils</h4>
                <ul className="audit-top-actions">
                  {summary.ips.map((ip) => (
                    <li key={ip.ip_address}>
                      <span>
                        {ip.ip_address}
                        {ip.user_agent ? (
                          <span className="audit-event-type">
                            {' '}
                            · {summarizeUserAgent(ip.user_agent)}
                          </span>
                        ) : null}
                      </span>
                      <span className="audit-top-count">
                        {ip.count.toLocaleString('fr-FR')} · {formatDateTime(ip.last_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      )}

      <div
        className="fm-subtabs audit-subject-toggle"
        role="tablist"
        aria-label="Événements affichés"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subject === 'actor'}
          onClick={() => setSubject('actor')}
        >
          Actions faites
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subject === 'target'}
          onClick={() => setSubject('target')}
        >
          Actions le concernant
        </button>
      </div>
      <AuditEventsPanel
        key={`${subject}-${actor.id}`}
        source={source}
        roleTerms={roleTerms}
        locked={locked}
        hide={['period', 'actor']}
        initialFilters={{ mode: 'all' }}
      />
    </div>
  );
}

/**
 * Onglet « Utilisateurs » : qui a fait quoi sur la période, puis la fiche détaillée d'un
 * compte. Source : journal de sécurité (connexions comprises) pour un administrateur,
 * journal d'audit sinon.
 */
export function UserActivityPanel({ canReadSecurity, roleTerms, selectedActor, onSelectActor }) {
  const categories = useAuditCatalog();
  const source = canReadSecurity ? 'security' : 'audit';
  const [filters, setFilters] = useState(defaultUserFilters);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    setError('');
    try {
      const data = await api(
        `/api/audit/users?${filtersToParams(filters, { source, limit: PAGE_SIZE })}`,
      );
      if (!isCurrent()) return;
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      if (!isCurrent()) return;
      console.error('[ForetMap] audit users', err);
      setError(err.message || 'Impossible de charger l’activité des utilisateurs');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [filters, source, latest]);

  useEffect(() => {
    if (!selectedActor) load();
  }, [load, selectedActor]);

  const loadMore = async () => {
    const isCurrent = latest();
    setLoadingMore(true);
    try {
      const data = await api(
        `/api/audit/users?${filtersToParams(filters, { source, limit: PAGE_SIZE, offset: rows.length })}`,
      );
      if (!isCurrent()) return;
      setRows((prev) => [...prev, ...(Array.isArray(data?.rows) ? data.rows : [])]);
    } catch (err) {
      if (isCurrent()) setError(err.message || 'Impossible de charger la suite');
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  };

  if (selectedActor) {
    return (
      <UserActivityDetail
        actor={selectedActor}
        source={source}
        roleTerms={roleTerms}
        range={{ from: filters.from, to: filters.to }}
        onBack={() => onSelectActor(null)}
      />
    );
  }

  return (
    <div className="fade-in">
      <p className="section-sub audit-intro">
        Qui a fait quoi sur la période. Cliquez sur un compte pour voir sa fiche et le détail de ses
        actions.
        {canReadSecurity ? ' Les connexions sont comptées.' : ''}
      </p>
      <AuditFiltersBar
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onReset={() => setFilters(defaultUserFilters())}
        categories={categories}
        hide={['q', 'action', 'ip']}
        extraSelects={
          <>
            <label className="audit-field">
              Type de compte
              <select
                className="input"
                value={filters.actorType}
                onChange={(e) => setFilters((f) => ({ ...f, actorType: e.target.value }))}
              >
                <option value="">Tous</option>
                <option value="student">{userTypeLabel('student', roleTerms)}</option>
                <option value="teacher">{userTypeLabel('teacher', roleTerms)}</option>
                <option value="admin">{userTypeLabel('admin', roleTerms)}</option>
              </select>
            </label>
            <label className="audit-field">
              Trier par
              <select
                className="input"
                value={filters.sort}
                onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      {loading ? (
        <Loader />
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
          <p>Aucune activité pour ces filtres</p>
        </div>
      ) : (
        <>
          <p className="section-sub audit-count" aria-live="polite">
            {total.toLocaleString('fr-FR')} compte{total > 1 ? 's' : ''} actif{total > 1 ? 's' : ''}{' '}
            sur la période
          </p>
          <ul className="audit-users">
            {rows.map((r) => (
              <li key={r.actor.id}>
                <button
                  type="button"
                  className="audit-user-row"
                  onClick={() => onSelectActor(r.actor)}
                >
                  <span className="audit-user-main">
                    <span className="audit-user-name">
                      {actorName(r.actor)} <UserBadges user={r.actor} roleTerms={roleTerms} />
                    </span>
                    <span className="audit-event-meta">
                      Dernière activité {formatDateTime(r.last_at)}
                      {r.last_login_at
                        ? ` · dernière connexion ${formatDateTime(r.last_login_at)}`
                        : ''}
                    </span>
                    {r.top_actions?.length ? (
                      <span className="audit-user-tops">
                        {r.top_actions.map((t) => (
                          <span key={t.action} className="audit-chip">
                            {t.action_label} × {t.count.toLocaleString('fr-FR')}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="audit-user-stats">
                    <span>
                      <strong>{r.total.toLocaleString('fr-FR')}</strong> actions
                    </span>
                    <span>{r.major_count.toLocaleString('fr-FR')} principales</span>
                    {r.failures ? (
                      <span className="audit-user-failures">
                        {r.failures.toLocaleString('fr-FR')} échec{r.failures > 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error ? <p className="audit-inline-error">{error}</p> : null}
          {rows.length < total ? (
            <div className="audit-more">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? 'Chargement…' : `Afficher plus (${total - rows.length} restants)`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
