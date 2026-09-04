import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Tooltip } from '../../src/shared/components/Tooltip.jsx';

const OPEN_DELAY_MS = 300;
const LONG_PRESS_MS = 400;
const TOUCH_VISIBLE_MS = 3000;

/**
 * jsdom renvoie des rectangles nuls : on pilote la géométrie hôte / bulle pour tester
 * le repositionnement. La bulle n'existe qu'une fois ouverte, d'où le test sur la classe.
 */
function mockRects({ host, bubble }) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
    const isBubble = this.classList?.contains('fm-tooltip');
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      ...(isBubble ? bubble : host),
    };
  });
}

function renderButton(props = {}) {
  return render(
    <Tooltip text="Zoomer sur la carte" {...props}>
      <button type="button">Zoom</button>
    </Tooltip>,
  );
}

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.innerWidth = 1024;
    window.innerHeight = 768;
    // Géométrie « confortable » par défaut : la bulle tient dans le viewport, pas de bascule.
    mockRects({
      host: { top: 300, bottom: 330, left: 300, right: 400, width: 100, height: 30 },
      bubble: { width: 120, height: 40 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('fermé au repos : pas de bulle ni de aria-describedby', () => {
    renderButton();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby');
  });

  test('survol : ouverture après 300 ms, avec role="tooltip" et aria-describedby', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(OPEN_DELAY_MS - 1);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Zoomer sur la carte');
    expect(tooltip.id).toBeTruthy();
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
  });

  test('sortie du survol avant 300 ms : la bulle ne s’ouvre jamais', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(OPEN_DELAY_MS * 2);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('sortie du survol après ouverture : fermeture immédiate', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(OPEN_DELAY_MS);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  test('focus clavier : ouverture immédiate, blur : fermeture', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('tactile : appui long 400 ms ouvre, puis masquage automatique après 3 s', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.touchStart(button);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOUCH_VISIBLE_MS - 1);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('tactile : relâcher avant 400 ms annule l’ouverture', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.touchStart(button);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.touchEnd(button);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('tactile : touchCancel annule aussi l’appui long', () => {
    renderButton();
    const button = screen.getByRole('button');

    fireEvent.touchStart(button);
    fireEvent.touchCancel(button);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('les gestionnaires de l’enfant sont préservés', () => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    render(
      <Tooltip text="Info">
        <button type="button" onMouseEnter={onMouseEnter} onFocus={onFocus}>
          Zoom
        </button>
      </Tooltip>,
    );
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  test('fermé, l’aria-describedby d’origine de l’enfant est conservé', () => {
    render(
      <Tooltip text="Info">
        <button type="button" aria-describedby="aide-externe">
          Zoom
        </button>
      </Tooltip>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'aide-externe');
  });

  test('texte vide : l’enfant est rendu tel quel, sans enveloppe', () => {
    const { container } = render(
      <Tooltip text="   ">
        <button type="button">Zoom</button>
      </Tooltip>,
    );
    expect(container.querySelector('.fm-tooltip-wrap')).toBeNull();
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('enfant non-élément (texte brut) : rendu tel quel', () => {
    const { container } = render(<Tooltip text="Info">Texte brut</Tooltip>);
    expect(container.textContent).toBe('Texte brut');
    expect(container.querySelector('.fm-tooltip-wrap')).toBeNull();
  });

  test('position par défaut « top » conservée quand la bulle tient dans le viewport', () => {
    renderButton();
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveClass('fm-tooltip--top');
  });

  test('top → bottom si la bulle sortirait par le haut', () => {
    mockRects({
      host: { top: 10, bottom: 40, left: 300, right: 400, width: 100, height: 30 },
      bubble: { width: 120, height: 40 },
    });
    renderButton({ position: 'top' });
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveClass('fm-tooltip--bottom');
  });

  test('bottom → top si la bulle sortirait par le bas', () => {
    mockRects({
      host: { top: 740, bottom: 760, left: 300, right: 400, width: 100, height: 20 },
      bubble: { width: 120, height: 40 },
    });
    renderButton({ position: 'bottom' });
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveClass('fm-tooltip--top');
  });

  test('left → right si la bulle sortirait par la gauche', () => {
    mockRects({
      host: { top: 300, bottom: 330, left: 20, right: 120, width: 100, height: 30 },
      bubble: { width: 120, height: 40 },
    });
    renderButton({ position: 'left' });
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveClass('fm-tooltip--right');
  });

  test('right → left si la bulle sortirait par la droite', () => {
    mockRects({
      host: { top: 300, bottom: 330, left: 900, right: 1000, width: 100, height: 30 },
      bubble: { width: 120, height: 40 },
    });
    renderButton({ position: 'right' });
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveClass('fm-tooltip--left');
  });

  test('démontage pendant le délai de survol : aucun minuteur orphelin', () => {
    const { unmount } = renderButton();
    fireEvent.mouseEnter(screen.getByRole('button'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
