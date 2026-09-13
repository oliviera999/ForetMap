import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { UserJournalArticleCard } from './UserJournalArticleCard.jsx';
import { UserJournalImportCard } from './UserJournalImportCard.jsx';

function timeValue(v) {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Carnet ForetMap (parité Mon journal GL) : fil unifié articles + imports.
 */
export function UserJournalView({ zones = [], onForceLogout = null, onNavigateTab = null }) {
  const [limits, setLimits] = useState({ maxChars: 0, maxAssets: 0 });
  const [articles, setArticles] = useState([]);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [kindFilter, setKindFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('recent');

  const handleErr = useCallback(
    (err) => {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      setError(err.message || 'Erreur');
    },
    [onForceLogout],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/user-journal/me');
      setLimits(data?.limits || { maxChars: 0, maxAssets: 0 });
      setArticles(Array.isArray(data?.articles) ? data.articles : []);
      setImports(Array.isArray(data?.imports) ? data.imports : []);
    } catch (err) {
      handleErr(err);
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleNewArticle = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const data = await api('/api/user-journal/me/articles', 'POST', { bodyMarkdown: '' });
      if (data?.article) setArticles((prev) => [data.article, ...prev]);
    } catch (err) {
      handleErr(err);
    } finally {
      setCreating(false);
    }
  }, [creating, handleErr]);

  const handleDeleteArticle = useCallback(async (articleId) => {
    await api(`/api/user-journal/me/articles/${articleId}`, 'DELETE');
    setArticles((prev) => prev.filter((a) => a.id !== articleId));
  }, []);

  const handleDeleteImport = useCallback(async (importId) => {
    await api(`/api/user-journal/me/imports/${importId}`, 'DELETE');
    setImports((prev) => prev.filter((i) => i.id !== importId));
  }, []);

  const handlePinArticle = useCallback(async (articleId, pinned) => {
    await api(`/api/user-journal/me/articles/${articleId}/pin`, 'PUT', { pinned });
    setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, pinned } : a)));
  }, []);

  const handlePinImport = useCallback(async (importId, pinned) => {
    await api(`/api/user-journal/me/imports/${importId}/pin`, 'PUT', { pinned });
    setImports((prev) => prev.map((i) => (i.id === importId ? { ...i, pinned } : i)));
  }, []);

  const timeline = useMemo(() => {
    let items = [
      ...articles.map((a) => ({ kind: 'article', at: timeValue(a.createdAt), data: a })),
      ...imports.map((i) => ({ kind: 'import', at: timeValue(i.createdAt), data: i })),
    ];
    if (kindFilter !== 'all') items = items.filter((it) => it.kind === kindFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((it) => {
        if (it.kind === 'article') {
          return (
            String(it.data.title || '')
              .toLowerCase()
              .includes(q) ||
            String(it.data.bodyMarkdown || '')
              .toLowerCase()
              .includes(q)
          );
        }
        return (
          String(it.data.title || '')
            .toLowerCase()
            .includes(q) ||
          String(it.data.resourceRef || '')
            .toLowerCase()
            .includes(q)
        );
      });
    }
    items.sort((x, y) => {
      const px = x.data.pinned ? 1 : 0;
      const py = y.data.pinned ? 1 : 0;
      if (px !== py) return py - px;
      return sortOrder === 'oldest' ? x.at - y.at : y.at - x.at;
    });
    return items;
  }, [articles, imports, kindFilter, search, sortOrder]);

  const totalCount = articles.length + imports.length;

  return (
    <section className="fm-journal fade-in" data-testid="user-journal">
      <header className="fm-journal__header">
        <h2>Mon carnet</h2>
        <p className="hint">
          Ton carnet personnel : articles (texte enrichi et photos), et imports des espèces, termes
          de glossaire et tutoriels que tu as marqués comme appris. Les professeurs peuvent le
          consulter pour t’accompagner.
        </p>
      </header>

      <div className="fm-journal__actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleNewArticle}
          disabled={creating}
        >
          {creating ? 'Création…' : '+ Nouvel article'}
        </button>
        {error ? (
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Réessayer
          </button>
        ) : null}
      </div>

      {!loading && totalCount > 0 ? (
        <div className="fm-journal__toolbar">
          <input
            type="search"
            className="fm-journal__search"
            placeholder="Rechercher dans mon carnet…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher dans mon carnet"
          />
          <label className="hint">
            Afficher :{' '}
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              aria-label="Filtrer par type d’entrée"
            >
              <option value="all">Tout</option>
              <option value="article">Articles</option>
              <option value="import">Imports</option>
            </select>
          </label>
          <label className="hint">
            Trier :{' '}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-label="Trier le fil"
            >
              <option value="recent">Plus récent d’abord</option>
              <option value="oldest">Plus ancien d’abord</option>
            </select>
          </label>
        </div>
      ) : null}

      {error ? <p className="auth-error">{error}</p> : null}

      {loading ? (
        <p className="hint">Chargement de ton carnet…</p>
      ) : totalCount === 0 ? (
        <div className="fm-journal__empty">
          <p className="hint">Ton carnet est encore vide. Deux façons de le remplir :</p>
          <ul className="hint">
            <li>
              <strong>Écris un article</strong> — « + Nouvel article » (texte, images, ou les deux).
            </li>
            <li>
              <strong>Importe un élément appris</strong> — sur une fiche espèce, un terme du
              glossaire ou un tutoriel, marque-le comme appris puis « Ajouter au carnet ».
            </li>
          </ul>
        </div>
      ) : timeline.length === 0 ? (
        <p className="hint fm-journal__empty">Aucune entrée ne correspond à ta recherche.</p>
      ) : (
        <div className="fm-journal__feed">
          {timeline.map((entry) =>
            entry.kind === 'article' ? (
              <UserJournalArticleCard
                key={`a-${entry.data.id}`}
                article={entry.data}
                limits={limits}
                zones={zones}
                onDelete={handleDeleteArticle}
                onTogglePin={handlePinArticle}
                onForceLogout={onForceLogout}
              />
            ) : (
              <UserJournalImportCard
                key={`i-${entry.data.id}`}
                item={entry.data}
                onNavigateTab={onNavigateTab}
                onDelete={handleDeleteImport}
                onTogglePin={handlePinImport}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
