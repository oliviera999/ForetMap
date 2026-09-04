import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../shared/ui/Button.jsx';
import { DataList } from '../../shared/ui/DataList.jsx';

/** Produits du monorepo (miroir de `lib/products.js`). */
const PRODUCTS = Object.freeze([
  { id: '', label: 'Tous les produits' },
  { id: 'foret', label: 'ForetMap' },
  { id: 'gl', label: 'Gnomes & Licornes' },
  { id: 'plan', label: 'Plan Lyautey' },
]);

/** Libellés des événements comptés (`lib/usage.js`). */
const EVENT_LABELS = Object.freeze({
  open: 'Ouvertures',
  tab_open: 'Onglets ouverts',
  place_open: 'Lieux consultés',
  chapter_open: 'Chapitres ouverts',
  spell_cast: 'Sortilèges lancés',
  help_open: 'Aides ouvertes',
  search: 'Recherches',
  search_empty: 'Recherches sans résultat',
  locate: 'Localisations',
  go: 'Directions demandées',
  route_start: 'Parcours démarrés',
  route_step: 'Étapes de parcours',
  offline_view: 'Consultations hors ligne',
});

function dayInput(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * Écran d'usage anonyme (lot 8 du plan de convergence, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`
 * §8.9) : ce que les trois produits comptent, agrégé par jour.
 *
 * Aucun identifiant, aucune adresse IP, aucun parcours individuel : uniquement des
 * **compteurs nommés** (`usage_counters`). Ils servent à deux décisions concrètes — savoir si
 * le plan est utilisé, et savoir quels mots les visiteurs cherchent en vain (donc quels alias
 * de recherche ajouter aux lieux).
 */
export function UsagePanel({ onError = null }) {
  const [from, setFrom] = useState(() => dayInput(-29));
  const [to, setTo] = useState(() => dayInput(0));
  const [product, setProduct] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (product) params.set('product', product);
      const data = await api(`/api/admin/usage?${params}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      onError?.(err?.message || 'Lecture des compteurs impossible.');
    } finally {
      setLoading(false);
    }
  }, [from, to, product, onError]);

  useEffect(() => {
    load();
  }, [load]);

  /** Totaux par produit et événement (le détail par jour reste dans la réponse brute). */
  const totals = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.product}|${row.event}`;
      const entry = map.get(key) || { product: row.product, event: row.event, count: 0, keys: 0 };
      entry.count += Number(row.count) || 0;
      if (row.key) entry.keys += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  /** Recherches restées sans résultat : la liste la plus actionnable du tableau. */
  const emptySearches = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (row.event !== 'search_empty' || !row.key) continue;
      map.set(row.key, (map.get(row.key) || 0) + (Number(row.count) || 0));
    }
    return [...map.entries()]
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [rows]);

  return (
    <div className="usage-panel">
      <p className="section-sub">
        Compteurs <strong>anonymes</strong> : aucun identifiant, aucune adresse IP, aucun parcours
        individuel. Seuls des événements nommés sont agrégés par jour.
      </p>

      <div className="usage-panel__filters">
        <label>
          Du <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          au <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
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
        <Button variant="secondary" size="sm" loading={loading} onClick={load}>
          Actualiser
        </Button>
      </div>

      <DataList
        caption="Compteurs par produit et événement"
        columns={[
          { key: 'product', label: 'Produit' },
          { key: 'event', label: 'Événement' },
          { key: 'count', label: 'Total' },
        ]}
        rows={totals.map((entry) => {
          const label = EVENT_LABELS[entry.event] || entry.event;
          return {
            key: `${entry.product}-${entry.event}`,
            desktopCells: (
              <>
                <td>{entry.product}</td>
                <td>{label}</td>
                <td>{entry.count}</td>
              </>
            ),
            mobileCells: (
              <>
                <h4>{label}</h4>
                <p>
                  {entry.product} — {entry.count}
                </p>
              </>
            ),
          };
        })}
        emptyLabel="Aucun événement sur la période."
      />

      {emptySearches.length > 0 ? (
        <section className="usage-panel__empty-searches">
          <h4>Recherches sans résultat</h4>
          <p className="section-sub">
            Les mots que les visiteurs cherchent et que les lieux ne portent pas encore : à ajouter
            en <strong>alias de recherche</strong> sur la fiche du lieu concerné.
          </p>
          <ul>
            {emptySearches.map((entry) => (
              <li key={entry.term}>
                <strong>{entry.term}</strong> — {entry.count}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
