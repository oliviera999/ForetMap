/**
 * Adaptateur produit du forum : la vue partagée (`SharedForumView`) ne connaît que cette
 * interface. ForetMap (`/api/forum`, client `api`) et G&L (`/api/gl/forum`, client `apiGL`)
 * exposent le même contrat, servi par le même noyau serveur (`lib/shared/forumCore.js`).
 * Même motif que le carnet partagé (`src/shared/journal/journalAdapter.js`).
 *
 * @typedef {object} ForumCapabilities
 * @property {boolean} [groups] le produit range ses sujets par groupe (ForetMap)
 * @property {boolean} [moderatorCanReplyLocked] un modérateur répond encore dans un sujet
 *   verrouillé (MJ G&L)
 * @property {boolean} [hasConfig] le produit expose `GET …/config` (emojis, signalements)
 *
 * @typedef {object} ForumAdapter
 * @property {ForumCapabilities} capabilities
 * @property {(opts: { page: number, pageSize: number }) => Promise<{ items?: object[], total?: number, page?: number }>} listThreads
 * @property {(threadId: string|number, opts: { page: number, pageSize: number }) => Promise<{ thread?: object, posts?: object[], total_posts?: number, page?: number }>} getThread
 * @property {(payload: { title: string, body?: string, images?: string[], group_id?: string }) => Promise<{ thread: object|null, firstPostId: string|number|null }>} createThread
 * @property {(threadId: string|number, payload: { body?: string, images?: string[] }) => Promise<object>} reply
 * @property {(postId: string|number, body: string) => Promise<object>} editPost
 * @property {(postId: string|number) => Promise<unknown>} deletePost
 * @property {(postId: string|number, emoji: string) => Promise<{ reacted?: boolean }>} toggleReaction
 * @property {(postId: string|number, reason: string) => Promise<unknown>} report
 * @property {(threadId: string|number, locked: boolean) => Promise<unknown>} setLocked
 * @property {(threadId: string|number, pinned: boolean) => Promise<unknown>} setPinned
 * @property {(opts?: { status?: string }) => Promise<{ items?: object[], total?: number }>} listReports
 * @property {(reportId: string|number, status: string) => Promise<unknown>} resolveReport
 * @property {() => Promise<object|null>} fetchConfig
 */

/**
 * @param {object} options
 * @param {(path: string, method?: string, body?: unknown) => Promise<any>} options.request client HTTP du produit
 * @param {string} options.basePath préfixe des routes (`/api/forum`, `/api/gl/forum`)
 * @param {ForumCapabilities} [options.capabilities]
 * @returns {ForumAdapter}
 */
export function createForumAdapter({ request, basePath, capabilities = {} }) {
  const base = String(basePath || '').replace(/\/+$/, '');
  const enc = (v) => encodeURIComponent(String(v));
  return {
    capabilities: {
      groups: false,
      moderatorCanReplyLocked: false,
      hasConfig: false,
      ...capabilities,
    },
    listThreads: ({ page = 1, pageSize = 20 } = {}) =>
      request(`${base}/threads?page=${enc(page)}&page_size=${enc(pageSize)}`),
    getThread: (threadId, { page = 1, pageSize = 50 } = {}) =>
      request(`${base}/threads/${enc(threadId)}?page=${enc(page)}&page_size=${enc(pageSize)}`),
    // ForetMap répond `{ thread, first_post_id }` ; G&L y ajoute les champs du sujet à plat
    // (contrat historique). On normalise ici pour que la vue n'ait qu'une forme à lire.
    createThread: async (payload) => {
      const res = await request(`${base}/threads`, 'POST', payload);
      return {
        thread: res?.thread || (res?.id != null ? res : null),
        firstPostId: res?.first_post_id ?? null,
      };
    },
    reply: (threadId, payload) =>
      request(`${base}/threads/${enc(threadId)}/posts`, 'POST', payload),
    editPost: (postId, body) => request(`${base}/posts/${enc(postId)}`, 'PATCH', { body }),
    deletePost: (postId) => request(`${base}/posts/${enc(postId)}`, 'DELETE'),
    toggleReaction: (postId, emoji) =>
      request(`${base}/posts/${enc(postId)}/reactions`, 'POST', { emoji }),
    report: (postId, reason) => request(`${base}/posts/${enc(postId)}/report`, 'POST', { reason }),
    setLocked: (threadId, locked) =>
      request(`${base}/threads/${enc(threadId)}/lock`, 'PATCH', { locked }),
    setPinned: (threadId, pinned) =>
      request(`${base}/threads/${enc(threadId)}/pin`, 'PATCH', { pinned }),
    listReports: ({ status = 'open' } = {}) => request(`${base}/reports?status=${enc(status)}`),
    resolveReport: (reportId, status) =>
      request(`${base}/reports/${enc(reportId)}`, 'PATCH', { status }),
    fetchConfig: () => (capabilities.hasConfig ? request(`${base}/config`) : Promise.resolve(null)),
  };
}
