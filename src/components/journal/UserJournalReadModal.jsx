import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { DialogShell } from '../DialogShell.jsx';
import { renderMarkdownToSafeHtml } from '../../shared/platform/markdown.js';
import { useFmJournalEmbedTitles } from '../../hooks/useFmJournalEmbedTitles.js';
import { importTypeMeta } from '../../utils/fmJournalMeta.js';

function buildJournalExport({ user, articles, imports }) {
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.pseudo || 'Carnet';
  const lines = [`# Carnet de ${name}`, ''];
  for (const a of articles || []) {
    lines.push(`## ${a.title || 'Sans titre'}`);
    if (a.zoneName) lines.push(`_Zone : ${a.zoneName}_`);
    lines.push('');
    lines.push(a.bodyMarkdown || '');
    lines.push('');
  }
  if (imports?.length) {
    lines.push('## Éléments importés', '');
    for (const i of imports) {
      const meta = importTypeMeta(i.resourceType);
      lines.push(`- **${meta.label}** : ${i.title || i.resourceRef}`);
    }
  }
  return lines.join('\n');
}

function ReadArticle({ article }) {
  const html = useMemo(
    () =>
      renderMarkdownToSafeHtml(article.bodyMarkdown || '', {
        allowImages: true,
        allowJournalEmbeds: true,
      }),
    [article.bodyMarkdown],
  );
  const hydrated = useFmJournalEmbedTitles(html);
  return (
    <article className="fm-journal-read-article">
      <h3>{article.title || 'Sans titre'}</h3>
      {article.zoneName ? <p className="hint">Zone : {article.zoneName}</p> : null}
      <div className="fm-journal-markdown" dangerouslySetInnerHTML={{ __html: hydrated }} />
      {Array.isArray(article.assets) && article.assets.length > 0 ? (
        <div className="fm-journal__assets-inline">
          {article.assets.map((a) => (
            <img key={a.id} src={a.url} alt="" loading="lazy" className="fm-journal__asset-thumb" />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Lecture staff d’un carnet + export Markdown.
 */
export function UserJournalReadModal({ userId, open, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [importFilter, setImportFilter] = useState('all');

  useEffect(() => {
    if (!open || !userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/api/user-journal/users/${userId}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Lecture impossible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const filteredImports = useMemo(() => {
    const rows = Array.isArray(data?.imports) ? data.imports : [];
    if (importFilter === 'all') return rows;
    return rows.filter((i) => i.resourceType === importFilter);
  }, [data?.imports, importFilter]);

  function handleExport() {
    const md = buildJournalExport({
      user: data?.user,
      articles: data?.articles,
      imports: data?.imports,
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carnet-${userId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const displayName =
    [data?.user?.firstName, data?.user?.lastName].filter(Boolean).join(' ') ||
    data?.user?.pseudo ||
    `Utilisateur #${userId}`;

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel animate-pop fm-journal-read-modal"
      ariaLabelledBy="fm-journal-read-title"
    >
      <header className="fm-journal-modal-head">
        <h2 id="fm-journal-read-title">Carnet — {displayName}</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </header>
      {loading ? <p className="hint">Chargement…</p> : null}
      {error ? <p className="auth-error">{error}</p> : null}
      {data && !loading ? (
        <>
          <div className="fm-journal-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport}>
              Exporter .md
            </button>
            <span className="hint">
              {(data.articles || []).length} article(s) · {(data.imports || []).length} import(s)
            </span>
          </div>
          <div className="fm-journal-read-list">
            {(data.articles || []).map((a) => (
              <ReadArticle key={a.id} article={a} />
            ))}
          </div>
          {(data.imports || []).length > 0 ? (
            <section className="fm-journal-read-imports">
              <h3>Imports</h3>
              <label className="hint">
                Filtrer :{' '}
                <select value={importFilter} onChange={(e) => setImportFilter(e.target.value)}>
                  <option value="all">Tout</option>
                  <option value="plant">Espèces</option>
                  <option value="glossary">Glossaire</option>
                  <option value="tutorial">Tutoriels</option>
                </select>
              </label>
              <ul>
                {filteredImports.map((i) => {
                  const meta = importTypeMeta(i.resourceType);
                  return (
                    <li key={i.id}>
                      {meta.icon} <strong>{meta.label}</strong> — {i.title || i.resourceRef}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </DialogShell>
  );
}
