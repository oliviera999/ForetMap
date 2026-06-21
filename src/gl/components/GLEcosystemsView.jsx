import React, { useMemo } from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLChapterIllustration } from './GLChapterIllustration.jsx';
import { useGlMarkdownWithLegacyMedia } from '../hooks/useGlMarkdownWithLegacyMedia.js';
import { buildEcosystemSections } from '../utils/glEcosystemSections.js';
import { biomeImg } from '../assets/index.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';

function GLEcosystemIllustration({ biomeSlug, kind, className }) {
  const assetsReady = useGlAssetsReady();
  if (!assetsReady || !biomeSlug) return null;
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
  glossaryLinkItems,
  onOpenGlossaryTerm,
}) {
  const resolved = useGlMarkdownWithLegacyMedia(String(markdown || '').trim());
  if (!resolved) return null;
  return (
    <section className="gl-ecosystem-section__block">
      <h4>{title}</h4>
      <GLGlossaryMarkdown
        className={className}
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
  chapterNumber,
  showChapterIllustration,
  glossaryLinkItems,
  onOpenGlossaryTerm,
}) {
  const hasBiotope = String(section.biotopeMarkdown || '').trim().length > 0;
  const hasBiocenose = String(section.biocenoseMarkdown || '').trim().length > 0;
  const hasBiomeArt = !!section.slug;

  if (!hasBiotope && !hasBiocenose && !hasBiomeArt) return null;

  return (
    <section className="gl-ecosystem-section">
      {showHeading ? <h3>{section.nom}</h3> : null}
      {hasBiomeArt ? (
        <GLEcosystemIllustration
          biomeSlug={section.slug}
          kind="biome"
          className="gl-ecosystem-section__figure gl-ecosystem-section__figure--biome"
        />
      ) : null}
      <GLEcosystemMarkdownBlock
        title="Biotope"
        markdown={section.biotopeMarkdown}
        className="gl-ecosystem-section__biotope"
        glossaryLinkItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />
      {hasBiomeArt ? (
        <GLEcosystemIllustration
          biomeSlug={section.slug}
          kind="biocenose"
          className="gl-ecosystem-section__figure gl-ecosystem-section__figure--biocenose"
        />
      ) : null}
      {showChapterIllustration ? (
        <GLChapterIllustration
          chapterNumber={chapterNumber}
          alt="Illustration du chapitre"
          figureClassName="gl-chapter-illustration gl-chapter-illustration--cover gl-ecosystem-section__figure"
        />
      ) : null}
      <GLEcosystemMarkdownBlock
        title="Biocénose"
        markdown={section.biocenoseMarkdown}
        className="gl-biocenose-intro gl-ecosystem-section__biocenose"
        glossaryLinkItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />
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

  const showSectionHeadings = sections.length > 1 || (sections.length === 1 && sections[0].slug);

  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Écosystèmes</h2>
      {sections.map((section, index) => (
        <GLEcosystemSection
          key={section.slug || 'default'}
          section={section}
          showHeading={showSectionHeadings}
          chapterNumber={chapterNumber}
          showChapterIllustration={index === 0}
          glossaryLinkItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
        />
      ))}
    </article>
  );
}
