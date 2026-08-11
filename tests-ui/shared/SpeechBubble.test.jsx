import React, { createRef } from 'react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { SpeechBubble } from '../../src/shared/components/SpeechBubble.jsx';

const TEXT = 'Voilà la carte.';

/** Pilote `prefers-reduced-motion` pour le hook partagé usePrefersReducedMotion. */
function mockReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function revealedText(container) {
  return container.querySelector('.fm-speech-bubble__revealed')?.textContent ?? '';
}

function pendingText(container) {
  return container.querySelector('.fm-speech-bubble__pending')?.textContent ?? '';
}

describe('SpeechBubble', () => {
  beforeEach(() => {
    mockReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('révèle le texte progressivement, sans jamais le tronquer dans le DOM', () => {
    const { container } = render(<SpeechBubble text={TEXT} charDelay={10} />);

    // Rien de visible au départ, mais le texte complet est déjà lisible par un lecteur d'écran.
    expect(revealedText(container)).toBe('');
    expect(container.textContent).toBe(TEXT);
    expect(container.querySelector('[data-typing]')).toHaveAttribute('data-typing', 'true');

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(revealedText(container)).toBe(TEXT.slice(0, 3));
    expect(pendingText(container)).toBe(TEXT.slice(3));
    expect(container.textContent).toBe(TEXT);

    act(() => {
      vi.advanceTimersByTime(TEXT.length * 10);
    });
    expect(revealedText(container)).toBe(TEXT);
    expect(container.querySelector('[data-typing]')).toHaveAttribute('data-typing', 'false');
    expect(container.querySelector('.fm-speech-bubble__caret')).toBeNull();
  });

  test("la portion non révélée n'est pas masquée aux technologies d'assistance", () => {
    const { container } = render(<SpeechBubble text={TEXT} charDelay={10} />);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const pending = container.querySelector('.fm-speech-bubble__pending');
    expect(pending).not.toBeNull();
    expect(pending.getAttribute('aria-hidden')).toBeNull();
  });

  test("la bulle n'est pas une région live (relecture en boucle interdite)", () => {
    const { container } = render(<SpeechBubble text={TEXT} charDelay={10} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test('un clic affiche immédiatement tout le texte', () => {
    const { container } = render(<SpeechBubble text={TEXT} charDelay={10} />);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(revealedText(container)).toBe(TEXT.slice(0, 2));

    fireEvent.click(container.querySelector('.fm-speech-bubble'));

    expect(revealedText(container)).toBe(TEXT);
    expect(container.querySelector('[data-typing]')).toHaveAttribute('data-typing', 'false');

    // Le minuteur est bien arrêté : le texte ne « recule » pas après coup.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(revealedText(container)).toBe(TEXT);
  });

  test('affichage instantané sous prefers-reduced-motion', () => {
    mockReducedMotion(true);
    const { container } = render(<SpeechBubble text={TEXT} charDelay={10} />);

    expect(revealedText(container)).toBe(TEXT);
    expect(container.querySelector('[data-typing]')).toHaveAttribute('data-typing', 'false');
    expect(container.querySelector('.fm-speech-bubble__caret')).toBeNull();
  });

  test('typewriter=false affiche le texte d’un bloc', () => {
    const { container } = render(<SpeechBubble text={TEXT} typewriter={false} charDelay={10} />);
    expect(revealedText(container)).toBe(TEXT);
    expect(container.querySelector('[data-typing]')).toHaveAttribute('data-typing', 'false');
  });

  test("l'étiquette de locuteur ne s'affiche que si elle est fournie", () => {
    const { container, rerender } = render(<SpeechBubble text={TEXT} typewriter={false} />);
    expect(container.querySelector('[data-speech-bubble-speaker]')).toBeNull();

    rerender(<SpeechBubble text={TEXT} typewriter={false} speakerName="OLU" />);
    expect(container.querySelector('[data-speech-bubble-speaker]')).toHaveTextContent('OLU');
  });

  test('la réf expose revealAll() et isTyping()', () => {
    const ref = createRef();
    const { container } = render(<SpeechBubble ref={ref} text={TEXT} charDelay={10} />);

    expect(ref.current.isTyping()).toBe(true);
    act(() => {
      ref.current.revealAll();
    });
    expect(ref.current.isTyping()).toBe(false);
    expect(revealedText(container)).toBe(TEXT);
  });

  test('un changement de texte relance la frappe depuis le début', () => {
    const { container, rerender } = render(<SpeechBubble text={TEXT} charDelay={10} />);
    act(() => {
      vi.advanceTimersByTime(TEXT.length * 10 + 50);
    });
    expect(revealedText(container)).toBe(TEXT);

    rerender(<SpeechBubble text="Autre étape." charDelay={10} />);
    expect(revealedText(container)).toBe('');
    expect(container.textContent).toBe('Autre étape.');
  });

  test('un texte vide ne déclenche pas de frappe', () => {
    const { container } = render(<SpeechBubble text="" charDelay={10} />);
    expect(container.querySelector('[data-typing]')).toHaveAttribute('data-typing', 'false');
  });
});
