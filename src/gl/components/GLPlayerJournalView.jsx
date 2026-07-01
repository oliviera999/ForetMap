import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalArticleCard } from './GLPlayerJournalArticleCard.jsx';
import { GLHelpPanel } from './GLHelpPanel.jsx';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';

export function GLPlayerJournalView({ gameState }) {
  // 0 = illimité (pas de plafond explicite) : valeur par défaut du carnet personnel.
  const [limits, setLimits] = useState({ maxChars: 0, maxAssets: 0 });
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
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

  return (
    <section className="gl-panel gl-player-journal fade-in">
      <header className="gl-player-journal__header">
        <div>
          <h2>Mon journal</h2>
          <p className="gl-hint gl-player-journal__intro">
            Ton carnet personnel, organisé en articles : clique sur « Nouvel article » pour noter ce
            que tu veux, associer des images à ton texte, ou simplement publier des médias. Tu peux
            tout modifier à tout moment. Le maître du jeu peut le consulter pour t’accompagner.
          </p>
        </div>
      </header>

      <GLHelpPanel helpKey="tab:my-journal" title={helpTitle} body={helpBody} defaultOpen={false} />

      <div className="gl-player-journal__actions gl-inline-actions">
        <GLButton type="button" onClick={handleNewArticle} disabled={creating}>
          {creating ? 'Création…' : '+ Nouvel article'}
        </GLButton>
      </div>

      {error ? <p className="gl-error">{error}</p> : null}

      {loading ? (
        <p className="gl-hint">Chargement de ton carnet…</p>
      ) : articles.length === 0 ? (
        <p className="gl-hint gl-player-journal__empty">
          Ton carnet est vide. Crée ton premier article pour commencer.
        </p>
      ) : (
        <div className="gl-player-journal__articles">
          {articles.map((article) => (
            <GLPlayerJournalArticleCard
              key={article.id}
              article={article}
              limits={limits}
              chapterSpells={chapterSpells}
              onDelete={handleDeleteArticle}
            />
          ))}
        </div>
      )}
    </section>
  );
}
