import React, { useEffect, useMemo, useState } from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLChapterIllustration } from './GLChapterIllustration.jsx';
import { useGlMarkdownWithLegacyMedia } from '../hooks/useGlMarkdownWithLegacyMedia.js';
import { buildEcosystemSections } from '../utils/glEcosystemSections.js';
import { prepareEcosystemMarkdown } from '../utils/glEcosystemMarkdown.js';
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

function GLEcosystemMarkdownBlock({
  title,
  markdown,
  className,
  biomeSlug,
  stripKinds = [],
  glossaryLinkItems,
  onOpenGlossaryTerm,
}) {
  const stripKey = stripKinds.join(',');
  const prepared = useMemo(
    () => prepareEcosystemMarkdown(markdown, biomeSlug, stripKey ? stripKey.split(',') : []),
    [markdown, biomeSlug, stripKey],
  );
  const resolved = useGlMarkdownWithLegacyMedia(prepared);
  if (!resolved) return null;
  return (
    <section className={`gl-ecosystem-section__block ${className || ''}`.trim()}>
      <h4>{title}</h4>
      <GLGlossaryMarkdown
        markdown={resolved}
        glossaryItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        allowImages
      />
    </section>
  );
}

function GLEcosystemSection({
  section,
  showHeading,
  glossaryLinkItems,
  onOpenGlossaryTerm,
}) {
  const hasBiotope = String(section.biotopeMarkdown || '').trim().length > 0;
  const hasBiocenose = String(section.biocenoseMarkdown || '').trim().length > 0;
  const slug = section.slug;
  const showBiomeHero = !!slug && !!biomeAssetSlug(slug, 'biome');
  const showBiocenoseArt = !!slug && !!biomeAssetSlug(slug, 'biocenose');

  if (!hasBiotope && !hasBiocenose && !showBiomeHero && !showBiocenoseArt) return null;

  const biotopeStripKinds = showBiomeHero ? ['biome', 'realiste'] : [];
  const biocenoseStripKinds = showBiocenoseArt ? ['biocenose'] : [];
  const splitLayout = hasBiotope && (hasBiocenose || showBiocenoseArt);

  return (
    <section className="gl-ecosystem-section" aria-labelledby={showHeading ? `gl-eco-${slug || 'default'}` : undefined}>
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

      <div
        className={
          splitLayout
            ? 'gl-ecosystem-section__layout gl-ecosystem-section__layout--split'
            : 'gl-ecosystem-section__layout'
        }
      >
        {hasBiotope ? (
          <GLEcosystemMarkdownBlock
            title="Biotope"
            markdown={section.biotopeMarkdown}
            className="gl-ecosystem-section__block--biotope"
            biomeSlug={slug}
            stripKinds={biotopeStripKinds}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
          />
        ) : null}

        {hasBiocenose || showBiocenoseArt ? (
          <div className="gl-ecosystem-section__biocenose-col">
            {showBiocenoseArt ? (
              <GLEcosystemIllustration
                biomeSlug={slug}
                kind="biocenose"
                className="gl-ecosystem-section__figure gl-ecosystem-section__figure--biocenose"
              />
            ) : null}
            {hasBiocenose ? (
              <GLEcosystemMarkdownBlock
                title="Biocénose"
                markdown={section.biocenoseMarkdown}
                className="gl-ecosystem-section__block--biocenose gl-biocenose-intro"
                biomeSlug={slug}
                stripKinds={biocenoseStripKinds}
                glossaryLinkItems={glossaryLinkItems}
                onOpenGlossaryTerm={onOpenGlossaryTerm}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function GLEcosystemsView({ gameState, glossaryLinkItems = [], onOpenGlossaryTerm }) {
  const rawBiotope = String(gameState?.game?.biotope_markdown || '').trim();
  const biocenoseMarkdown = gameState?.game?.biocenose_markdown || '';
  const biotopeMarkdown =
    rawBiotope || (String(biocenoseMarkdown || '').trim() ? '' : 'Biotope non renseigné.');
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];
  const chapterNumber = gameState?.game?.chapter_plateau_number ?? null;

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

  const showSectionHeadings = !useTabs && (sections.length > 1 || (sections.length === 1 && sections[0].slug));

  return (
    <article className="gl-panel gl-markdown gl-ecosystems-view fade-in">
      <h2>Écosystèmes</h2>
      <GLChapterIllustration
        chapterNumber={chapterNumber}
        alt="Illustration du chapitre"
        figureClassName="gl-chapter-illustration gl-chapter-illustration--cover gl-ecosystems-view__chapter-cover"
      />

      {useTabs ? (
        <>
          <p className="gl-ecosystems-view__intro">
            Ce chapitre explore plusieurs écosystèmes. Choisissez un biome pour afficher son biotope
            et sa biocénose.
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
        />
      ))}
    </article>
  );
}
