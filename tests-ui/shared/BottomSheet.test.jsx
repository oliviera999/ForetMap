import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { BottomSheet } from '../../src/shared/ui/BottomSheet.jsx';
import {
  computeSnapHeights,
  normalizeSnapPoints,
  releaseVelocity,
  resolveInitialSnap,
  resolveSnapRelease,
} from '../../src/shared/ui/bottomSheetSnap.js';

/** matchMedia contrôlé : `reduced` pilote `prefers-reduced-motion`, `wide` la requête ≥ 1024 px. */
function mockMatchMedia({ reduced = false, wide = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: /reduced-motion/.test(query)
      ? reduced
      : /min-width: 1024px/.test(query)
        ? wide
        : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function renderSheet(props = {}) {
  const onClose = vi.fn();
  const utils = render(
    <BottomSheet open onClose={onClose} title="Filtres" testId="sheet" {...props}>
      <button type="button">Premier champ</button>
      <p>Contenu</p>
    </BottomSheet>,
  );
  return { onClose, ...utils };
}

/**
 * Glisser synthétique sur la poignée : appui, mouvements, relâchement (pointer events).
 * `performance.now` est simulé : `stepMs` fixe la vitesse du geste (100 ms/pas = geste posé).
 */
function dragHandle(handle, { from, to, steps = 3, stepMs = 100 }) {
  fireEvent.pointerDown(handle, { clientY: from, pointerId: 1, button: 0 });
  for (let i = 1; i <= steps; i += 1) {
    vi.advanceTimersByTime(stepMs);
    const y = from + ((to - from) * i) / steps;
    fireEvent.pointerMove(window, { clientY: y, pointerId: 1 });
  }
  fireEvent.pointerUp(window, { clientY: to, pointerId: 1 });
}

describe('bottomSheetSnap (géométrie pure)', () => {
  test('normalizeSnapPoints ordonne, déduplique et retombe sur les trois crans', () => {
    expect(normalizeSnapPoints(['full', 'peek', 'peek'])).toEqual(['peek', 'full']);
    expect(normalizeSnapPoints(['inconnu'])).toEqual(['peek', 'half', 'full']);
    expect(resolveInitialSnap(['half', 'full'], 'peek')).toBe('half');
    expect(resolveInitialSnap(['peek', 'half', 'full'], 'full')).toBe('full');
  });

  test('computeSnapHeights : 30 % / 55 % du viewport, plein = viewport − zone sûre − 24', () => {
    const h = computeSnapHeights({ viewportHeight: 1000, safeTop: 40 });
    expect(h.peek).toBeCloseTo(300);
    expect(h.half).toBeCloseTo(550);
    expect(h.full).toBe(936);
  });

  test('releaseVelocity : positive vers le haut, 0 sans écart de temps', () => {
    expect(releaseVelocity([{ t: 0, y: 500 }])).toBe(0);
    expect(
      releaseVelocity([
        { t: 0, y: 500 },
        { t: 50, y: 400 },
      ]),
    ).toBeCloseTo(2);
    expect(
      releaseVelocity([
        { t: 0, y: 400 },
        { t: 0, y: 500 },
      ]),
    ).toBe(0);
  });

  test('resolveSnapRelease : aimantation au plus proche, projection par la vitesse', () => {
    const snapHeights = { peek: 300, half: 550, full: 936 };
    expect(resolveSnapRelease({ height: 600, velocity: 0, snapHeights, fromSnap: 'half' })).toEqual(
      {
        action: 'snap',
        snap: 'half',
      },
    );
    // 600 px + 2 px/ms × 120 ms = 840 → plein.
    expect(resolveSnapRelease({ height: 600, velocity: 2, snapHeights, fromSnap: 'half' })).toEqual(
      {
        action: 'snap',
        snap: 'full',
      },
    );
  });

  test('resolveSnapRelease : sous 60 % du cran bas → fermeture, sauf si dismissOnDragDown=false', () => {
    const snapHeights = { peek: 300, half: 550, full: 936 };
    expect(resolveSnapRelease({ height: 120, velocity: 0, snapHeights, fromSnap: 'peek' })).toEqual(
      {
        action: 'dismiss',
      },
    );
    expect(
      resolveSnapRelease({
        height: 120,
        velocity: 0,
        snapHeights,
        fromSnap: 'peek',
        dismissOnDragDown: false,
      }),
    ).toEqual({ action: 'snap', snap: 'peek' });
    // Mouvement vif vers le bas depuis le cran bas → fermeture même sans descendre sous 60 %.
    expect(
      resolveSnapRelease({ height: 280, velocity: -1, snapHeights, fromSnap: 'peek' }),
    ).toEqual({ action: 'dismiss' });
  });
});

describe('BottomSheet', () => {
  let sibling;

  beforeEach(() => {
    mockMatchMedia();
    vi.useFakeTimers({ toFake: ['performance'] });
    sibling = document.createElement('div');
    sibling.id = 'app-root-sibling';
    document.body.appendChild(sibling);
  });

  afterEach(() => {
    sibling.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('fermé : rien n’est rendu', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="Filtres">
        <p>Contenu</p>
      </BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('ouvert : dialogue modal sous body, titre = nom accessible, cran initial « half »', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Filtres' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.parentElement.parentElement).toBe(document.body);
    expect(dialog.classList.contains('fm-bottom-sheet')).toBe(true);
    expect(dialog.classList.contains('is-snap-half')).toBe(true);
    expect(dialog.getAttribute('data-snap')).toBe('half');
    expect(screen.getByText('Contenu')).toBeTruthy();
    expect(dialog.querySelector('.fm-bottom-sheet__handle')).toBeTruthy();
  });

  test('ariaLabel prime sur le titre ; closeLabel nomme le bouton de fermeture', () => {
    renderSheet({ ariaLabel: 'Filtres des tâches', closeLabel: 'Fermer les filtres' });
    expect(screen.getByRole('dialog', { name: 'Filtres des tâches' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer les filtres' })).toBeTruthy();
  });

  test('initialSnap et snapPoints personnalisés ; className / testId appliqués', () => {
    renderSheet({
      snapPoints: ['half', 'full'],
      initialSnap: 'full',
      className: 'task-filters-sheet',
    });
    const dialog = screen.getByTestId('sheet');
    expect(dialog.classList.contains('is-snap-full')).toBe(true);
    expect(dialog.classList.contains('task-filters-sheet')).toBe(true);
    expect(screen.getByTestId('sheet-overlay').classList.contains('fm-bottom-sheet-overlay')).toBe(
      true,
    );
  });

  test('pied : rendu dans __foot, absent sans footer', () => {
    const { unmount } = renderSheet();
    expect(document.querySelector('.fm-bottom-sheet__foot')).toBeNull();
    unmount();
    renderSheet({ footer: <button type="button">Voir</button> });
    expect(document.querySelector('.fm-bottom-sheet__foot')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voir' })).toBeTruthy();
  });

  test('fermeture : bouton ✕, Échap, clic sur la surcouche (pas sur la feuille)', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('sheet-overlay'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test('closeOnOverlay=false : le clic sur la surcouche ne ferme pas', () => {
    const { onClose } = renderSheet({ closeOnOverlay: false });
    fireEvent.click(screen.getByTestId('sheet-overlay'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('focus : le premier focusable reçoit le focus, restauré à la fermeture', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Ouvrir';
    sibling.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    const { unmount } = renderSheet();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer' }));
    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  test('inert posé sur les frères de la surcouche pendant l’ouverture, retiré ensuite', () => {
    const { unmount } = renderSheet();
    expect(sibling.hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('sheet-overlay').hasAttribute('inert')).toBe(false);
    unmount();
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  test('un inert déjà présent sur un frère n’est pas retiré à la fermeture', () => {
    sibling.setAttribute('inert', '');
    const { unmount } = renderSheet();
    unmount();
    expect(sibling.hasAttribute('inert')).toBe(true);
  });

  test('verrou du défilement du body pendant l’ouverture, restauré à la fermeture', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = renderSheet();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  test('glisser la poignée : hauteur écrite en direct puis aimantation au cran le plus proche', () => {
    const onSnapChange = vi.fn();
    renderSheet({ onSnapChange });
    const dialog = screen.getByTestId('sheet');
    const handle = dialog.querySelector('.fm-bottom-sheet__handle');
    // jsdom : innerHeight 768 → peek ≈ 230, half ≈ 422, full = 744 ; départ mesuré = half.
    fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1, button: 0 });
    vi.advanceTimersByTime(100);
    fireEvent.pointerMove(window, { clientY: 400, pointerId: 1 });
    expect(dialog.classList.contains('is-dragging')).toBe(true);
    expect(dialog.style.height).toBe('622px');
    vi.advanceTimersByTime(100);
    fireEvent.pointerMove(window, { clientY: 300, pointerId: 1 });
    expect(dialog.style.height).toBe('722px');
    act(() => {
      fireEvent.pointerUp(window, { clientY: 300, pointerId: 1 });
    });
    expect(dialog.classList.contains('is-dragging')).toBe(false);
    expect(dialog.style.height).toBe('');
    expect(dialog.classList.contains('is-snap-full')).toBe(true);
    expect(dialog.getAttribute('data-snap')).toBe('full');
    expect(onSnapChange).toHaveBeenCalledWith('full');
  });

  test('glisser légèrement vers le bas depuis « half » → cran « peek »', () => {
    renderSheet();
    const dialog = screen.getByTestId('sheet');
    act(() => {
      dragHandle(dialog.querySelector('.fm-bottom-sheet__handle'), { from: 400, to: 560 });
    });
    expect(dialog.getAttribute('data-snap')).toBe('peek');
  });

  test('glisser aussi depuis l’en-tête, mais pas depuis le bouton de fermeture', () => {
    const { onClose } = renderSheet();
    const dialog = screen.getByTestId('sheet');
    act(() => {
      dragHandle(dialog.querySelector('.fm-bottom-sheet__head'), { from: 400, to: 100 });
    });
    expect(dialog.getAttribute('data-snap')).toBe('full');
    const closeBtn = screen.getByRole('button', { name: 'Fermer' });
    fireEvent.pointerDown(closeBtn, { clientY: 100, pointerId: 2, button: 0 });
    fireEvent.pointerMove(window, { clientY: 300, pointerId: 2 });
    expect(dialog.classList.contains('is-dragging')).toBe(false);
    fireEvent.pointerUp(window, { clientY: 300, pointerId: 2 });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('un appui sans mouvement ne change rien', () => {
    renderSheet();
    const dialog = screen.getByTestId('sheet');
    const handle = dialog.querySelector('.fm-bottom-sheet__handle');
    fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientY: 402, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 402, pointerId: 1 });
    expect(dialog.classList.contains('is-dragging')).toBe(false);
    expect(dialog.getAttribute('data-snap')).toBe('half');
  });

  test('glisser vers le bas au-delà du cran « peek » ferme la feuille', () => {
    const { onClose } = renderSheet({ initialSnap: 'peek' });
    const dialog = screen.getByTestId('sheet');
    act(() => {
      dragHandle(dialog.querySelector('.fm-bottom-sheet__handle'), { from: 500, to: 700 });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('mouvement vif vers le bas depuis « peek » ferme sans passer sous 60 % du cran', () => {
    const { onClose } = renderSheet({ initialSnap: 'peek' });
    const dialog = screen.getByTestId('sheet');
    // 60 px en 3 × 16 ms ≈ 1,25 px/ms vers le bas : hauteur 170 px (> 138), mais geste vif.
    act(() => {
      dragHandle(dialog.querySelector('.fm-bottom-sheet__handle'), {
        from: 500,
        to: 560,
        stepMs: 16,
      });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('dismissOnDragDown=false : glisser sous « peek » ramène au cran bas sans fermer', () => {
    const { onClose } = renderSheet({ initialSnap: 'peek', dismissOnDragDown: false });
    const dialog = screen.getByTestId('sheet');
    act(() => {
      dragHandle(dialog.querySelector('.fm-bottom-sheet__handle'), { from: 500, to: 700 });
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.getAttribute('data-snap')).toBe('peek');
    expect(dialog.style.height).toBe('');
  });

  test('pointercancel : la hauteur inline est retirée, le cran reste inchangé', () => {
    renderSheet();
    const dialog = screen.getByTestId('sheet');
    const handle = dialog.querySelector('.fm-bottom-sheet__handle');
    fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientY: 200, pointerId: 1 });
    expect(dialog.style.height).not.toBe('');
    fireEvent.pointerCancel(window, { clientY: 200, pointerId: 1 });
    expect(dialog.style.height).toBe('');
    expect(dialog.getAttribute('data-snap')).toBe('half');
  });

  test('showHandle=false : pas de poignée', () => {
    renderSheet({ showHandle: false });
    expect(document.querySelector('.fm-bottom-sheet__handle')).toBeNull();
  });

  test('prefers-reduced-motion : attribut data-reduced-motion posé (transitions coupées en CSS)', () => {
    mockMatchMedia({ reduced: true });
    renderSheet();
    expect(screen.getByTestId('sheet').getAttribute('data-reduced-motion')).toBe('true');
  });

  test('sans préférence de mouvement réduit : pas d’attribut', () => {
    renderSheet();
    expect(screen.getByTestId('sheet').hasAttribute('data-reduced-motion')).toBe(false);
  });

  test('wideAsDialog sur écran large : panneau centré sans poignée ni glisser', () => {
    mockMatchMedia({ wide: true });
    renderSheet({ wideAsDialog: true });
    const dialog = screen.getByTestId('sheet');
    expect(dialog.classList.contains('fm-bottom-sheet--dialog')).toBe(true);
    expect(dialog.querySelector('.fm-bottom-sheet__handle')).toBeNull();
    fireEvent.pointerDown(dialog.querySelector('.fm-bottom-sheet__head'), {
      clientY: 400,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 });
    expect(dialog.classList.contains('is-dragging')).toBe(false);
  });

  test('wideAsDialog=false sur écran large : feuille classique', () => {
    mockMatchMedia({ wide: true });
    renderSheet();
    expect(screen.getByTestId('sheet').classList.contains('fm-bottom-sheet--dialog')).toBe(false);
  });
});
