import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDialogA11y } from '../platform/useDialogA11y.js';
import { useOverlayHistoryBack } from '../platform/useOverlayHistoryBack.js';
import { useBodyScrollLock } from '../platform/bodyScrollLock.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { IconClose } from '../icons.jsx';
import {
  BOTTOM_SHEET_DRAG_THRESHOLD,
  BOTTOM_SHEET_SNAPS,
  computeSnapHeights,
  normalizeSnapPoints,
  releaseVelocity,
  resolveInitialSnap,
  resolveSnapRelease,
} from './bottomSheetSnap.js';

/** À partir de cette largeur, `wideAsDialog` rend la feuille comme un panneau centré. */
export const BOTTOM_SHEET_WIDE_QUERY = '(min-width: 1024px)';

/** Éléments qui ne démarrent jamais un glisser depuis l'en-tête (le clic doit leur parvenir). */
const NO_DRAG_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

function joinClassNames(...values) {
  return values
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** Zone sûre haute en px (variable `--safe-top` posée par `motion.css`), 0 si illisible. */
function readSafeTopPx() {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return 0;
  try {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--safe-top');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Pose `inert` sur les frères de la surcouche (enfants directs de `body` autres que le
 * portail) le temps de l'ouverture, et le retire à la fermeture — seulement sur ceux que
 * nous avons marqués, pour ne pas libérer un `inert` posé par une autre surcouche.
 */
function useInertSiblings(overlayRef) {
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    const overlay = overlayRef.current;
    const marked = [];
    for (const el of Array.from(document.body.children)) {
      if (el === overlay) continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
      if (el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      marked.push(el);
    }
    return () => {
      for (const el of marked) el.removeAttribute('inert');
    };
  }, [overlayRef]);
}

/**
 * Surface effectivement montée quand la feuille est ouverte. Séparée du composant public pour
 * que les effets « au montage » (piège de focus, entrée d'historique, verrou, `inert`) se
 * rejouent à chaque ouverture.
 */
function BottomSheetSurface({
  onClose,
  title,
  ariaLabel,
  children,
  footer,
  snapPointsKey,
  initialSnap,
  onSnapChange,
  closeOnOverlay,
  className,
  overlayClassName,
  testId,
  showHandle,
  dismissOnDragDown,
  closeLabel,
  dialogMode,
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSnapChangeRef = useRef(onSnapChange);
  onSnapChangeRef.current = onSnapChange;
  const dialogRef = useDialogA11y(() => onCloseRef.current?.());
  const overlayRef = useRef(null);
  const dragRef = useRef(null);

  const points = useMemo(() => normalizeSnapPoints(snapPointsKey.split(',')), [snapPointsKey]);
  const [snap, setSnap] = useState(() => resolveInitialSnap(points, initialSnap));
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const reducedMotion = usePrefersReducedMotion();

  useOverlayHistoryBack(true, () => onCloseRef.current?.());
  useBodyScrollLock(true);
  useInertSiblings(overlayRef);

  // Notifie les changements de cran (jamais le cran initial).
  const firstSnapNotify = useRef(true);
  useEffect(() => {
    if (firstSnapNotify.current) {
      firstSnapNotify.current = false;
      return;
    }
    onSnapChangeRef.current?.(snap);
  }, [snap]);

  // Si la liste de crans change et que le cran courant disparaît, on se rabat sur le premier.
  useEffect(() => {
    if (!points.includes(snapRef.current)) setSnap(points[0]);
  }, [points]);

  const startDrag = useCallback(
    (e) => {
      if (dialogMode) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target?.closest?.(NO_DRAG_SELECTOR)) return;
      const sheet = dialogRef.current;
      if (!sheet || typeof window === 'undefined') return;
      const heights = computeSnapHeights({
        viewportHeight: window.innerHeight,
        safeTop: readSafeTopPx(),
        snapPoints: points,
      });
      const measured = sheet.getBoundingClientRect?.().height || 0;
      const startHeight = measured > 0 ? measured : heights[snapRef.current] || 0;
      dragRef.current = {
        pointerId: e.pointerId,
        captureEl: e.currentTarget,
        startY: e.clientY,
        startHeight,
        currentHeight: startHeight,
        fromSnap: snapRef.current,
        moved: false,
        heights,
        maxHeight: Math.max(...Object.values(heights)),
        samples: [{ t: now(), y: e.clientY }],
      };
    },
    [dialogMode, dialogRef, points],
  );

  // Glisser : la hauteur est écrite en style impératif à chaque mouvement (aucun re-render par
  // frame) ; React ne reprend la main qu'au relâchement (« ref vive + commit »).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onMove = (e) => {
      const d = dragRef.current;
      const sheet = dialogRef.current;
      if (!d || !sheet || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - d.startY;
      if (!d.moved) {
        if (Math.abs(dy) < BOTTOM_SHEET_DRAG_THRESHOLD) return;
        d.moved = true;
        sheet.classList.add('is-dragging');
        try {
          d.captureEl?.setPointerCapture?.(e.pointerId);
        } catch {
          /* environnement sans capture de pointeur (jsdom) */
        }
      }
      const h = Math.round(Math.min(d.maxHeight, Math.max(0, d.startHeight - dy)));
      d.currentHeight = h;
      sheet.style.height = `${h}px`;
      d.samples.push({ t: now(), y: e.clientY });
      if (d.samples.length > 8) d.samples.shift();
      if (e.cancelable) e.preventDefault();
    };
    const finish = (e, cancelled) => {
      const d = dragRef.current;
      const sheet = dialogRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      if (!d.moved || !sheet) return;
      try {
        d.captureEl?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* idem */
      }
      sheet.classList.remove('is-dragging');
      sheet.style.height = '';
      if (cancelled) return;
      const result = resolveSnapRelease({
        height: d.currentHeight,
        velocity: releaseVelocity(d.samples),
        snapHeights: d.heights,
        fromSnap: d.fromSnap,
        dismissOnDragDown,
      });
      if (result.action === 'dismiss') onCloseRef.current?.();
      else setSnap(result.snap);
    };
    const onUp = (e) => finish(e, false);
    const onCancel = (e) => finish(e, true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    const mountedSheet = dialogRef.current;
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (mountedSheet) {
        mountedSheet.classList.remove('is-dragging');
        mountedSheet.style.height = '';
      }
      dragRef.current = null;
    };
  }, [dialogRef, dismissOnDragDown]);

  const hasTitle = title != null && title !== false && title !== '';
  const labelledBy = !ariaLabel && hasTitle ? titleId : undefined;

  return createPortal(
    <div
      ref={overlayRef}
      className={joinClassNames('fm-bottom-sheet-overlay', overlayClassName)}
      role="presentation"
      data-testid={testId ? `${testId}-overlay` : undefined}
      onClick={(e) => {
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <div
        ref={dialogRef}
        className={joinClassNames(
          'fm-bottom-sheet',
          `is-snap-${snap}`,
          dialogMode && 'fm-bottom-sheet--dialog',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid={testId}
        data-snap={snap}
        data-reduced-motion={reducedMotion ? 'true' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {showHandle && !dialogMode ? (
          <div className="fm-bottom-sheet__handle" onPointerDown={startDrag} aria-hidden="true">
            <span className="fm-bottom-sheet__grip" />
          </div>
        ) : null}
        <div className="fm-bottom-sheet__head" onPointerDown={startDrag}>
          {hasTitle ? (
            <h2 id={titleId} className="fm-bottom-sheet__title">
              {title}
            </h2>
          ) : (
            <span className="fm-bottom-sheet__title fm-bottom-sheet__title--empty" />
          )}
          <button
            type="button"
            className="fm-bottom-sheet__close"
            aria-label={closeLabel}
            onClick={() => onCloseRef.current?.()}
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="fm-bottom-sheet__body">{children}</div>
        {footer ? <div className="fm-bottom-sheet__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Feuille basse à crans, partagée ForetMap / G&L / plan (kit d'interface, lot 3 du plan de
 * convergence `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §5.2).
 *
 * - portail sous `document.body`, `role="dialog" aria-modal="true"`, piège de focus + Échap +
 *   restauration du focus (`useDialogA11y`), retour navigateur/Android (`useOverlayHistoryBack`),
 *   verrou du défilement du body, `inert` sur les frères de la surcouche ;
 * - crans `peek` (≈ 30 dvh), `half` (≈ 55 dvh), `full` (viewport − zone sûre − 24 px), poignée
 *   glissable (poignée + en-tête) avec aimantation au relâchement selon position et vitesse ;
 *   glisser sous le cran bas ferme (`dismissOnDragDown`) ;
 * - `prefers-reduced-motion` : aucune transition (CSS + `data-reduced-motion`).
 *
 * @param {object} props
 * @param {boolean} [props.open=false]
 * @param {() => void} props.onClose
 * @param {import('react').ReactNode} [props.title] titre visible (h2), nom accessible par défaut
 * @param {string} [props.ariaLabel] nom accessible explicite (prioritaire sur le titre)
 * @param {import('react').ReactNode} [props.footer] pied (boutons d'action)
 * @param {Array<'peek'|'half'|'full'>} [props.snapPoints=['peek','half','full']]
 * @param {'peek'|'half'|'full'} [props.initialSnap='half']
 * @param {(snap: string) => void} [props.onSnapChange]
 * @param {boolean} [props.closeOnOverlay=true]
 * @param {string} [props.className] classes supplémentaires sur la feuille
 * @param {string} [props.overlayClassName] classes supplémentaires sur la surcouche
 * @param {string} [props.testId] `data-testid` de la feuille (`${testId}-overlay` sur la surcouche)
 * @param {boolean} [props.showHandle=true]
 * @param {boolean} [props.dismissOnDragDown=true]
 * @param {string} [props.closeLabel='Fermer'] `aria-label` du bouton de fermeture
 * @param {boolean} [props.wideAsDialog=false] ≥ 1024 px : panneau centré (`fm-bottom-sheet--dialog`)
 */
export function BottomSheet({
  open = false,
  onClose,
  title,
  ariaLabel,
  children,
  footer = null,
  snapPoints = BOTTOM_SHEET_SNAPS,
  initialSnap = 'half',
  onSnapChange = null,
  closeOnOverlay = true,
  className = '',
  overlayClassName = '',
  testId,
  showHandle = true,
  dismissOnDragDown = true,
  closeLabel = 'Fermer',
  wideAsDialog = false,
}) {
  const wide = useMediaQuery(BOTTOM_SHEET_WIDE_QUERY);
  if (!open || typeof document === 'undefined' || !document.body) return null;
  return (
    <BottomSheetSurface
      onClose={onClose}
      title={title}
      ariaLabel={ariaLabel}
      footer={footer}
      snapPointsKey={normalizeSnapPoints(snapPoints).join(',')}
      initialSnap={initialSnap}
      onSnapChange={onSnapChange}
      closeOnOverlay={closeOnOverlay}
      className={className}
      overlayClassName={overlayClassName}
      testId={testId}
      showHandle={showHandle}
      dismissOnDragDown={dismissOnDragDown}
      closeLabel={closeLabel}
      dialogMode={Boolean(wideAsDialog && wide)}
    >
      {children}
    </BottomSheetSurface>
  );
}
