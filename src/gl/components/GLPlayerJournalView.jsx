import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalArticleCard } from './GLPlayerJournalArticleCard.jsx';
import { GLPlayerJournalImportCard } from './GLPlayerJournalImportCard.jsx';
import { GLHelpPanel } from './GLHelpPanel.jsx';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';

function timeValue(v) {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

export function GLPlayerJournalView({ gameState, onNavigateTab }) {
  // 0 = illimité (pas de plafond explicite) : valeur par défaut du carnet personnel.
  const [limits, setLimits] = useState({ maxChars: 0, maxAssets: 0 });
  const [articles, setArticles] = useState([]);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  // B.7 — contrôles de tri/filtre/recherche du fil (côté client, sur les données déjà chargées).
  const [kindFilter, setKindFilter] = useState('all'); // all | article | import
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('recent'); // recent | oldest
  const { title: helpTitle, body: helpBody } = useGlHelpContent('tab:my-journal');

  const chapterSpells = useMemo(() => {
    const rows = Array.isArray(gameState?.game?.chapter_spells)
      ? gameState.game.chapter_spells
      : [];
    return rows.map((r) => String(r.spell_code || r.spellCode || '').trim()).filter(Boolean);
  }, [gameState?.game?.chapter_spells]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGL('/api/gl/player-journal/me');
      setLimits(data?.limits || { maxChars: 0, maxAssets: 0 });
      setArticles(Array.isArray(data?.articles) ? data.articles : []);
      setImports(Array.isArray(data?.imports) ? data.imports : []);
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleNewArticle = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const data = await apiGL('/api/gl/player-journal/me/articles', 'POST', { bodyMarkdown: '' });
      if (data?.article) setArticles((prev) => [data.article, ...prev]);
    } catch (err) {
      setError(err.message || 'Création impossible');
    } finally {
      setCreating(false);
    }
  }, [creating]);

  const handleDeleteArticle = useCallback(async (articleId) => {
    await apiGL(`/api/gl/player-journal/me/articles/${articleId}`, 'DELETE');
    setArticles((prev) => prev.filter((a) => a.id !== articleId));
  }, []);

  const handleDeleteImport = useCallback(async (importId) => {
    await apiGL(`/api/gl/player-journal/me/imports/${importId}`, 'DELETE');
    setImports((prev) => prev.filter((i) => i.id !== importId));
  }, []);

  // Fil unifié : articles rédigés + éléments importés, filtré/recherché/trié (côté client).
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
    items.sort((x, y) => (sortOrder === 'oldest' ? x.at - y.at : y.at - x.at));
    return items;
  }, [articles, imports, kindFilter, search, sortOrder]);

  const totalCount = articles.length + imports.length;

  return (
    <section className="gl-panel gl-player-journal fade-in">
      <header className="gl-player-journal__header">
        <div>
          <h2>Mon journal</h2>
          <p className="gl-hint gl-player-journal__intro">
            Ton carnet personnel, en ordre chronologique : clique sur « Nouvel article » pour noter
            ce que tu veux (texte, images ou médias seuls). Tu peux aussi importer ici les éléments
            du site que tu as appris (feuillets, écosystèmes, fiches biodiversité, tutos,
            définitions…) depuis leur page. Le maître du jeu peut te consulter pour t’accompagner.
          </p>
        </div>
      </header>

      <GLHelpPanel helpKey="tab:my-journal" title={helpTitle} body={helpBody} defaultOpen={false} />

      <div className="gl-player-journal__actions gl-inline-actions">
        <GLButton type="button" onClick={handleNewArticle} disabled={creating}>
          {creating ? 'Création…' : '+ Nouvel article'}
        </GLButton>
      </div>

      {!loading && totalCount > 0 ? (
        <div className="gl-player-journal__toolbar gl-inline-actions">
          <input
            type="search"
            className="gl-input gl-player-journal__search"
            placeholder="Rechercher dans mon journal…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher dans mon journal"
          />
          <label className="gl-hint">
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
          <label className="gl-hint">
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

      {error ? <p className="gl-error">{error}</p> : null}

      {loading ? (
        <p className="gl-hint">Chargement de ton carnet…</p>
      ) : totalCount === 0 ? (
        <p className="gl-hint gl-player-journal__empty">
          Ton carnet est vide. Crée ton premier article, ou importe un élément appris depuis sa
          page.
        </p>
      ) : timeline.length === 0 ? (
        <p className="gl-hint gl-player-journal__empty">
          Aucune entrée ne correspond à ta recherche ou à ce filtre.
        </p>
      ) : (
        <div className="gl-player-journal__articles">
          {timeline.map((entry) =>
            entry.kind === 'article' ? (
              <GLPlayerJournalArticleCard
                key={`a-${entry.data.id}`}
                article={entry.data}
                limits={limits}
                chapterSpells={chapterSpells}
                onDelete={handleDeleteArticle}
              />
            ) : (
              <GLPlayerJournalImportCard
                key={`i-${entry.data.id}`}
                item={entry.data}
                onNavigateTab={onNavigateTab}
                onDelete={handleDeleteImport}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
