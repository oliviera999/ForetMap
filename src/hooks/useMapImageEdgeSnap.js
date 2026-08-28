import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EDGE_SNAP_DEFAULTS,
  computeEdgeMap,
  edgeMapTargetSize,
  snapPctToEdgeMap,
} from '../utils/edgeSnap.js';

/**
 * Aimant de contour : analyse l'image de fond de la carte et permet de « coller » un
 * sommet sur le contraste le plus marqué autour de lui (comme l'aimantation d'un
 * logiciel de retouche photo).
 *
 * L'analyse (Sobel) n'est lancée qu'à l'activation de l'aimant : elle est inutile pour
 * la grande majorité des visiteurs. Le résultat est mis en cache par URL d'image, donc
 * réactiver l'aimant est instantané.
 *
 * Limite connue : si le plan provient d'un domaine tiers sans en-têtes CORS, la lecture
 * des pixels est interdite par le navigateur (canvas « souillé ») → l'aimant se déclare
 * indisponible au lieu d'échouer silencieusement.
 *
 * @param {object} params
 * @param {string} params.src URL de l'image du plan (même source que l'affichage)
 * @param {boolean} params.active vrai quand l'utilisateur a allumé l'aimant
 */
const EDGE_MAP_CACHE = new Map();
const EDGE_MAP_CACHE_MAX = 3;

function readCache(src) {
  if (!EDGE_MAP_CACHE.has(src)) return null;
  const value = EDGE_MAP_CACHE.get(src);
  // Réinsertion : entrée la plus récemment utilisée en fin de Map (éviction LRU).
  EDGE_MAP_CACHE.delete(src);
  EDGE_MAP_CACHE.set(src, value);
  return value;
}

function writeCache(src, value) {
  EDGE_MAP_CACHE.set(src, value);
  while (EDGE_MAP_CACHE.size > EDGE_MAP_CACHE_MAX) {
    const oldest = EDGE_MAP_CACHE.keys().next().value;
    EDGE_MAP_CACHE.delete(oldest);
  }
}

/** Charge l'image ; tente d'abord en CORS anonyme (indispensable pour lire les pixels). */
function loadImageForAnalysis(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('image-unsupported'));
      return;
    }
    let triedWithoutCors = false;
    const img = new Image();
    img.decoding = 'async';
    const onError = () => {
      if (triedWithoutCors) {
        reject(new Error('image-load-failed'));
        return;
      }
      // Repli : image tierce sans en-têtes CORS → on la charge quand même, la lecture
      // des pixels échouera proprement plus bas (canvas souillé).
      triedWithoutCors = true;
      img.removeAttribute('crossorigin');
      img.src = `${src}${src.includes('?') ? '&' : '?'}fmnocors=1`;
    };
    img.onload = () => resolve(img);
    img.onerror = onError;
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function buildEdgeMap(src) {
  if (typeof document === 'undefined') throw new Error('no-dom');
  const img = await loadImageForAnalysis(src);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) throw new Error('image-empty');
  const target = edgeMapTargetSize(naturalW, naturalH);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;
  if (!ctx) throw new Error('canvas-unsupported');
  ctx.drawImage(img, 0, 0, target.width, target.height);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, target.width, target.height);
  } catch (_e) {
    // SecurityError : image d'un autre domaine sans CORS.
    throw new Error('tainted-canvas');
  }
  return computeEdgeMap(imageData);
}

export const EDGE_SNAP_UNAVAILABLE_MESSAGE =
  'Aimant indisponible : les couleurs de ce plan ne sont pas lisibles par le navigateur (image hébergée sur un autre domaine, ou canvas non supporté).';

function useMapImageEdgeSnap({ src, active }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | unavailable
  const [altBypass, setAltBypass] = useState(false);
  const edgeMapRef = useRef(null);

  useEffect(() => {
    edgeMapRef.current = null;
    setStatus('idle');
  }, [src]);

  useEffect(() => {
    if (!active || !src) return undefined;
    const cached = readCache(src);
    if (cached) {
      edgeMapRef.current = cached;
      setStatus(cached === 'unavailable' ? 'unavailable' : 'ready');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    // setTimeout : laisse le bouton passer à « analyse… » avant le calcul (synchrone).
    const timer = window.setTimeout(() => {
      buildEdgeMap(src)
        .then((edgeMap) => {
          if (cancelled) return;
          writeCache(src, edgeMap);
          edgeMapRef.current = edgeMap;
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled) return;
          writeCache(src, 'unavailable');
          edgeMapRef.current = null;
          setStatus('unavailable');
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, src]);

  // Alt maintenu : désactive temporairement l'aimant (convention des logiciels de dessin).
  useEffect(() => {
    if (!active) {
      setAltBypass(false);
      return undefined;
    }
    const onKeyDown = (e) => {
      if (e.altKey) setAltBypass(true);
    };
    const onKeyUp = (e) => {
      if (!e.altKey) setAltBypass(false);
    };
    const onBlur = () => setAltBypass(false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      setAltBypass(false);
    };
  }, [active]);

  /**
   * Colle un point `{xp, yp}` sur le contour le plus proche.
   * @returns {{xp:number, yp:number, strength:number}|null} `null` si rien à accrocher
   */
  const snapPoint = useCallback(
    (point, options = {}) => {
      if (!active || altBypass) return null;
      const edgeMap = edgeMapRef.current;
      if (!edgeMap || edgeMap === 'unavailable') return null;
      return snapPctToEdgeMap(edgeMap, point, {
        radiusPct: options.radiusPct,
        minStrength: options.minStrength ?? EDGE_SNAP_DEFAULTS.minStrength,
        distanceWeight: options.distanceWeight ?? EDGE_SNAP_DEFAULTS.distanceWeight,
        preferOrthogonal: options.preferOrthogonal ?? true,
        orthogonalWeight: options.orthogonalWeight ?? EDGE_SNAP_DEFAULTS.orthogonalWeight,
      });
    },
    [active, altBypass],
  );

  return useMemo(
    () => ({
      status,
      ready: status === 'ready',
      loading: status === 'loading',
      unavailable: status === 'unavailable',
      altBypass,
      snapPoint,
    }),
    [status, altBypass, snapPoint],
  );
}

export default useMapImageEdgeSnap;
