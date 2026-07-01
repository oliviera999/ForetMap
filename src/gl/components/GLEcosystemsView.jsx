import React, { useEffect, useMemo, useState } from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLLearnAndImport } from './GLLearnAndImport.jsx';
import { useGlMarkdownWithLegacyMedia } from '../hooks/useGlMarkdownWithLegacyMedia.js';
import { buildEcosystemSections } from '../utils/glEcosystemSections.js';
import { prepareEcosystemSectionMarkdown } from '../utils/glEcosystemMarkdown.js';
import { biomeAssetSlug } from '../data/biomes.registry.js';
import { biomeImg } from '../assets/index.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';

function GLEcosystemIllustration({ biomeSlug, kind, className }) {
  const assetsReady = useGlAssetsReady();
  if (!assetsReady || !biomeSlug || !biomeAssetSlug(biomeSlug, kind)) return null;
  const src = biomeImg(biomeSlug, kind);
  if (!src) return null;
  return (
    <figure className={className || 'gl-ecosystem-section__figure'}>
      <img src={src} alt="" loading="lazy" />
    </figure>
  );
}

function GLEcosystemSection({
  section,
  showHeading,
  glossaryLinkItems,
  onOpenGlossaryTerm,
  journalImportEnabled,
}) {
  const slug = section.slug;
  const showBiomeHero = !!slug && !!biomeAssetSlug(slug, 'biome');
  const showBiocenoseArt = !!slug && !!biomeAssetSlug(slug, 'biocenose');

  const preparedMarkdown = useMemo(
    () =>
      prepareEcosystemSectionMarkdown(section.biotopeMarkdown, section.biocenoseMarkdown, slug, {
        showBiomeHero,
        showBiocenoseArt,
      }),
    [section.biotopeMarkdown, section.biocenoseMarkdown, slug, showBiomeHero, showBiocenoseArt],
  );
  const resolved = useGlMarkdownWithLegacyMedia(preparedMarkdown);

  if (!resolved && !showBiomeHero && !showBiocenoseArt) return null;

  return (
    <section
      className="gl-ecosystem-section"
      aria-labelledby={showHeading ? `gl-eco-${slug || 'default'}` : undefined}
    >
      {showHeading ? (
        <h3 id={`gl-eco-${slug || 'default'}`} className="gl-ecosystem-section__title">
          {section.nom}
        </h3>
      ) : null}

      {showBiomeHero ? (
        <GLEcosystemIllustration
          biomeSlug={slug}
          kind="biome"
          className="gl-ecosystem-section__figure gl-ecosystem-section__figure--hero"
        />
      ) : null}

      {showBiocenoseArt ? (
        <GLEcosystemIllustration
          biomeSlug={slug}
          kind="biocenose"
          className="gl-ecosystem-section__figure gl-ecosystem-section__figure--biocenose"
        />
      ) : null}

      {resolved ? (
        <GLGlossaryMarkdown
          markdown={resolved}
          glossaryItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          allowImages
        />
      ) : null}

      {slug ? (
        <GLLearnAndImport
          resourceType="ecosystem"
          resourceRef={slug}
          title={`Écosystème : ${section.nom || slug}`}
          journalEnabled={journalImportEnabled}
          acknowledgeLabel="Marquer cet écosystème comme étudié"
          learnedLabel="✓ Écosystème étudié"
        />
      ) : null}
    </section>
  );
}

export function GLEcosystemsView({
  gameState,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
  journalImportEnabled = false,
}) {
  const rawBiotope = String(gameState?.game?.biotope_markdown || '').trim();
  const biocenoseMarkdown = gameState?.game?.biocenose_markdown || '';
  const biotopeMarkdown =
    rawBiotope || (String(biocenoseMarkdown || '').trim() ? '' : 'Biotope non renseigné.');
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];

  const sections = useMemo(
    () => buildEcosystemSections(biomes, biotopeMarkdown, biocenoseMarkdown),
    [biomes, biotopeMarkdown, biocenoseMarkdown],
  );

  const tabbedSections = sections.filter((s) => s.slug);
  const useTabs = tabbedSections.length > 1;
  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    if (!useTabs) {
      setActiveSlug(null);
      return;
    }
    setActiveSlug((prev) => {
      if (prev && tabbedSections.some((s) => s.slug === prev)) return prev;
      return tabbedSections[0]?.slug ?? null;
    });
  }, [useTabs, tabbedSections]);

  const visibleSections = useMemo(() => {
    if (!useTabs) return sections;
    return sections.filter((s) => s.slug === activeSlug);
  }, [sections, useTabs, activeSlug]);

  const showSectionHeadings =
    !useTabs && (sections.length > 1 || (sections.length === 1 && sections[0].slug));

  return (
    <article className="gl-panel gl-markdown gl-ecosystems-view fade-in">
      <h2>Écosystèmes</h2>

      {useTabs ? (
        <>
          <p className="gl-ecosystems-view__intro">
            Ce chapitre explore plusieurs écosystèmes. Choisissez un écosystème pour afficher son
            contenu.
          </p>
          <div
            className="gl-ecosystems-view__tabs gl-species-catalog__tabs"
            role="tablist"
            aria-label="Écosystèmes du chapitre"
          >
            {tabbedSections.map((section) => (
              <button
                key={section.slug}
                type="button"
                role="tab"
                aria-selected={activeSlug === section.slug}
                className={activeSlug === section.slug ? 'is-active' : ''}
                onClick={() => setActiveSlug(section.slug)}
              >
                {section.nom}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {visibleSections.map((section) => (
        <GLEcosystemSection
          key={section.slug || 'default'}
          section={section}
          showHeading={showSectionHeadings}
          glossaryLinkItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          journalImportEnabled={journalImportEnabled}
        />
      ))}
    </article>
  );
}
