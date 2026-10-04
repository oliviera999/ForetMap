import { describe, test, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { GLVoyageurGainToast, gainToChips } from '../../src/gl/components/GLVoyageurGainToast.jsx';
import { GL_VOYAGEUR_GAIN_EVENT } from '../../src/gl/services/glVoyageurEvents.js';

describe('GLVoyageurGainToast (S1)', () => {
  test('gainToChips : une pastille par regard gagné', () => {
    expect(gainToChips({ proche: 1, loin: 0 })).toEqual([
      { regard: 'proche', text: '+1 regard du proche' },
    ]);
    expect(gainToChips({ proche: 1, loin: 2 }).map((c) => c.regard)).toEqual(['proche', 'loin']);
    expect(gainToChips(null)).toEqual([]);
  });

  test('affiche la pastille quand apiGL annonce un gain', () => {
    render(<GLVoyageurGainToast />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(GL_VOYAGEUR_GAIN_EVENT, { detail: { proche: 0, loin: 1 } }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('+1 regard du loin');
  });
});
