import React from 'react';
import { glImageFrameToStyle, normalizeGlImageFrame } from '../../utils/glImageFrame.js';

const CARD_SLOT_IDS = ['card_world', 'card_rules', 'card_spells'];

/**
 * Hub visuel (hero + cartes) calqué sur yo.olution.info.
 * @param {{ slots?: Record<string, { imageUrl?: string, title?: string, subtitle?: string, tab?: string }>, onOpenTab?: (tab: string) => void, compact?: boolean }} props
 */
export function GLBrandHub({ slots, onOpenTab, compact = false }) {
  const hero = slots?.hero;
  const heroImage = String(hero?.imageUrl || '').trim();
  const heroFrame = normalizeGlImageFrame(hero?.frame, 'brand-hero');
  const cards = CARD_SLOT_IDS
    .map((id) => ({ id, ...slots?.[id] }))
    .filter((card) => String(card?.imageUrl || '').trim() || String(card?.title || '').trim());

  if (!heroImage && cards.length === 0) return null;

  const rootClass = compact ? 'gl-brand-hub gl-brand-hub--compact' : 'gl-brand-hub';

  return (
    <section className={rootClass} aria-label="Découvrir Gnomes et Licornes">
      {heroImage ? (
        <div
          className="gl-brand-hub__hero"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundPosition: `${heroFrame.focalX}% ${heroFrame.focalY}%`,
          }}
          role="img"
          aria-label={hero?.title || 'Illustration Gnomes et Licornes'}
        >
          <div className="gl-brand-hub__hero-overlay">
            {hero?.title ? <h2 className="gl-brand-hub__hero-title">{hero.title}</h2> : null}
            {hero?.subtitle ? <p className="gl-brand-hub__hero-subtitle">{hero.subtitle}</p> : null}
          </div>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <div className="gl-brand-hub__cards">
          {cards.map((card) => {
            const imageUrl = String(card.imageUrl || '').trim();
            const title = String(card.title || '').trim();
            const tab = String(card.tab || '').trim();
            const cardFrame = normalizeGlImageFrame(card?.frame, 'brand-card');
            const canNavigate = typeof onOpenTab === 'function' && tab;
            const Tag = canNavigate ? 'button' : 'div';
            return (
              <Tag
                key={card.id}
                type={canNavigate ? 'button' : undefined}
                className="gl-brand-hub__card"
                onClick={canNavigate ? () => onOpenTab(tab) : undefined}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="gl-brand-hub__card-image"
                    loading="lazy"
                    style={glImageFrameToStyle(cardFrame)}
                  />
                ) : (
                  <div className="gl-brand-hub__card-image gl-brand-hub__card-image--placeholder" aria-hidden />
                )}
                {title ? <span className="gl-brand-hub__card-title">{title}</span> : null}
              </Tag>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/** Bannière d’une page éditoriale (carte associée au slug GL). */
export function GLBrandPageBanner({ slot }) {
  const imageUrl = String(slot?.imageUrl || '').trim();
  const title = String(slot?.title || '').trim();
  const frame = normalizeGlImageFrame(slot?.frame, 'brand-banner');
  if (!imageUrl) return null;
  return (
    <figure className="gl-brand-page-banner">
      <img src={imageUrl} alt={title || ''} loading="lazy" style={glImageFrameToStyle(frame)} />
      {title ? <figcaption>{title}</figcaption> : null}
    </figure>
  );
}
