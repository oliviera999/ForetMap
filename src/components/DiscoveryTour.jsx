import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { resolveDiscoveryBody } from '../constants/discoveryTour.js';

const SPOTLIGHT_PADDING = 8;
const CARD_MARGIN = 14;
const CARD_WIDTH = 320;

/** Calcule la position de la carte d'info autour de la cible mise en lumière. */
function computeCardPosition(rect, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return {
      left: Math.max(12, (vw - CARD_WIDTH) / 2),
      top: Math.max(12, vh / 2 - 90),
      centered: true,
    };
  }

  const space = {
    top: rect.top,
    bottom: vh - rect.bottom,
    left: rect.left,
    right: vw - rect.right,
  };
  let place = placement;
  if (!place || place === 'auto') {
    place =
      space.bottom >= 220
        ? 'bottom'
        : space.top >= 220
          ? 'top'
          : space.right >= 340
            ? 'right'
            : 'left';
  }

  let left;
  let top;
  switch (place) {
    case 'top':
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      top = rect.top - CARD_MARGIN;
      break;
    case 'left':
      left = rect.left - CARD_WIDTH - CARD_MARGIN;
      top = rect.top;
      break;
    case 'right':
      left = rect.right + CARD_MARGIN;
      top = rect.top;
      break;
    case 'center':
      return { left: (vw - CARD_WIDTH) / 2, top: vh / 2 - 90, centered: true };
    case 'bottom':
    default:
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      top = rect.bottom + CARD_MARGIN;
      break;
  }

  // On garde la carte dans l'écran.
  left = Math.max(12, Math.min(left, vw - CARD_WIDTH - 12));
  top = Math.max(12, Math.min(top, vh - 12));
  const translateY = place === 'top' ? '-100%' : '0';
  return { left, top, translateY, centered: false };
}

/**
 * Overlay du mode visite/découverte : assombrit la page, met en lumière l'élément
 * ciblé par l'étape courante et affiche une carte explicative avec la navigation
 * (Précédent / Suivant / Passer). Rendu via un portail sur `document.body`.
 */
export function DiscoveryTour({ active, isTeacher = false, onNext, onPrev, onStop }) {
  const [rect, setRect] = useState(null);
  const rafRef = useRef(0);

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

  // Raccourcis clavier.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onStop?.();
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
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

  const body = resolveDiscoveryBody(step, isTeacher);
  const card = computeCardPosition(rect, step.placement);
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
        className={`discovery-tour__card ${card.centered ? 'is-centered' : ''}`}
        style={{
          position: 'fixed',
          left: card.left,
          top: card.top,
          width: CARD_WIDTH,
          transform: card.translateY ? `translateY(${card.translateY})` : undefined,
        }}
      >
        <div className="discovery-tour__progress">
          Étape {stepIndex + 1} / {stepCount}
        </div>
        <h3 className="discovery-tour__title">{step.title}</h3>
        <p className="discovery-tour__body">{body}</p>
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
