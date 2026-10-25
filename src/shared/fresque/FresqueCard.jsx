import { useCallback, useRef } from 'react';

import { CARD_W_PCT, CARD_H_PCT } from './fresqueCore.js';

const LONG_PRESS_MS = 500;
/** Déplacement (en % de la table) en deçà duquel un geste compte comme un simple toucher. */
const TAP_TOLERANCE_PCT = 0.8;

/**
 * Carte posée sur la table : recto / verso (retournement 3D, fondu si mouvement réduit),
 * glisser au doigt ou à la souris (`beginDrag` du viewport), appui long ou double-toucher pour
 * agrandir, bouton « relier » et puce Éclaireur **à côté** de la carte (jamais par-dessus
 * l'image : licence CC BY-NC-ND).
 *
 * Clavier : la carte est un bouton (`Entrée` / `Espace` retourne) ; le bouton « Relier à… »
 * ouvre la liste des cartes posées (géré par le plateau) ; flèches : déplacement de 1 %.
 */
export function FresqueCard({
  card,
  pos,
  publicBase,
  readOnly = false,
  selected = false,
  isLinkSource = false,
  linkArmed = false,
  chip = null,
  showNumber = true,
  tableApi,
  onFlip,
  onMove,
  onOpen,
  onTap,
  onLinkButton,
  onLinkDragEnd,
  onFocus,
}) {
  const elRef = useRef(null);
  const gestureRef = useRef(null);
  const longPressRef = useRef(null);
  const suppressTapRef = useRef(false);

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const onPointerDown = useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = elRef.current;
      const api = tableApi?.current;
      if (!el || !api) return;
      const start = api.toImagePct(e.clientX, e.clientY);
      if (!start) return;
      suppressTapRef.current = false;
      gestureRef.current = {
        start,
        offsetX: start.xp - pos.x,
        offsetY: start.yp - pos.y,
        last: null,
      };
      clearLongPress();
      longPressRef.current = setTimeout(() => {
        longPressRef.current = null;
        suppressTapRef.current = true;
        onOpen?.(card.id);
      }, LONG_PRESS_MS);
      el.classList.add('fm-fresque-card--dragging');
      api.beginExternalDrag(el, e.pointerId, {
        onMove: (p) => {
          const g = gestureRef.current;
          if (!g) return;
          const moved = Math.hypot(p.xp - g.start.xp, p.yp - g.start.yp);
          if (moved > TAP_TOLERANCE_PCT) clearLongPress();
          if (readOnly) return;
          g.last = p;
          el.style.left = `${Math.min(100 - CARD_W_PCT, Math.max(0, p.xp - g.offsetX))}%`;
          el.style.top = `${Math.min(100 - CARD_H_PCT, Math.max(0, p.yp - g.offsetY))}%`;
        },
        onEnd: (p) => {
          clearLongPress();
          el.classList.remove('fm-fresque-card--dragging');
          const g = gestureRef.current;
          gestureRef.current = null;
          if (!g) return;
          const moved = p ? Math.hypot(p.xp - g.start.xp, p.yp - g.start.yp) : 0;
          if (p && moved > TAP_TOLERANCE_PCT) {
            if (readOnly) {
              el.style.left = `${pos.x}%`;
              el.style.top = `${pos.y}%`;
              return;
            }
            onMove?.(
              card.id,
              Math.min(100 - CARD_W_PCT, Math.max(0, p.xp - g.offsetX)),
              Math.min(100 - CARD_H_PCT, Math.max(0, p.yp - g.offsetY)),
            );
            return;
          }
          el.style.left = `${pos.x}%`;
          el.style.top = `${pos.y}%`;
          if (suppressTapRef.current) return;
          onTap?.(card.id);
        },
      });
    },
    [card.id, onMove, onOpen, onTap, pos.x, pos.y, readOnly, tableApi],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (linkArmed) onTap?.(card.id);
        else onFlip?.(card.id);
        return;
      }
      if (readOnly) return;
      const step = e.shiftKey ? 5 : 1;
      const moves = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        onMove?.(
          card.id,
          Math.min(100 - CARD_W_PCT, Math.max(0, pos.x + dx)),
          Math.min(100 - CARD_H_PCT, Math.max(0, pos.y + dy)),
        );
      }
    },
    [card.id, linkArmed, onFlip, onMove, onTap, pos.x, pos.y, readOnly],
  );

  const onLinkPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      if (readOnly) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const api = tableApi?.current;
      const btn = e.currentTarget;
      if (!api) return;
      let moved = false;
      api.beginExternalDrag(btn, e.pointerId, {
        onMove: (p, ev) => {
          moved = true;
          onLinkDragEnd?.(card.id, null, { preview: p, clientX: ev.clientX, clientY: ev.clientY });
        },
        onEnd: (p, ev) => {
          if (!moved) {
            onLinkButton?.(card.id);
            return;
          }
          const target = document
            .elementFromPoint(ev.clientX, ev.clientY)
            ?.closest?.('[data-card-id]');
          onLinkDragEnd?.(card.id, target?.getAttribute('data-card-id') || null, { done: true });
        },
      });
    },
    [card.id, onLinkButton, onLinkDragEnd, readOnly, tableApi],
  );

  const face = pos.flipped ? 'verso' : 'recto';
  const className = [
    'fm-fresque-card',
    pos.flipped ? 'fm-fresque-card--flipped' : '',
    selected ? 'fm-fresque-card--selected' : '',
    isLinkSource ? 'fm-fresque-card--link-source' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={elRef}
      className={className}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: `${CARD_W_PCT}%`,
        height: `${CARD_H_PCT}%`,
      }}
      data-card-id={card.id}
      data-testid={`fm-fresque-card-${card.id}`}
      role="button"
      tabIndex={0}
      aria-label={`${card.alt?.[face] || card.title} — ${linkArmed ? 'toucher pour relier' : 'toucher pour retourner'}`}
      aria-pressed={pos.flipped ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        suppressTapRef.current = true;
        onOpen?.(card.id);
      }}
      onKeyDown={onKeyDown}
      onFocus={() => onFocus?.(card.id)}
    >
      <div className="fm-fresque-card__inner">
        <div className="fm-fresque-card__face fm-fresque-card__face--recto">
          <img src={`${publicBase}${card.rectoSmall}`} alt="" draggable="false" loading="lazy" />
        </div>
        <div className="fm-fresque-card__face fm-fresque-card__face--verso">
          <img src={`${publicBase}${card.versoSmall}`} alt="" draggable="false" loading="lazy" />
        </div>
      </div>
      {showNumber ? (
        <span className="fm-fresque-card__number" aria-hidden="true">
          n° {card.number}
        </span>
      ) : null}
      <div className="fm-fresque-card__side">
        {!readOnly ? (
          <button
            type="button"
            className="fm-fresque-card__link"
            aria-label={
              isLinkSource
                ? `Annuler la flèche depuis « ${card.title} »`
                : `Relier « ${card.title} » à…`
            }
            aria-pressed={isLinkSource ? 'true' : 'false'}
            title={isLinkSource ? 'Annuler' : 'Relier à…'}
            onPointerDown={onLinkPointerDown}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onLinkButton?.(card.id, { keyboard: true });
              }
            }}
            data-testid={`fm-fresque-link-${card.id}`}
          >
            ➜
          </button>
        ) : null}
        {chip ? (
          <span
            className={`fm-fresque-card__chip${chip.remaining === 0 ? ' fm-fresque-card__chip--done' : ''}`}
            data-testid={`fm-fresque-chip-${card.id}`}
          >
            {chip.remaining === 0 ? '✓' : '➜'} {chip.foundOut}/{chip.expectedOut}
            <span className="fm-fresque-sr">
              {' '}
              {chip.expectedOut} flèche(s) partent d’ici, {chip.foundOut} trouvée(s)
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
