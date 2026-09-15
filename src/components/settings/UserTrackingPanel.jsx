import { useCallback, useEffect, useState } from 'react';
import { useLatestRequest } from '../../shared/hooks/useLatestRequest.js';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';
import { DataList } from '../../shared/ui/DataList.jsx';
import { UsagePanel } from './UsagePanel.jsx';

const PRODUCTS = Object.freeze([
  { id: '', label: 'Tous les produits' },
  { id: 'foret', label: 'ForetMap' },
  { id: 'gl', label: 'Gnomes & Licornes' },
  { id: 'plan', label: 'Plan Lyautey' },
]);

const TABS = Object.freeze([
  { id: 'presence', label: 'Connectés' },
  { id: 'passage', label: 'Passage' },
  { id: 'activity', label: 'Activité' },
]);

const ACTION_LABELS = Object.freeze({
  session_start: 'Début de session',
  login: 'Connexion',
  product_open: 'Ouverture produit',
});

function dayInput(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('fr-FR');
}

/**
 * Panneau admin « Suivi utilisateurs » : présence légère, passage anonyme+identifié,
 * journal d'activité (distinct de l'audit sensible).
 */
export function UserTrackingPanel({ onError = null }) {
  const [tab, setTab] = useState('presence');
  const [product, setProduct] = useState('');
  const [from, setFrom] = useState(() => dayInput(-29));
  const [to, setTo] = useState(() => dayInput(0));

  const [presence, setPresence] = useState(null);
  const [passage, setPassage] = useState(null);
  const [activityRows, setActivityRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const latest = useLatestRequest();

  const loadPresence = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (product) params.set('product', product);
      const data = await api(`/api/admin/presence?${params}`);
      if (!isCurrent()) return;
      setPresence(data);
    } catch (err) {
      if (isCurrent()) onError?.(err?.message || 'Lecture de la présence impossible.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [product, onError, latest]);

  const loadPassage = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (product) params.set('product', product);
      const data = await api(`/api/admin/user-passage?${params}`);
      if (!isCurrent()) return;
      setPassage(data);
    } catch (err) {
      if (isCurrent()) onError?.(err?.message || 'Lecture du passage impossible.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [from, to, product, onError, latest]);

  const loadActivity = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, limit: '100' });
      if (product) params.set('product', product);
      const data = await api(`/api/admin/activity?${params}`);
      if (!isCurrent()) return;
      setActivityRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      if (isCurrent()) onError?.(err?.message || 'Lecture de l’activité impossible.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [from, to, product, onError, latest]);

  useEffect(() => {
    if (tab === 'presence') loadPresence();
    else if (tab === 'passage') loadPassage();
    else if (tab === 'activity') loadActivity();
  }, [tab, loadPresence, loadPassage, loadActivity]);

  useEffect(() => {
    if (tab !== 'presence') return undefined;
    const id = setInterval(() => {
      loadPresence();
    }, 45_000);
    return () => clearInterval(id);
  }, [tab, loadPresence]);

  return (
    <div className="user-tracking-panel">
      <p className="section-sub">
        Réservé à l’administration. La présence s’appuie sur les connexions temps réel et la
        dernière activité — sans battement de cœur HTTP. L’audit sensible reste dans l’onglet Audit
        de l’application.
      </p>

      <div className="usage-panel__filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        {TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={tab === item.id ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
        <label>
          Produit{' '}
          <select value={product} onChange={(event) => setProduct(event.target.value)}>
            {PRODUCTS.map((item) => (
              <option key={item.id || 'all'} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {tab !== 'presence' ? (
          <>
            <label>
              Du{' '}
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              au <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          onClick={() => {
            if (tab === 'presence') loadPresence();
            else if (tab === 'passage') loadPassage();
            else loadActivity();
          }}
        >
          Actualiser
        </Button>
      </div>

      {tab === 'presence' ? (
        <section>
          <p className="section-sub">
            En ligne : {presence?.counts?.online ?? '—'} · Vu récemment :{' '}
            {presence?.counts?.recent ?? '—'}
            {presence?.generatedAt ? ` · Snapshot ${formatWhen(presence.generatedAt)}` : null}
          </p>
          <DataList
            caption="Utilisateurs connectés ou vus récemment"
            columns={[
              { key: 'label', label: 'Nom' },
              { key: 'product', label: 'Produit' },
              { key: 'status', label: 'État' },
              { key: 'type', label: 'Type' },
              { key: 'seen', label: 'Dernière activité' },
            ]}
            rows={(presence?.users || []).map((row) => ({
              key: `${row.product}-${row.userId}`,
              desktopCells: (
                <>
                  <td>{row.label}</td>
                  <td>{row.product}</td>
                  <td>{row.presence_label || row.status}</td>
                  <td>{row.userType || '—'}</td>
                  <td>{formatWhen(row.lastSeen)}</td>
                </>
              ),
              mobileCells: (
                <>
                  <h4>{row.label}</h4>
                  <p>
                    {row.product} — {row.presence_label || row.status}
                    {row.label ? ` (${row.label})` : ''}
                  </p>
                </>
              ),
            }))}
            emptyLabel="Personne en ligne ni vu récemment."
          />
        </section>
      ) : null}

      {tab === 'passage' ? (
        <section style={{ display: 'grid', gap: 16 }}>
          <UsagePanel onError={onError} />
          <div>
            <h4>Passage identifié (comptes)</h4>
            <p className="section-sub">
              Une ligne par compte et par produit. Les invités sans compte restent dans les
              compteurs anonymes ci-dessus. Comptes ayant touché au moins deux produits sur la
              période : <strong>{passage?.multiProductUsers ?? '—'}</strong>
            </p>
            <DataList
              caption="Agrégats par produit"
              columns={[
                { key: 'product', label: 'Produit' },
                { key: 'users', label: 'Comptes' },
                { key: 'active', label: 'Actifs période' },
                { key: 'opens', label: 'Ouvertures' },
              ]}
              rows={(passage?.byProduct || []).map((row) => ({
                key: row.product,
                desktopCells: (
                  <>
                    <td>{row.product}</td>
                    <td>{row.users}</td>
                    <td>{row.activeInRange}</td>
                    <td>{row.opens}</td>
                  </>
                ),
                mobileCells: (
                  <>
                    <h4>{row.product}</h4>
                    <p>
                      {row.activeInRange} actifs / {row.users} comptes — {row.opens} ouvertures
                    </p>
                  </>
                ),
              }))}
              emptyLabel="Aucun passage identifié."
            />
            <DataList
              caption="Derniers passages (100 max)"
              columns={[
                { key: 'user', label: 'Compte' },
                { key: 'product', label: 'Produit' },
                { key: 'opens', label: 'Ouvertures' },
                { key: 'last', label: 'Dernière visite' },
              ]}
              rows={(passage?.recent || []).map((row) => {
                const name =
                  row.display_name ||
                  [row.first_name, row.last_name].filter(Boolean).join(' ') ||
                  row.pseudo ||
                  row.user_id;
                return {
                  key: `${row.user_id}-${row.product}`,
                  desktopCells: (
                    <>
                      <td>{name}</td>
                      <td>{row.product}</td>
                      <td>{row.open_count}</td>
                      <td>{formatWhen(row.last_seen_at)}</td>
                    </>
                  ),
                  mobileCells: (
                    <>
                      <h4>{name}</h4>
                      <p>
                        {row.product} — {formatWhen(row.last_seen_at)}
                      </p>
                    </>
                  ),
                };
              })}
              emptyLabel="Aucun passage récent sur la période."
            />
          </div>
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section>
          <p className="section-sub">
            Journal léger (connexions, sessions) — rétention courte. Pour les actions sensibles
            (suppressions, validations, prises de main…), ouvrir l’onglet <strong>Audit</strong> de
            l’application.
          </p>
          <DataList
            caption="Activité récente"
            columns={[
              { key: 'when', label: 'Quand' },
              { key: 'action', label: 'Action' },
              { key: 'product', label: 'Produit' },
              { key: 'user', label: 'Compte' },
              { key: 'type', label: 'Type' },
            ]}
            rows={activityRows.map((row) => ({
              key: String(row.id),
              desktopCells: (
                <>
                  <td>{formatWhen(row.occurred_at)}</td>
                  <td>{ACTION_LABELS[row.action] || row.action}</td>
                  <td>{row.product}</td>
                  <td>{row.user_id || '—'}</td>
                  <td>{row.user_type || '—'}</td>
                </>
              ),
              mobileCells: (
                <>
                  <h4>{ACTION_LABELS[row.action] || row.action}</h4>
                  <p>
                    {row.product} — {formatWhen(row.occurred_at)}
                  </p>
                </>
              ),
            }))}
            emptyLabel="Aucune activité sur la période."
          />
        </section>
      ) : null}
    </div>
  );
}
