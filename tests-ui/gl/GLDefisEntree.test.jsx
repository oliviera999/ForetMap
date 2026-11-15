import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'jeton',
}));

import { GLDefisEntree } from '../../src/gl/components/defis/GLDefisEntree.jsx';

describe('GLDefisEntree — les défis de la Trame en plein écran', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({
      actifs: true,
      mode: 'individuel',
      tourOuvert: false,
      types: [],
      defis: [],
      pages: { utilisees: 0, plafond: 2 },
      aReparer: [],
    });
  });

  test('rien n’est chargé avant l’appui ; la vue s’ouvre en dialogue, se ferme au bouton et à Échap', async () => {
    render(<GLDefisEntree gameId={7} />);
    const bouton = screen.getByTestId('gl-defis-entree-bouton');
    expect(apiGlMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('gl-defis-plein')).toBeNull();

    fireEvent.click(bouton);
    const vue = await waitFor(() => screen.getByTestId('gl-defis-plein'));
    expect(vue.getAttribute('role')).toBe('dialog');
    expect(vue.getAttribute('aria-modal')).toBe('true');
    // Hors du flux de la page : la vue prend tout l'écran, quelle que soit la colonne d'origine.
    expect(vue.parentElement).toBe(document.body);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis'));
    expect(document.activeElement).toBe(screen.getByTestId('gl-defis-fermer'));

    fireEvent.click(screen.getByTestId('gl-defis-fermer'));
    expect(screen.queryByTestId('gl-defis-plein')).toBeNull();
    expect(document.activeElement).toBe(bouton);

    fireEvent.click(bouton);
    await waitFor(() => screen.getByTestId('gl-defis-plein'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('gl-defis-plein')).toBeNull();
  });

  test('sans partie, aucune entrée', () => {
    const { container } = render(<GLDefisEntree gameId={null} />);
    expect(container.firstChild).toBeNull();
  });
});
