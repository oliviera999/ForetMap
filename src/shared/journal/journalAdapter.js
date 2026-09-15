/**
 * Adaptateur produit du carnet : la seule chose qui distingue « Mon carnet » (ForetMap) de
 * « Mon journal » (G&L) côté données est le client HTTP et le préfixe des routes — le contrat
 * (`GET me`, `POST me/articles`, `PUT me/articles/:id`, `…/assets`, `…/pin`, `DELETE`,
 * `POST me/imports`, `POST embeds/resolve`, `GET users|players/:id`) est le même, par
 * construction (`docs/PLAN_CARNET_PARITE_GL.md`, §4.2). Chaque produit expose une instance ;
 * les hooks et composants partagés ne connaissent que cette interface.
 *
 * @typedef {object} JournalAdapter
 * @property {() => Promise<{ limits?: object, articles?: object[], imports?: object[] }>} fetchJournal
 * @property {() => Promise<{ article?: object }>} createArticle
 * @property {(articleId: string|number, payload: object) => Promise<{ article?: object }>} updateArticle
 * @property {(articleId: string|number) => Promise<unknown>} deleteArticle
 * @property {(articleId: string|number, pinned: boolean) => Promise<unknown>} pinArticle
 * @property {(articleId: string|number, imageData: string) => Promise<{ asset?: object, usage?: object }>} addArticleAsset
 * @property {(articleId: string|number, assetId: string|number) => Promise<{ usage?: object }>} removeArticleAsset
 * @property {(importId: string|number) => Promise<unknown>} deleteImport
 * @property {(importId: string|number, pinned: boolean) => Promise<unknown>} pinImport
 * @property {(payload: { resourceType: string, resourceRef: string, title?: string }) => Promise<{ import?: object }>} importResource
 * @property {(embeds: { type: string, ref: string }[]) => Promise<{ titles?: Record<string, string>, cards?: Record<string, object> }>} resolveEmbeds
 * @property {(type: string, q: string) => Promise<{ results?: { type: string, ref: string, title: string }[] }>} searchEmbeds
 * @property {(subjectId: string|number) => Promise<{ user?: object, player?: object, articles?: object[], imports?: object[] }>} fetchSubjectJournal
 *   lecture par un professeur / MJ du carnet d'un autre compte
 */

/**
 * @param {object} options
 * @param {(path: string, method?: string, body?: unknown) => Promise<any>} options.request client HTTP du produit (`api` / `apiGL`)
 * @param {string} options.basePath préfixe des routes « me » (`/api/user-journal/me`, `/api/gl/player-journal/me`)
 * @param {string} [options.subjectsSegment='users'] segment des routes de lecture staff (`users` côté ForetMap, `players` côté G&L)
 * @returns {JournalAdapter}
 */
export function createJournalAdapter({ request, basePath, subjectsSegment = 'users' }) {
  const base = String(basePath || '').replace(/\/+$/, '');
  const root = base.replace(/\/me$/, '');
  const enc = (v) => encodeURIComponent(String(v));
  return {
    fetchJournal: () => request(base),
    createArticle: () => request(`${base}/articles`, 'POST', { bodyMarkdown: '' }),
    updateArticle: (articleId, payload) =>
      request(`${base}/articles/${enc(articleId)}`, 'PUT', payload),
    deleteArticle: (articleId) => request(`${base}/articles/${enc(articleId)}`, 'DELETE'),
    pinArticle: (articleId, pinned) =>
      request(`${base}/articles/${enc(articleId)}/pin`, 'PUT', { pinned }),
    addArticleAsset: (articleId, imageData) =>
      request(`${base}/articles/${enc(articleId)}/assets`, 'POST', { imageData }),
    removeArticleAsset: (articleId, assetId) =>
      request(`${base}/articles/${enc(articleId)}/assets/${enc(assetId)}`, 'DELETE'),
    deleteImport: (importId) => request(`${base}/imports/${enc(importId)}`, 'DELETE'),
    pinImport: (importId, pinned) =>
      request(`${base}/imports/${enc(importId)}/pin`, 'PUT', { pinned }),
    importResource: (payload) => request(`${base}/imports`, 'POST', payload),
    resolveEmbeds: (embeds) => request(`${root}/embeds/resolve`, 'POST', { embeds }),
    searchEmbeds: (type, q) => request(`${root}/embeds/search?type=${enc(type)}&q=${enc(q)}`),
    fetchSubjectJournal: (subjectId) => request(`${root}/${subjectsSegment}/${enc(subjectId)}`),
  };
}
