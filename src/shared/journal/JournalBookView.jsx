import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { renderMarkdownToSafeHtml } from '../platform/markdown.js';
import { formatDateTime } from '../utils/formatDateTime.js';
import { buildJournalTimeline } from './journalFeed.js';
import { useJournalEmbedTitles } from './useJournalEmbedTitles.js';

function BookArticlePage({ article, adapter, ui, articleExtraLine }) {
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
  const p = ui.classPrefix;
  const extra = typeof articleExtraLine === 'function' ? articleExtraLine(article) : null;
  const assets = Array.isArray(article.assets) ? article.assets : [];
  const title = String(article.title || '').trim() || 'Article sans titre';
  return (
    <section className={`${p}-book__page`} id={`journal-book-a-${article.id}`}>
      <h2>{title}</h2>
      <p className={ui.hintClassName || ''}>
        {article.createdAt ? formatDateTime(article.createdAt) : null}
        {extra ? <> · {extra}</> : null}
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
            <img key={a.id} src={a.url} alt="" className={`${p}__asset-thumb`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Vue « livre » imprimable du carnet : couverture, sommaire, pages articles, annexes
 * (éléments appris), colophon. Impression via window.print() (@media print).
 *
 * @param {object} props
 * @param {object[]} props.articles
 * @param {object[]} props.imports
 * @param {import('./journalAdapter.js').JournalAdapter} props.adapter
 * @param {object} props.ui
 * @param {string} props.ownerLabel
 * @param {string} [props.productLabel='ForetMap']
 * @param {boolean} [props.yearbook=false] options livre de l’année (période + épinglés)
 * @param {() => void} [props.onClose]
 * @param {(type: string) => { label: string, icon?: string }} props.importTypeMeta
 * @param {(article: object) => string|null} [props.articleExtraLine]
 */
export function JournalBookView({
  articles = [],
  imports = [],
  adapter,
  ui,
  ownerLabel,
  productLabel = 'ForetMap',
  yearbook = false,
  onClose = null,
  importTypeMeta,
  articleExtraLine = null,
}) {
  const p = ui.classPrefix;
  const Btn = ui.Button || Button;
  const btnProps = { type: 'button', variant: 'secondary', ...(ui.modalButtonProps || {}) };
  const primaryProps = { type: 'button', variant: 'primary', ...(ui.primaryButtonProps || {}) };

  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [preface, setPreface] = useState('');

  const filteredArticles = useMemo(() => {
    let rows = Array.isArray(articles) ? [...articles] : [];
    if (pinnedOnly) rows = rows.filter((a) => a.pinned);
    if (periodStart) {
      const t0 = new Date(periodStart).getTime();
      rows = rows.filter((a) => {
        const t = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return Number.isFinite(t) && t >= t0;
      });
    }
    if (periodEnd) {
      const t1 = new Date(periodEnd).getTime() + 86400000 - 1;
      rows = rows.filter((a) => {
        const t = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return Number.isFinite(t) && t <= t1;
      });
    }
    return rows;
  }, [articles, pinnedOnly, periodStart, periodEnd]);

  const filteredImports = useMemo(() => {
    let rows = Array.isArray(imports) ? [...imports] : [];
    if (pinnedOnly) rows = rows.filter((i) => i.pinned);
    if (periodStart) {
      const t0 = new Date(periodStart).getTime();
      rows = rows.filter((i) => {
        const t = i.createdAt ? new Date(i.createdAt).getTime() : 0;
        return Number.isFinite(t) && t >= t0;
      });
    }
    if (periodEnd) {
      const t1 = new Date(periodEnd).getTime() + 86400000 - 1;
      rows = rows.filter((i) => {
        const t = i.createdAt ? new Date(i.createdAt).getTime() : 0;
        return Number.isFinite(t) && t <= t1;
      });
    }
    return rows;
  }, [imports, pinnedOnly, periodStart, periodEnd]);

  const tocArticles = useMemo(
    () =>
      buildJournalTimeline({
        articles: filteredArticles,
        imports: [],
        sortOrder: 'oldest',
      }).map((e) => e.data),
    [filteredArticles],
  );

  const importsByType = useMemo(() => {
    const map = new Map();
    for (const item of filteredImports) {
      const type = item.resourceType || 'other';
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(item);
    }
    return [...map.entries()];
  }, [filteredImports]);

  const schoolYear = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }, []);

  useEffect(() => {
    document.body.classList.add('journal-book-open');
    return () => document.body.classList.remove('journal-book-open');
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className={`${p}-book fm-journal-book`} data-testid="journal-book">
      <div className={`${p}-book__toolbar fm-journal-book__toolbar fm-journal-book__no-print`}>
        {onClose ? (
          <Btn {...btnProps} onClick={onClose}>
            Retour au carnet
          </Btn>
        ) : null}
        <Btn {...primaryProps} onClick={handlePrint}>
          Imprimer / PDF
        </Btn>
      </div>

      {yearbook ? (
        <div
          className={`${p}-book__options fm-journal-book__no-print`}
          style={{ display: 'grid', gap: 8, marginBottom: 16 }}
        >
          <label className={ui.hintClassName || ''}>
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(e) => setPinnedOnly(e.target.checked)}
            />{' '}
            Articles et découvertes épinglés seulement
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label className={ui.hintClassName || ''}>
              Du{' '}
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </label>
            <label className={ui.hintClassName || ''}>
              au{' '}
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>
          <label className={ui.hintClassName || ''}>
            Préface (optionnel)
            <textarea
              rows={3}
              value={preface}
              onChange={(e) => setPreface(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              maxLength={2000}
            />
          </label>
        </div>
      ) : null}

      <header className={`${p}-book__cover fm-journal-book__cover`}>
        <p className={ui.hintClassName || ''}>{productLabel}</p>
        <h1>Carnet de {ownerLabel}</h1>
        <p>Année scolaire {schoolYear}</p>
        {preface.trim() ? (
          <p
            style={{ marginTop: 24, fontStyle: 'italic', maxWidth: '36rem', marginInline: 'auto' }}
          >
            {preface.trim()}
          </p>
        ) : null}
      </header>

      <nav className={`${p}-book__toc fm-journal-book__toc`} aria-label="Sommaire">
        <h2>Sommaire</h2>
        {tocArticles.length === 0 ? (
          <p className={ui.hintClassName || ''}>Aucun article dans cette sélection.</p>
        ) : (
          <ol>
            {tocArticles.map((a) => (
              <li key={a.id}>
                <a href={`#journal-book-a-${a.id}`}>
                  {String(a.title || '').trim() || 'Article sans titre'}
                </a>
              </li>
            ))}
          </ol>
        )}
      </nav>

      {tocArticles.map((article) => (
        <BookArticlePage
          key={article.id}
          article={article}
          adapter={adapter}
          ui={ui}
          articleExtraLine={articleExtraLine}
        />
      ))}

      <section className={`${p}-book__annex fm-journal-book__annex`}>
        <h2>Annexes — Mes découvertes</h2>
        {importsByType.length === 0 ? (
          <p className={ui.hintClassName || ''}>Aucun élément appris dans cette sélection.</p>
        ) : (
          importsByType.map(([type, items]) => {
            const meta = importTypeMeta(type);
            return (
              <div key={type}>
                <h3>
                  {meta.icon ? <span aria-hidden="true">{meta.icon} </span> : null}
                  {meta.label}
                </h3>
                <ul className="fm-journal-book__annex-list">
                  {items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title || item.resourceRef}</strong>
                      {item.createdAt ? (
                        <span className={ui.hintClassName || ''}>
                          {' '}
                          — {formatDateTime(item.createdAt)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <footer className={`${p}-book__colophon fm-journal-book__colophon`}>
        <p className={ui.hintClassName || ''}>
          {productLabel} · Lycée Lyautey · Carnet personnel ·{' '}
          {formatDateTime(new Date().toISOString())}
        </p>
      </footer>
    </div>
  );
}
