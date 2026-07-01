import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLLoreGlossaryMarkdown } from './GLLoreGlossaryMarkdown.jsx';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLFeuilletIllustration, GLFeuilletCoupeIllustration } from './GLFeuilletIllustration.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLLearnAndImport } from './GLLearnAndImport.jsx';

function groupByLiasse(items) {
  const groups = {};
  for (const item of items) {
    const key = item.liasse || '—';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export function GLSeleneCarnetView({
  gameState,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
  focusFeuilletCode = null,
  onFeuilletFocusHandled,
  isMj = false,
}) {
  const gameId = gameState?.game?.id;
  const teamId = gameState?.teams?.[0]?.id;
  const biomeSlugs = useMemo(
    () => (gameState?.game?.chapter_biomes || []).map((b) => b.slug).filter(Boolean),
    [gameState?.game?.chapter_biomes],
  );

  const [viewMode, setViewMode] = useState('voyage');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCode, setActiveCode] = useState(null);
  const [showNarrative, setShowNarrative] = useState(isMj);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (biomeSlugs.length) params.set('biomeSlugs', biomeSlugs.join(','));
      if (gameId) params.set('gameId', String(gameId));
      if (teamId) params.set('teamId', String(teamId));
      const data = await apiGL(`/api/gl/lore/feuillets?${params.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement du carnet impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [biomeSlugs, gameId, teamId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep-link depuis le carnet : ouvre le feuillet ciblé une fois la liste chargée
  // (s'il est accessible au joueur). onFocusHandled purge la cible.
  useEffect(() => {
    if (!focusFeuilletCode || loading) return;
    if (items.some((it) => it.feuilletCode === focusFeuilletCode)) {
      setActiveCode(focusFeuilletCode);
    }
    onFeuilletFocusHandled?.();
  }, [focusFeuilletCode, loading, items, onFeuilletFocusHandled]);

  const grouped = useMemo(() => groupByLiasse(items), [items]);
  const sortedItems = useMemo(() => {
    if (viewMode === 'voyage') {
      return [...items].sort((a, b) => (a.ordreVoyage || 0) - (b.ordreVoyage || 0));
    }
    return items;
  }, [items, viewMode]);

  const active = items.find((item) => item.feuilletCode === activeCode) || null;
  const activeLocked = !!active && active.progressStatus === 'locked' && !isMj;
  const modeClass = active?.modeApparition
    ? `gl-feui-${String(active.modeApparition).replace(/_/g, '-')}`
    : '';

  async function markRead(code) {
    if (!gameId || !teamId || !code) return;
    try {
      await apiGL(
        `/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(code)}/read`,
        'POST',
        { teamId },
      );
      loadList();
    } catch {
      /* non bloquant */
    }
  }

  return (
    <article className="gl-panel gl-selene-carnet fade-in">
      <header className="gl-selene-carnet__head">
        <h2>Carnet de Sélène</h2>
        <p className="gl-hint">
          Feuillets épars du voyage — découvertes sur la carte et lectures du passeur.
        </p>
        <div className="gl-selene-carnet__modes">
          <button
            type="button"
            className={viewMode === 'voyage' ? 'is-active' : ''}
            onClick={() => setViewMode('voyage')}
          >
            Vue voyage
          </button>
          <button
            type="button"
            className={viewMode === 'liasse' ? 'is-active' : ''}
            onClick={() => setViewMode('liasse')}
          >
            Vue liasse
          </button>
          {isMj ? (
            <label className="gl-selene-carnet__toggle">
              <input
                type="checkbox"
                checked={showNarrative}
                onChange={(e) => setShowNarrative(e.target.checked)}
              />
              Texte intégral
            </label>
          ) : null}
        </div>
      </header>

      {error ? <p className="gl-error">{error}</p> : null}
      {loading ? <p className="gl-hint">Chargement…</p> : null}

      <div className="gl-selene-carnet__layout">
        <aside className="gl-selene-carnet__list">
          {viewMode === 'liasse' ? (
            Object.entries(grouped).map(([liasse, rows]) => (
              <section key={liasse} className="gl-selene-carnet__liasse">
                <h3>{liasse === '—' ? 'Sans liasse' : `Liasse ${liasse}`}</h3>
                <ul>
                  {[...rows]
                    .sort((a, b) => (a.ordreLiasse || 0) - (b.ordreLiasse || 0))
                    .map((item) => (
                      <li key={item.feuilletCode}>
                        <button
                          type="button"
                          className={activeCode === item.feuilletCode ? 'is-active' : ''}
                          onClick={() => setActiveCode(item.feuilletCode)}
                        >
                          <span>{item.titre || item.feuilletCode}</span>
                          {!isMj && item.progressStatus === 'locked' ? (
                            <span
                              className="gl-selene-carnet__badge gl-selene-carnet__badge--locked"
                              title="Feuillet non découvert"
                            >
                              🔒
                            </span>
                          ) : item.progressStatus && item.progressStatus !== 'locked' ? (
                            <span className="gl-selene-carnet__badge">{item.progressStatus}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          ) : (
            <ul className="gl-selene-carnet__timeline">
              {sortedItems.map((item) => (
                <li key={item.feuilletCode}>
                  <button
                    type="button"
                    className={activeCode === item.feuilletCode ? 'is-active' : ''}
                    onClick={() => setActiveCode(item.feuilletCode)}
                  >
                    <span className="gl-selene-carnet__ordre">{item.ordreVoyage || '·'}</span>
                    <span>{item.titre || item.feuilletCode}</span>
                    {!isMj && item.progressStatus === 'locked' ? (
                      <span
                        className="gl-selene-carnet__badge gl-selene-carnet__badge--locked"
                        title="Feuillet non découvert"
                      >
                        🔒
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={`gl-selene-carnet__reader ${modeClass}`}>
          {!active ? (
            <p className="gl-hint">Sélectionnez un feuillet dans la liste.</p>
          ) : (
            <div
              className={
                active.imageUrl || active.feuilletCode ? 'gl-selene-carnet__spread' : undefined
              }
            >
              <GLFeuilletIllustration
                feuilletCode={activeLocked ? null : active.feuilletCode}
                fallbackUrl={active.imageUrl}
                figureClassName="gl-selene-carnet__illu"
              />
              <div className="gl-selene-carnet__content">
                <h3>{active.titre}</h3>
                {active.incipit ? (
                  <p className="gl-selene-carnet__incipit">{active.incipit}</p>
                ) : null}
                {activeLocked ? (
                  <p className="gl-hint gl-selene-carnet__locked">
                    🔒 Feuillet non découvert — trouvez-le sur la carte (traversée d’une zone
                    feuillet) pour le lire.
                  </p>
                ) : null}
                {(() => {
                  const body = showNarrative && active.texte ? active.texte : active.displayText;
                  return body ? (
                    <GLLoreGlossaryMarkdown
                      markdown={body}
                      loreGlossaryItems={loreGlossaryLinkItems}
                      onOpenLoreTerm={onOpenLoreTerm}
                      className="gl-selene-carnet__text"
                    />
                  ) : null;
                })()}
                {active.imageCoupeUrl ? (
                  <details className="gl-selene-carnet__coupe">
                    <summary>Coupe</summary>
                    <GLFeuilletCoupeIllustration
                      url={active.imageCoupeUrl}
                      figureClassName="gl-selene-carnet__illu"
                    />
                  </details>
                ) : null}
                {active.ancrageScientifique ? (
                  <aside className="gl-selene-carnet__science">
                    <h4>Ancrage scientifique</h4>
                    <GLGlossaryMarkdown
                      markdown={active.ancrageScientifique}
                      glossaryItems={glossaryLinkItems}
                      onOpenGlossaryTerm={onOpenGlossaryTerm}
                    />
                  </aside>
                ) : null}
                {gameId && teamId && active.progressStatus !== 'locked' ? (
                  <GLButton type="button" onClick={() => markRead(active.feuilletCode)}>
                    Marquer comme lu
                  </GLButton>
                ) : null}
                {active.feuilletCode ? (
                  <GLLearnAndImport
                    resourceType="feuillet"
                    resourceRef={active.feuilletCode}
                    title={active.titre || active.feuilletCode}
                    acknowledgeLabel="Marquer comme découvert"
                    learnedLabel="✓ Découvert"
                  />
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
