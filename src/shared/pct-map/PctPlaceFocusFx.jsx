import { useMemo, useRef } from 'react';

import {
  placeFocusBurstScales,
  placeFocusFxAnchor,
  placeFocusSparkles,
  placeFocusSpotlightPath,
} from './placeFocusFxGeometry.js';
import './placeFocusFx.css';

const SPARKLES = placeFocusSparkles(10);

/**
 * Effets du « zoom sur le lieu » (état : `usePlaceFocusFx`), posés dans le calque « fit » de
 * la carte, celui que la caméra met à l'échelle :
 *
 * - **emoji** : une copie de l'emoji du lieu s'envole (zoom) ou atterrit (dézoom) ;
 * - **projecteur** : le reste du plan s'assombrit, le lieu reste éclairé ;
 * - **étincelles** (plateaux GL) : une couronne d'étincelles jaillit du lieu.
 *
 * Purement décoratif : aucune cible de clic, masqué aux lecteurs d'écran. Le mouvement réduit
 * n'arrive jamais jusqu'ici (aucun vol animé, donc aucun événement).
 *
 * @param {object} props
 * @param {object|null} props.fx
 * @param {number} props.fitWidth largeur du calque « fit » (px, échelle 1)
 * @param {number} props.fitHeight
 * @param {(place: object) => string} [props.emojiOf] emoji affiché pour le lieu (`''` : aucun)
 * @param {(place: object) => ({ xp: number, yp: number }|null)} [props.anchorOf] point où
 *   l'emoji du lieu est réellement dessiné (sinon : le centre de la zone, ou le repère)
 */
export function PctPlaceFocusFx({ fx, fitWidth, fitHeight, emojiOf, anchorOf }) {
  const place = fx?.place || null;
  // Ancre figée au départ de l'effet : le placement des étiquettes bouge au fil du zoom.
  const anchorOfRef = useRef(anchorOf);
  anchorOfRef.current = anchorOf;
  const fxKey = fx?.key;
  const anchor = useMemo(
    () =>
      place && fxKey != null
        ? (anchorOfRef.current?.(place) ?? null) || placeFocusFxAnchor(place)
        : null,
    [place, fxKey],
  );
  const spotPath = useMemo(
    () =>
      place && fx?.effects?.spotlight
        ? placeFocusSpotlightPath(place, { fitWidth, fitHeight, holeScale: fx.holeScale })
        : '',
    [place, fx?.effects?.spotlight, fx?.holeScale, fitWidth, fitHeight],
  );
  if (!fx || !place) return null;

  const { phase, durationMs, key } = fx;
  const emoji = fx.effects?.emoji && typeof emojiOf === 'function' ? emojiOf(place) : '';
  const moving = phase === 'in' || phase === 'out';
  const inv = 1 / (Number(fx.fromScale) > 0 ? Number(fx.fromScale) : 1);
  const burst = moving ? placeFocusBurstScales(fx) : null;

  return (
    <div
      className="fm-place-fx"
      aria-hidden="true"
      data-testid="place-focus-fx"
      data-phase={phase}
      style={{ '--fx-ms': `${durationMs}ms` }}
    >
      {spotPath ? (
        <svg
          className={`fm-place-fx__spot fm-place-fx__spot--${phase}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path d={spotPath} fillRule="evenodd" />
        </svg>
      ) : null}
      {anchor && emoji && burst ? (
        <span
          key={`emoji-${key}`}
          className={`fm-place-fx__emoji fm-place-fx__emoji--${phase}`}
          style={{
            left: `${anchor.xp}%`,
            top: `${anchor.yp}%`,
            '--fx-k0': burst.k0,
            '--fx-k1': burst.k1,
          }}
        >
          {emoji}
        </span>
      ) : null}
      {anchor && fx.effects?.sparkles && phase === 'in' ? (
        <span
          key={`sparkles-${key}`}
          className="fm-place-fx__sparkles"
          style={{ left: `${anchor.xp}%`, top: `${anchor.yp}%`, '--fx-inv': inv }}
        >
          {SPARKLES.map((s) => (
            <span
              key={s.angleDeg}
              className="fm-place-fx__sparkle"
              style={{
                '--fx-angle': `${s.angleDeg}deg`,
                '--fx-dist': `${s.distancePx}px`,
                animationDelay: `${s.delayMs}ms`,
              }}
            >
              {s.glyph}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}
