import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiGL = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: (...args) => apiGL(...args) }));

import { GLLoupeButton, resetLoupeCacheForTests } from '../../src/gl/components/GLLoupeButton.jsx';

const loupe = (over = {}) => ({
  grimoire: [{ code: 'loupe', unlocked: true, charged: true, pointsToRecharge: 0, ...over }],
});

beforeEach(() => {
  apiGL.mockReset();
  resetLoupeCacheForTests();
});

describe('GLLoupeButton (S3)', () => {
  test('sortilège fermé ou indisponible : rien ne s’affiche', async () => {
    apiGL.mockResolvedValueOnce(loupe({ unlocked: false }));
    const { container } = render(<GLLoupeButton presentationToken="tok" onEliminate={() => {}} />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  test('lance la Loupe et transmet le choix écarté', async () => {
    const user = userEvent.setup();
    const onEliminate = vi.fn();
    apiGL.mockResolvedValueOnce(loupe()).mockResolvedValueOnce({
      success: true,
      spell: { code: 'loupe', unlocked: true, charged: false, pointsToRecharge: 5 },
      effect: { eliminatedChoiceId: 2 },
    });
    render(<GLLoupeButton presentationToken="tok" onEliminate={onEliminate} />);
    await user.click(await screen.findByRole('button', { name: /Loupe/ }));
    expect(apiGL).toHaveBeenLastCalledWith('/api/gl/voyageur/spells/loupe/cast', 'POST', {
      target: 'tok',
    });
    expect(onEliminate).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/Une mauvaise réponse est écartée/)).toBeInTheDocument();
  });

  test('sortilège à recharger : le dit au lieu d’un bouton', async () => {
    apiGL.mockResolvedValueOnce(loupe({ charged: false, pointsToRecharge: 3 }));
    render(<GLLoupeButton presentationToken="tok" onEliminate={() => {}} />);
    expect(await screen.findByText(/encore 3 point\(s\)/)).toBeInTheDocument();
  });
});
