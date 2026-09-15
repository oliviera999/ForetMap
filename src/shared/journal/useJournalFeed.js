import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLatestRequest } from '../hooks/useLatestRequest.js';
import { DEFAULT_JOURNAL_LIMITS, buildJournalTimeline } from './journalFeed.js';

/**
 * État et actions du fil du carnet, communs aux deux produits : chargement, création,
 * suppression et épinglage d'articles et d'imports, filtre / recherche / tri côté client.
 * La vue produit ne garde que le rendu (textes, aide, boutons de son thème).
 *
 * @param {import('./journalAdapter.js').JournalAdapter} adapter instance stable (module)
 * @param {object} [options]
 * @param {(err: Error) => void} [options.onError] hook d'erreur produit (ex. compte supprimé → déconnexion)
 */
export function useJournalFeed(adapter, { onError } = {}) {
  const [limits, setLimits] = useState(DEFAULT_JOURNAL_LIMITS);
  const [articles, setArticles] = useState([]);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [kindFilter, setKindFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('recent');
  /** Article ouvert en édition (null = tout le fil en lecture). */
  const [editingId, setEditingId] = useState(null);
  const latest = useLatestRequest();

  const fail = useCallback(
    (err, fallback) => {
      onError?.(err);
      setError(err?.message || fallback);
    },
    [onError],
  );

  const reload = useCallback(async () => {
    const isCurrent = latest();
    setLoading(true);
    setError('');
    try {
      const data = await adapter.fetchJournal();
      if (!isCurrent()) return;
      setLimits(data?.limits || DEFAULT_JOURNAL_LIMITS);
      setArticles(Array.isArray(data?.articles) ? data.articles : []);
      setImports(Array.isArray(data?.imports) ? data.imports : []);
    } catch (err) {
      if (isCurrent()) fail(err, 'Chargement impossible');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [adapter, fail, latest]);

  useEffect(() => {
    reload();
  }, [reload]);

  const createArticle = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const data = await adapter.createArticle();
      if (data?.article) {
        setArticles((prev) => [data.article, ...prev]);
        setEditingId(data.article.id);
      }
    } catch (err) {
      fail(err, 'Création impossible');
    } finally {
      setCreating(false);
    }
  }, [adapter, creating, fail]);

  const deleteArticle = useCallback(
    async (articleId) => {
      await adapter.deleteArticle(articleId);
      setArticles((prev) => prev.filter((a) => a.id !== articleId));
      setEditingId((cur) => (String(cur) === String(articleId) ? null : cur));
    },
    [adapter],
  );

  const deleteImport = useCallback(
    async (importId) => {
      await adapter.deleteImport(importId);
      setImports((prev) => prev.filter((i) => i.id !== importId));
    },
    [adapter],
  );

  const pinArticle = useCallback(
    async (articleId, pinned) => {
      await adapter.pinArticle(articleId, pinned);
      setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, pinned } : a)));
    },
    [adapter],
  );

  const pinImport = useCallback(
    async (importId, pinned) => {
      await adapter.pinImport(importId, pinned);
      setImports((prev) => prev.map((i) => (i.id === importId ? { ...i, pinned } : i)));
    },
    [adapter],
  );

  const timeline = useMemo(
    () => buildJournalTimeline({ articles, imports, kindFilter, search, sortOrder }),
    [articles, imports, kindFilter, search, sortOrder],
  );

  return {
    limits,
    articles,
    imports,
    loading,
    error,
    creating,
    kindFilter,
    setKindFilter,
    search,
    setSearch,
    sortOrder,
    setSortOrder,
    timeline,
    totalCount: articles.length + imports.length,
    reload,
    editingId,
    setEditingId,
    createArticle,
    deleteArticle,
    deleteImport,
    pinArticle,
    pinImport,
  };
}
