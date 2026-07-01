import React, { useEffect, useMemo, useState } from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { apiGL } from '../services/apiGL.js';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';
import { GLButton } from './ui/GLButton.jsx';
import { importTypeMeta } from '../utils/glJournalImportMeta.js';
import { useGlJournalEmbedTitles } from '../hooks/useGlJournalEmbedTitles.js';

function playerLabel(player) {
  if (!player) return 'Joueur';
  const pseudo = String(player.pseudo || '').trim();
  const name = `${player.firstName || ''} ${player.lastName || ''}`.trim();
  if (pseudo && name) return `${pseudo} (${name})`;
  return pseudo || name || `Joueur #${player.id}`;
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}

// Construit un export texte (markdown) du carnet d'un joueur, pour l'accompagnement
// pédagogique du MJ (lecture seule). N'inclut pas les illustrations (binaire).
function buildJournalExport(player, articles, imports) {
  const lines = [`# Carnet de ${playerLabel(player)}`, ''];
  lines.push(`_${articles.length} article(s) · ${imports.length} import(s)_`, '');
  if (articles.length) {
    lines.push('## Articles', '');
    for (const a of articles) {
      lines.push(`### ${a.title?.trim() || 'Article sans titre'}`);
      const meta = [];
      if (a.createdAt) meta.push(`créé le ${formatDateTime(a.createdAt)}`);
      if (a.updatedAt) meta.push(`modifié le ${formatDateTime(a.updatedAt)}`);
      if (meta.length) lines.push(`_${meta.join(' · ')}_`);
      lines.push('', String(a.bodyMarkdown || '').trim() || '_(sans texte)_', '');
    }
  }
  if (imports.length) {
    lines.push('## Éléments importés', '');
    for (const it of imports) {
      const meta = importTypeMeta(it.resourceType);
      const when = it.createdAt ? ` (importé le ${formatDateTime(it.createdAt)})` : '';
      lines.push(`- ${meta.label} — ${it.title || it.resourceRef}${when}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function downloadTextFile(filename, content) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ReadArticle({ article }) {
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
  const hydratedHtml = useGlJournalEmbedTitles(html);
  return (
    <article className="gl-player-journal-read-article">
      <header>
        <h3>{article.title?.trim() || 'Article sans titre'}</h3>
        <p className="gl-hint gl-player-journal-read-meta">
          {article.updatedAt ? <>Modifié le {formatDateTime(article.updatedAt)}</> : null}
          {article.createdAt ? <> · créé le {formatDateTime(article.createdAt)}</> : null}
          {' · '}
          {article.usage?.charCount ?? 0} caractères · {article.usage?.assetCount ?? 0}{' '}
          illustration(s)
        </p>
      </header>
      {html ? (
        <div
          className="gl-markdown gl-player-journal-preview"
          dangerouslySetInnerHTML={{ __html: hydratedHtml }}
        />
      ) : (
        <p className="gl-hint">Article sans texte.</p>
      )}
    </article>
  );
}

export function GLPlayerJournalReadModal({ playerId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open || !playerId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGL(`/api/gl/player-journal/players/${playerId}`)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Chargement impossible');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, playerId]);

  const [importFilter, setImportFilter] = useState('all');

  const articles = Array.isArray(data?.articles) ? data.articles : [];
  const imports = Array.isArray(data?.imports) ? data.imports : [];
  const importTypes = useMemo(() => [...new Set(imports.map((i) => i.resourceType))], [imports]);
  const filteredImports = useMemo(
    () =>
      importFilter === 'all' ? imports : imports.filter((i) => i.resourceType === importFilter),
    [imports, importFilter],
  );

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay gl-player-journal-read-modal"
      dialogClassName="fm-modal-panel gl-profile-modal-body gl-player-journal-read-modal__body animate-pop"
      ariaLabelledBy="gl-journal-read-title"
    >
      <header className="gl-profile-modal-head">
        <h2 id="gl-journal-read-title">Carnet de {playerLabel(data?.player)}</h2>
        <GLButton type="button" variant="secondary" onClick={onClose} aria-label="Fermer">
          ✕
        </GLButton>
      </header>
      <div>
        {loading ? <p className="gl-hint">Chargement…</p> : null}
        {error ? <p className="gl-error">{error}</p> : null}
        {!loading && !error && data ? (
          articles.length > 0 || imports.length > 0 ? (
            <div className="gl-player-journal-read-list">
              <div className="gl-player-journal-read-summary gl-inline-actions">
                <p className="gl-hint" style={{ margin: 0 }}>
                  <strong>{articles.length}</strong> article(s) · <strong>{imports.length}</strong>{' '}
                  import(s)
                </p>
                <GLButton
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    downloadTextFile(
                      `carnet-${data?.player?.pseudo || data?.player?.id || 'joueur'}.md`,
                      buildJournalExport(data?.player, articles, imports),
                    )
                  }
                >
                  Exporter (.md)
                </GLButton>
              </div>
              {articles.map((article) => (
                <ReadArticle key={`a-${article.id}`} article={article} />
              ))}
              {imports.length > 0 ? (
                <section className="gl-player-journal-read-imports">
                  <div className="gl-inline-actions">
                    <h3 style={{ margin: 0 }}>Éléments importés ({filteredImports.length})</h3>
                    {importTypes.length > 1 ? (
                      <label className="gl-hint">
                        Filtrer :{' '}
                        <select
                          value={importFilter}
                          onChange={(e) => setImportFilter(e.target.value)}
                          aria-label="Filtrer les imports par type"
                        >
                          <option value="all">Tous les types</option>
                          {importTypes.map((t) => (
                            <option key={t} value={t}>
                              {importTypeMeta(t).label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <ul>
                    {filteredImports.map((item) => {
                      const meta = importTypeMeta(item.resourceType);
                      return (
                        <li key={`i-${item.id}`}>
                          <span aria-hidden="true">{meta.icon}</span> {meta.label} —{' '}
                          <strong>{item.title || item.resourceRef}</strong>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="gl-hint">Ce joueur n’a pas encore rédigé d’article dans son carnet.</p>
          )
        ) : null}
      </div>
      <GLButton type="button" variant="secondary" onClick={onClose}>
        Fermer
      </GLButton>
    </DialogShell>
  );
}
