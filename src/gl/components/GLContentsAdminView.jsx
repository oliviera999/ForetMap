import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLContentPage } from './GLContentPage.jsx';
import { GLChaptersAdminView } from './GLChaptersAdminView.jsx';
import { GLContentCatalogPanel } from './admin/GLContentCatalogPanel.jsx';
import { GLSpeciesImportPanel } from './admin/GLSpeciesImportPanel.jsx';
import { GLSpeciesEditorPanel } from './admin/GLSpeciesEditorPanel.jsx';
import { GLGlossaryImportPanel } from './admin/GLGlossaryImportPanel.jsx';
import { GLGlossaryEditorPanel } from './admin/GLGlossaryEditorPanel.jsx';
import { GLQcmImportPanel } from './admin/GLQcmImportPanel.jsx';
import { GLQcmLoreImportPanel } from './admin/GLQcmLoreImportPanel.jsx';
import { GLSpellsEditorPanel } from './admin/GLSpellsEditorPanel.jsx';
import { GLSpellsImportPanel } from './admin/GLSpellsImportPanel.jsx';
import { GLLoreFeuilletsImportPanel } from './admin/GLLoreFeuilletsImportPanel.jsx';
import { GLLoreGlossaryImportPanel } from './admin/GLLoreGlossaryImportPanel.jsx';
import { GLContentLibraryView } from './admin/GLContentLibraryView.jsx';
import { GLIntroAdminPanel } from './admin/GLIntroAdminPanel.jsx';

export function GLContentsAdminView({
  auth,
  onNavigateTab,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
}) {
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
        <button
          type="button"
          className={section === 'spells' ? 'is-active' : ''}
          onClick={() => setSection('spells')}
          data-subtab="spells"
        >
          Sortilèges
        </button>
        <button
          type="button"
          className={section === 'qcm-biomes' ? 'is-active' : ''}
          onClick={() => setSection('qcm-biomes')}
          data-subtab="qcm-biomes"
        >
          QCM biomes
        </button>
        <button
          type="button"
          className={section === 'qcm-lore' ? 'is-active' : ''}
          onClick={() => setSection('qcm-lore')}
          data-subtab="qcm-lore"
        >
          QCM lore
        </button>
        <button
          type="button"
          className={section === 'lore-carnet' ? 'is-active' : ''}
          onClick={() => setSection('lore-carnet')}
          data-subtab="lore-carnet"
        >
          Carnet Sélène
        </button>
        <button
          type="button"
          className={section === 'lore-glossary' ? 'is-active' : ''}
          onClick={() => setSection('lore-glossary')}
          data-subtab="lore-glossary"
        >
          Glossaire lore
        </button>
        <button
          type="button"
          className={section === 'intro' ? 'is-active' : ''}
          onClick={() => setSection('intro')}
          data-subtab="intro"
        >
          Intro
        </button>
        <button
          type="button"
          className={section === 'library' ? 'is-active' : ''}
          onClick={() => setSection('library')}
          data-subtab="library"
        >
          Bibliothèque
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
              glossaryLinkItems={glossaryLinkItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
            />
          ) : null}
        </>
      ) : section === 'chapters' ? (
        <GLChaptersAdminView />
      ) : section === 'species' ? (
        <GLContentCatalogPanel
          manualLabel="Saisie manuelle"
          importLabel="Import XLSX"
          ManualPanel={GLSpeciesEditorPanel}
          ImportPanel={GLSpeciesImportPanel}
        />
      ) : section === 'glossary' ? (
        <GLContentCatalogPanel
          manualLabel="Saisie manuelle"
          importLabel="Import XLSX"
          ManualPanel={GLGlossaryEditorPanel}
          ImportPanel={GLGlossaryImportPanel}
        />
      ) : section === 'spells' ? (
        <GLContentCatalogPanel
          manualLabel="Saisie manuelle"
          importLabel="Import XLSX"
          ManualPanel={GLSpellsEditorPanel}
          ImportPanel={GLSpellsImportPanel}
        />
      ) : section === 'lore-carnet' ? (
        <GLLoreFeuilletsImportPanel />
      ) : section === 'lore-glossary' ? (
        <GLLoreGlossaryImportPanel />
      ) : section === 'intro' ? (
        <GLIntroAdminPanel />
      ) : section === 'library' ? (
        <GLContentLibraryView onOpenSubTab={setSection} />
      ) : section === 'qcm-lore' ? (
        <GLQcmLoreImportPanel
          loreGlossaryLinkItems={loreGlossaryLinkItems}
          onOpenLoreTerm={onOpenLoreTerm}
        />
      ) : (
        <GLQcmImportPanel
          glossaryLinkItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
        />
      )}
    </section>
  );
}
