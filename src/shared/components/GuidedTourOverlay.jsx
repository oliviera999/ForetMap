import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  resolveDiscoveryBodyFrom,
  resolveDiscoveryExpressionFrom,
} from '../tour/tourRegistryCore.js';
import { SpeechBubble } from './SpeechBubble.jsx';
import { MascotSpeaker } from './MascotSpeaker.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

const SPOTLIGHT_PADDING = 8;
const CARD_MARGIN = 14;
const CARD_WIDTH = 320;
/** Le portrait latéral consomme de la largeur : la carte s'élargit pour ne pas comprimer le texte. */
const CARD_WIDTH_WITH_PORTRAIT = 384;
/** Sous ce seuil, le portrait devient un médaillon d'angle et la carte reste étroite (§9.3). */
const COMPACT_QUERY = '(max-width: 480px)';

/** Marge minimale entre la carte et les bords de l'écran. */
const VIEWPORT_GUTTER = 12;
/** Hauteur supposée tant que la carte n'a pas encore été mesurée (premier rendu). */
const CARD_HEIGHT_FALLBACK = 220;

/**
 * Calcule la position de la carte d'info autour de la cible mise en lumière.
 *
 * `cardHeight` est la hauteur **mesurée** de la carte : sans elle, une carte placée sous
 * une cible basse débordait de l'écran et ses boutons (Passer / Suivant) devenaient
 * inaccessibles. La carte est donc retournée au-dessus quand elle tient mieux, puis
 * recalée verticalement pour rester entière dans la fenêtre. Exportée pour les tests.
 */
export function computeCardPosition(
  rect,
  placement,
  cardWidth = CARD_WIDTH,
  cardHeight = 0,
  viewport = null,
) {
  const vw = viewport?.width ?? window.innerWidth;
  const vh = viewport?.height ?? window.innerHeight;
  const width = Math.min(cardWidth, Math.max(240, vw - VIEWPORT_GUTTER * 2));
  // La carte ne dépasse jamais la fenêtre (le CSS borne aussi sa hauteur et fait défiler
  // le texte) : on raisonne sur la hauteur effectivement affichable.
  const maxHeight = Math.max(0, vh - VIEWPORT_GUTTER * 2);
  const height = Math.min(cardHeight > 0 ? cardHeight : CARD_HEIGHT_FALLBACK, maxHeight);
  const clampTop = (top) => Math.max(VIEWPORT_GUTTER, Math.min(top, vh - VIEWPORT_GUTTER - height));
  const clampLeft = (left) =>
    Math.max(VIEWPORT_GUTTER, Math.min(left, vw - width - VIEWPORT_GUTTER));
  const centered = () => ({
    left: clampLeft((vw - width) / 2),
    top: clampTop((vh - height) / 2),
    centered: true,
    width,
    maxHeight,
  });

  if (!rect || placement === 'center') return centered();

  const space = {
    top: rect.top - CARD_MARGIN,
    bottom: vh - rect.bottom - CARD_MARGIN,
    left: rect.left - CARD_MARGIN,
    right: vw - rect.right - CARD_MARGIN,
  };
  const fitsBottom = space.bottom >= height + VIEWPORT_GUTTER;
  const fitsTop = space.top >= height + VIEWPORT_GUTTER;
  const fitsRight = space.right >= width + VIEWPORT_GUTTER;
  const fitsLeft = space.left >= width + VIEWPORT_GUTTER;

  let place = placement;
  if (!place || place === 'auto') {
    place = fitsBottom
      ? 'bottom'
      : fitsTop
        ? 'top'
        : fitsRight
          ? 'right'
          : fitsLeft
            ? 'left'
            : space.bottom >= space.top
              ? 'bottom'
              : 'top';
  } else if (place === 'bottom' && !fitsBottom && fitsTop) {
    place = 'top';
  } else if (place === 'top' && !fitsTop && fitsBottom) {
    place = 'bottom';
  } else if (place === 'right' && !fitsRight && fitsLeft) {
    place = 'left';
  } else if (place === 'left' && !fitsLeft && fitsRight) {
    place = 'right';
  }

  let left;
  let top;
  switch (place) {
    case 'top':
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - CARD_MARGIN - height;
      break;
    case 'left':
      left = rect.left - width - CARD_MARGIN;
      top = rect.top;
      break;
    case 'right':
      left = rect.right + CARD_MARGIN;
      top = rect.top;
      break;
    case 'bottom':
    default:
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.bottom + CARD_MARGIN;
      break;
  }

  // On garde la carte entière dans l'écran, quitte à recouvrir un peu la cible.
  return { left: clampLeft(left), top: clampTop(top), centered: false, width, maxHeight };
}

/**
 * Overlay de **visite guidée**, partagé ForetMap + G&L : assombrit la page, met en
 * lumière l'élément ciblé par l'étape courante et affiche une carte explicative avec
 * la navigation (Précédent / Suivant / Passer). Rendu via un portail sur `document.body`.
 *
 * Purement présentationnel : il reçoit le parcours déjà résolu (`active.steps`) et ne
 * connaît ni registre, ni produit, ni stockage. Une étape sans `target` s'affiche
 * centrée, ce dont se servent les séquences d'accueil.
 *
 * `isStaff` sélectionne la variante de texte du second public — prof côté ForetMap,
 * MJ côté GL.
 */
export function GuidedTourOverlay({
  active,
  isStaff = false,
  speakerName = '',
  narrator = null,
  onNext,
  onPrev,
  onStop,
}) {
  const [rect, setRect] = useState(null);
  const [cardHeight, setCardHeight] = useState(0);
  const rafRef = useRef(0);
  const bubbleRef = useRef(null);
  const cardRef = useRef(null);
  const compact = useMediaQuery(COMPACT_QUERY);

  const step = active?.steps?.[active.index] || null;
  const target = step?.target || null;
  const stepCount = active?.steps?.length || 0;
  const stepIndex = active?.index ?? 0;

  const measure = useCallback(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let el = null;
    try {
      el = document.querySelector(target);
    } catch (_) {
      el = null;
    }
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
      right: r.right,
    });
  }, [target]);

  // Mesure de la cible + recalage au scroll/resize, et défilement pour la rendre visible.
  useLayoutEffect(() => {
    if (!active) return undefined;
    let el = null;
    if (target) {
      try {
        el = document.querySelector(target);
      } catch (_) {
        el = null;
      }
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    schedule();

    let observer = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(el);
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      if (observer) observer.disconnect();
    };
  }, [active, target, stepIndex, measure]);

  // Hauteur réelle de la carte (titre, texte d'Olu, boutons) : elle conditionne le
  // placement, sans quoi la carte déborde sous l'écran. Recalée si le contenu change.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!active || !el) return undefined;
    const update = () => {
      const h = el.scrollHeight || el.getBoundingClientRect().height || 0;
      setCardHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
    };
    update();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }
    return () => {
      if (observer) observer.disconnect();
    };
  }, [active, stepIndex]);

  // Raccourcis clavier.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onStop?.();
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        // Première validation : on termine le texte en cours de frappe. Seconde : on avance.
        if (bubbleRef.current?.isTyping()) {
          bubbleRef.current.revealAll();
          return;
        }
        onNext?.();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrev?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onNext, onPrev, onStop]);

  if (!active || !step || typeof document === 'undefined') return null;

  const body = resolveDiscoveryBodyFrom(step, isStaff);
  // Le narrateur est un enrichissement : seul un `enabled: false` explicite l'éteint.
  // Sans réglage chargé, le portrait reste rendu — c'est le repli SVG, gratuit (§4.1).
  const showPortrait = !narrator || narrator.enabled !== false;
  const card = computeCardPosition(
    rect,
    step.placement,
    showPortrait && !compact ? CARD_WIDTH_WITH_PORTRAIT : CARD_WIDTH,
    cardHeight,
  );
  const isLast = stepIndex >= stepCount - 1;

  const spotlightStyle = rect
    ? {
        position: 'fixed',
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  const overlay = (
    <div className="discovery-tour" role="dialog" aria-modal="true" aria-label="Visite guidée">
      {rect ? (
        <div className="discovery-tour__spotlight" style={spotlightStyle} aria-hidden="true" />
      ) : (
        <div className="discovery-tour__backdrop" aria-hidden="true" />
      )}

      <div
        ref={cardRef}
        className={`discovery-tour__card ${card.centered ? 'is-centered' : ''}`}
        style={{
          position: 'fixed',
          left: card.left,
          top: card.top,
          width: card.width,
          maxHeight: card.maxHeight,
        }}
      >
        <div className="discovery-tour__progress">
          Étape {stepIndex + 1} / {stepCount}
        </div>
        <h3 className="discovery-tour__title">{step.title}</h3>
        <div className={`discovery-tour__scene ${compact ? 'is-compact' : ''}`}>
          {showPortrait ? (
            <MascotSpeaker
              className="discovery-tour__portrait"
              narrator={narrator}
              expression={resolveDiscoveryExpressionFrom(step)}
              size={compact ? 'face' : 'bust'}
            />
          ) : null}
          <SpeechBubble
            key={stepIndex}
            ref={bubbleRef}
            className="discovery-tour__bubble"
            speakerName={speakerName}
            text={body}
          />
        </div>
        <div className="discovery-tour__dots" aria-hidden="true">
          {active.steps.map((s, i) => (
            <span
              key={`${s.title}-${i}`}
              className={`discovery-tour__dot ${i === stepIndex ? 'is-active' : ''}`}
            />
          ))}
        </div>
        <div className="discovery-tour__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStop?.()}>
            {isLast ? 'Fermer' : 'Passer'}
          </button>
          <div className="discovery-tour__nav">
            {stepIndex > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPrev?.()}>
                Précédent
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNext?.()}>
              {isLast ? 'Terminer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
