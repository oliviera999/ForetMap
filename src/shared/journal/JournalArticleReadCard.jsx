import { useMemo } from 'react';
import { useAppDialogs } from '../components/AppDialogsProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { renderMarkdownToSafeHtml } from '../platform/markdown.js';
import { formatDateTime } from '../utils/formatDateTime.js';
import { useJournalEmbedTitles } from './useJournalEmbedTitles.js';

/**
 * Carte lecture d’un article de carnet (mode feuilleter). Affiche le markdown enrichi,
 * les vignettes, les actions Épingler / Modifier / Supprimer. L’édition vit dans la
 * carte produit (UserJournalArticleCard / GLPlayerJournalArticleCard).
 */
export function JournalArticleReadCard({
  article,
  adapter,
  ui,
  onEdit = null,
  onDelete = null,
  onTogglePin = null,
  extraMetaLine = null,
  deleting = false,
  pinning = false,
}) {
  const { confirm } = useAppDialogs();
  const p = ui.classPrefix;
  const Btn = ui.Button || Button;
  const btnProps = { type: 'button', variant: 'secondary', ...(ui.buttonProps || {}) };
  const pinned = !!article.pinned;
  const title = String(article.title || '').trim() || 'Article sans titre';
  const assets = Array.isArray(article.assets) ? article.assets : [];
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
  const dateLabel = article.updatedAt || article.createdAt;

  return (
    <article
      className={`${ui.cardClassName || ''} ${p}__article ${p}__article--read fade-in${pinned ? ' is-pinned' : ''}`.trim()}
      data-testid="journal-article-read"
    >
      <header className={`${p}__article-head`}>
        <h3 className={`${p}__article-title-read`}>
          {pinned ? <span aria-hidden="true">📌 </span> : null}
          {title}
        </h3>
        <div className={`${p}__import-actions`}>
          {onTogglePin ? (
            <Btn
              {...btnProps}
              onClick={() => onTogglePin(article.id, !pinned)}
              disabled={pinning}
              aria-pressed={pinned}
              aria-label={pinned ? 'Désépingler l’article' : 'Épingler l’article'}
            >
              {pinned ? 'Épinglé' : 'Épingler'}
            </Btn>
          ) : null}
          {onEdit ? (
            <Btn {...btnProps} onClick={() => onEdit(article.id)} aria-label="Modifier l’article">
              Modifier
            </Btn>
          ) : null}
          {onDelete ? (
            <Btn
              {...btnProps}
              onClick={async () => {
                if (
                  !(await confirm({
                    message: 'Supprimer cet article ? Cette action est définitive.',
                    danger: true,
                  }))
                ) {
                  return;
                }
                onDelete(article.id);
              }}
              disabled={deleting}
              aria-label="Supprimer l’article"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Btn>
          ) : null}
        </div>
      </header>
      <p className={`${ui.hintClassName || ''} ${p}__article-meta`.trim()}>
        {dateLabel ? <>{formatDateTime(dateLabel)}</> : null}
        {extraMetaLine ? <> · {extraMetaLine}</> : null}
      </p>
      {html ? (
        <div
          className={ui.markdownClassName || ''}
          dangerouslySetInnerHTML={{ __html: hydratedHtml }}
        />
      ) : (
        <p className={ui.hintClassName || ''}>Article sans texte.</p>
      )}
      {assets.length > 0 ? (
        <div className={`${p}__assets-inline`}>
          {assets.map((a) => (
            <img key={a.id} src={a.url} alt="" loading="lazy" className={`${p}__asset-thumb`} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
