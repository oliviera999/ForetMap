import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLContentPage } from './GLContentPage.jsx';
import { GLChaptersAdminView } from './GLChaptersAdminView.jsx';
import { GLSpeciesImportPanel } from './admin/GLSpeciesImportPanel.jsx';
import { GLGlossaryImportPanel } from './admin/GLGlossaryImportPanel.jsx';

export function GLContentsAdminView({ auth, onNavigateTab }) {
  const [section, setSection] = useState('pages');
  const [items, setItems] = useState([]);
  const [activeSlug, setActiveSlug] = useState('world');
  const [error, setError] = useState('');

  async function load() {
    try {
      const rows = await apiGL('/api/gl/admin/content');
      const list = Array.isArray(rows) ? rows : [];
      setItems(list);
      if (!list.some((item) => item.slug === activeSlug)) {
        setActiveSlug(list[0]?.slug || 'world');
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des contenus impossible');
    }
  }

  useEffect(() => {
    if (section === 'pages') load();
  }, [section]);

  return (
    <section className="gl-panel">
      <h2>Contenus editoriaux</h2>
      <nav className="gl-subtabs">
        <button
          type="button"
          className={section === 'pages' ? 'is-active' : ''}
          onClick={() => setSection('pages')}
          data-subtab="pages"
        >
          Pages
        </button>
        <button
          type="button"
          className={section === 'chapters' ? 'is-active' : ''}
          onClick={() => setSection('chapters')}
          data-subtab="chapters"
        >
          Chapitres
        </button>
        <button
          type="button"
          className={section === 'species' ? 'is-active' : ''}
          onClick={() => setSection('species')}
          data-subtab="species"
        >
          Espèces
        </button>
        <button
          type="button"
          className={section === 'glossary' ? 'is-active' : ''}
          onClick={() => setSection('glossary')}
          data-subtab="glossary"
        >
          Glossaire
        </button>
      </nav>

      {section === 'pages' ? (
        <>
          {error ? <p className="gl-error">{error}</p> : null}
          <div className="gl-content-admin-list">
            {items.map((item) => (
              <button
                key={item.slug}
                type="button"
                className={item.slug === activeSlug ? 'is-active' : ''}
                onClick={() => setActiveSlug(item.slug)}
              >
                {item.title || item.slug}
              </button>
            ))}
          </div>
          {activeSlug ? (
            <GLContentPage
              slug={activeSlug}
              fallbackTitle={items.find((item) => item.slug === activeSlug)?.title || activeSlug}
              auth={auth}
              onSaved={load}
              onNavigateTab={onNavigateTab}
            />
          ) : null}
        </>
      ) : section === 'chapters' ? (
        <GLChaptersAdminView />
      ) : section === 'species' ? (
        <GLSpeciesImportPanel />
      ) : (
        <GLGlossaryImportPanel />
      )}
    </section>
  );
}
