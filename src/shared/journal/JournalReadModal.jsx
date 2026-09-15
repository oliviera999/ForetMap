import { useEffect, useMemo, useState } from 'react';
import { DialogShell } from '../components/DialogShell.jsx';
import { Button } from '../ui/Button.jsx';
import { renderMarkdownToSafeHtml } from '../platform/markdown.js';
import { formatDateTime } from '../utils/formatDateTime.js';
import { downloadTextFile } from '../utils/downloadTextFile.js';
import { buildJournalExport } from './journalExport.js';
import { useJournalEmbedTitles } from './useJournalEmbedTitles.js';

/** Repli neutre : aucun produit ne fournit de réécriture d'images. */
function useHtmlAsIs(html) {
  return html;
}

function ReadArticle({
  article,
  adapter,
  ui,
  articleExtraLine,
  ImageComponent = 'img',
  useHtmlImages = useHtmlAsIs,
}) {
  const html = useMemo(
    () =>
      article?.bodyMarkdown
        ? renderMarkdownToSafeHtml(article.bodyMarkdown, {
            allowImages: true,
            allowJournalEmbeds: true,
          })
        : '',
    [article?.bodyMarkdown],
  );
  const hydratedHtml = useJournalEmbedTitles(html, adapter.resolveEmbeds);
  // ForetMap sert ses illustrations derrière JWT : le produit passe alors un hook de
  // réécriture (blob) et son composant image. Par défaut, rien n'est transformé.
  const displayHtml = useHtmlImages(hydratedHtml);
  const Img = ImageComponent;
  const p = ui.classPrefix;
  const extra = typeof articleExtraLine === 'function' ? articleExtraLine(article) : null;
  const usage = article.usage && typeof article.usage === 'object' ? article.usage : null;
  const assets = Array.isArray(article.assets) ? article.assets : [];
  return (
    <article className={`${p}-read-article`}>
      <header>
        <h3>{String(article.title || '').trim() || 'Article sans titre'}</h3>
        <p className={`${ui.hintClassName || ''} ${p}-read-meta`.trim()}>
          {article.updatedAt ? <>Modifié le {formatDateTime(article.updatedAt)}</> : null}
          {article.createdAt ? <> · créé le {formatDateTime(article.createdAt)}</> : null}
          {usage ? (
            <>
              {' · '}
              {usage.charCount ?? 0} caractères · {usage.assetCount ?? assets.length}{' '}
              illustration(s)
            </>
          ) : null}
        </p>
        {extra ? <p className={ui.hintClassName || ''}>{extra}</p> : null}
      </header>
      {html ? (
        <div
          className={ui.markdownClassName || ''}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      ) : (
        <p className={ui.hintClassName || ''}>Article sans texte.</p>
      )}
      {assets.length > 0 ? (
        <div className={`${p}__assets-inline`}>
          {assets.map((a) => (
            <Img key={a.id} src={a.url} alt="" loading="lazy" className={`${p}__asset-thumb`} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Lecture d'un carnet par un professeur (ForetMap) ou le maître du jeu (G&L) : comptages,
 * articles (dates, volumes, texte enrichi, illustrations), éléments importés filtrables par
 * type, export Markdown. Composant unique ; le produit fournit son adaptateur (route de
 * lecture), ses métadonnées d'imports, ses libellés et son habillage.
 *
 * @param {object} props
 * @param {string|number} props.subjectId identifiant du propriétaire du carnet
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {import('./journalAdapter.js').JournalAdapter} props.adapter
 * @param {{ importTypeMeta: (type: string) => { label: string, icon?: string } }} props.meta
 * @param {object} props.ui habillage produit (`FM_JOURNAL_UI` / `GL_JOURNAL_UI`)
 * @param {object} props.texts
 * @param {(subject: object|null, subjectId) => string} props.texts.subjectLabel
 * @param {(subject: object|null, subjectId) => string} props.texts.fileName nom du fichier exporté
 * @param {string} props.texts.empty message quand le carnet est vide
 * @param {(article: object) => string|null} [props.articleExtraLine] ligne produit sous le titre (zone…)
 * @param {import('react').ElementType} [props.ImageComponent] composant des illustrations
 *        (ForetMap : `AuthedImage`, les fichiers du carnet étant servis derrière JWT)
 * @param {(html: string) => string} [props.useHtmlImages] hook de réécriture des `<img>` du
 *        Markdown rendu (même raison ; identité par défaut)
 */
export function JournalReadModal({
  subjectId,
  open,
  onClose,
  adapter,
  meta,
  ui,
  texts,
  articleExtraLine = null,
  ImageComponent = 'img',
  useHtmlImages = useHtmlAsIs,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [importFilter, setImportFilter] = useState('all');
  const p = ui.classPrefix;
  const Btn = ui.Button || Button;
  const btnProps = { type: 'button', variant: 'secondary', ...(ui.modalButtonProps || {}) };

  useEffect(() => {
    if (!open || !subjectId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    adapter
      .fetchSubjectJournal(subjectId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Lecture impossible');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, subjectId, adapter]);

  const subject = data?.user ?? data?.player ?? null;
  const articles = useMemo(() => (Array.isArray(data?.articles) ? data.articles : []), [data]);
  const imports = useMemo(() => (Array.isArray(data?.imports) ? data.imports : []), [data]);
  const importTypes = useMemo(() => [...new Set(imports.map((i) => i.resourceType))], [imports]);
  const filteredImports = useMemo(
    () =>
      importFilter === 'all' ? imports : imports.filter((i) => i.resourceType === importFilter),
    [imports, importFilter],
  );
  const subjectLabel = texts.subjectLabel(subject, subjectId);

  function handleExport() {
    downloadTextFile(
      texts.fileName(subject, subjectId),
      buildJournalExport({
        subjectLabel,
        articles,
        imports,
        importTypeMeta: meta.importTypeMeta,
        articleExtraLine,
      }),
      'text/markdown;charset=utf-8',
    );
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName={`fm-modal-overlay ${p}-read-modal`}
      dialogClassName={`fm-modal-panel animate-pop ${ui.modalBodyClassName || ''} ${p}-read-modal__body`}
      ariaLabelledBy={`${p}-read-title`}
    >
      <header className={ui.modalHeadClassName || ''}>
        <h2 id={`${p}-read-title`}>Carnet de {subjectLabel}</h2>
        <Btn {...btnProps} onClick={onClose} aria-label="Fermer">
          ✕
        </Btn>
      </header>
      <div>
        {loading ? <p className={ui.hintClassName || ''}>Chargement…</p> : null}
        {error ? <p className={ui.errorClassName || ''}>{error}</p> : null}
        {!loading && !error && data ? (
          articles.length > 0 || imports.length > 0 ? (
            <div className={`${p}-read-list`}>
              <div className={`${p}-read-summary ${ui.actionsClassName || ''}`.trim()}>
                <p className={ui.hintClassName || ''} style={{ margin: 0 }}>
                  <strong>{articles.length}</strong> article(s) · <strong>{imports.length}</strong>{' '}
                  import(s)
                </p>
                <Btn {...btnProps} onClick={handleExport}>
                  Exporter (.md)
                </Btn>
              </div>
              {articles.map((article) => (
                <ReadArticle
                  key={`a-${article.id}`}
                  article={article}
                  adapter={adapter}
                  ui={ui}
                  articleExtraLine={articleExtraLine}
                  ImageComponent={ImageComponent}
                  useHtmlImages={useHtmlImages}
                />
              ))}
              {imports.length > 0 ? (
                <section className={`${p}-read-imports`}>
                  <div className={ui.actionsClassName || ''}>
                    <h3 style={{ margin: 0 }}>Éléments importés ({filteredImports.length})</h3>
                    {importTypes.length > 1 ? (
                      <label className={ui.hintClassName || ''}>
                        Filtrer :{' '}
                        <select
                          value={importFilter}
                          onChange={(e) => setImportFilter(e.target.value)}
                          aria-label="Filtrer les imports par type"
                        >
                          <option value="all">Tous les types</option>
                          {importTypes.map((t) => (
                            <option key={t} value={t}>
                              {meta.importTypeMeta(t).label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <ul>
                    {filteredImports.map((item) => {
                      const typeMeta = meta.importTypeMeta(item.resourceType);
                      return (
                        <li key={`i-${item.id}`}>
                          <span aria-hidden="true">{typeMeta.icon}</span> {typeMeta.label} —{' '}
                          <strong>{item.title || item.resourceRef}</strong>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <p className={ui.hintClassName || ''}>{texts.empty}</p>
          )
        ) : null}
      </div>
      <Btn {...btnProps} onClick={onClose}>
        Fermer
      </Btn>
    </DialogShell>
  );
}
