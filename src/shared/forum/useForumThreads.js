import { useCallback, useRef, useState } from 'react';

/**
 * Liste paginée des sujets. `load(page, { silent })` : un rechargement silencieux (temps réel,
 * après une action) n'affiche pas « Chargement… », qui faisait clignoter la liste.
 *
 * @param {import('./forumAdapter.js').ForumAdapter} adapter
 * @param {{ pageSize: number, onError?: (message: string) => void }} options
 */
export function useForumThreads(adapter, { pageSize, onError }) {
  const [threads, setThreads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(
    async (nextPage = 1, { silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await adapter.listThreads({ page: nextPage, pageSize });
        const items = Array.isArray(data?.items) ? data.items : [];
        setThreads(items);
        setTotal(Number(data?.total || 0));
        setPage(Number(data?.page || nextPage));
        setLoaded(true);
        return items;
      } catch (err) {
        onErrorRef.current?.(`Erreur chargement forum : ${err?.message || 'réseau'}`);
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [adapter, pageSize],
  );

  return { threads, total, page, loading, loaded, load };
}
