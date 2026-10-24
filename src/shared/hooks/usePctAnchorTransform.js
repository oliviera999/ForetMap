import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Ancrage en % d'un élément `position: absolute` de 0 × 0 (mascotte, point de position),
 * déplacé par `transform` plutôt que par `left` / `top` : la transition passe alors par le
 * compositeur au lieu de recalculer la mise en page à chaque image (audit
 * `docs/AUDIT_ANIMATIONS_CARTE_2026-10.md`, ANIM-11).
 *
 * `translate()` en % se rapporte à l'élément lui-même (ici 0 × 0), pas à son parent : le
 * hook mesure donc le bloc conteneur (`offsetParent`, à défaut le parent) avec un
 * `ResizeObserver` et convertit les % en pixels. La mesure est en pixels **de mise en page**
 * — insensible au zoom du calque, qui s'applique ensuite au calque entier.
 *
 * Tant que la mesure manque (premier rendu, jsdom sans `ResizeObserver`), le style retombe
 * sur `left` / `top` en %. Au premier rendu mesuré, et après un redimensionnement du
 * conteneur, `settling` vaut vrai le temps d'un rendu : l'appelant coupe la transition pour
 * que l'élément ne glisse pas depuis le coin du calque.
 *
 * @param {number} xp abscisse en % du conteneur
 * @param {number} yp ordonnée en % du conteneur
 * @param {string} [suffix] transformations ajoutées après la translation (ex. centrage).
 * @returns {{ ref: (node: HTMLElement|null) => void, style: object, settling: boolean,
 *   measured: boolean }}
 */
export function usePctAnchorTransform(xp, yp, suffix = '') {
  const [node, setNode] = useState(null);
  const [size, setSize] = useState(null);
  const ref = useCallback((el) => setNode(el), []);

  useIsoLayoutEffect(() => {
    if (!node || typeof ResizeObserver !== 'function') return undefined;
    const container = node.offsetParent || node.parentElement;
    if (!container) return undefined;
    const read = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      setSize((prev) => {
        if (!(w > 0) || !(h > 0)) return null;
        if (prev && prev.w === w && prev.h === h) return prev;
        return { w, h, fresh: true };
      });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(container);
    return () => observer.disconnect();
  }, [node]);

  useEffect(() => {
    if (size?.fresh) setSize((prev) => (prev === size ? { ...prev, fresh: false } : prev));
  }, [size]);

  const x = Number(xp) || 0;
  const y = Number(yp) || 0;
  if (!size) {
    return {
      ref,
      style: { left: `${x}%`, top: `${y}%`, ...(suffix ? { transform: suffix } : {}) },
      settling: true,
      measured: false,
    };
  }
  const px = (x / 100) * size.w;
  const py = (y / 100) * size.h;
  return {
    ref,
    style: {
      left: 0,
      top: 0,
      transform: `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)${suffix ? ` ${suffix}` : ''}`,
    },
    settling: Boolean(size.fresh),
    measured: true,
  };
}
