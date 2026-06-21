import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLContentPage } from '../../src/gl/components/GLContentPage.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  clearGlSession: vi.fn(() => {
    localStorage.removeItem('gl_session');
  }),
}));

describe('GLContentPage', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('affiche le titre après chargement world', async () => {
    apiGlMock.mockResolvedValue({
      slug: 'world',
      title: 'Le monde de Gnomes & Licornes',
      bodyMarkdown: 'Bienvenue dans **Gnomes & Licornes**.',
    });

    render(
      <GLContentPage
        slug="world"
        fallbackTitle="Le monde de Gnomes & Licornes"
        auth={{ permissions: ['gl.read'] }}
        brandSlots={{}}
      />,
    );

    expect(screen.getByText('Chargement…')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /monde de Gnomes/i })).toBeTruthy();
    });
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/content/world');
    const body = document.querySelector('.gl-editorial-body.scroll-reveal');
    expect(body?.classList.contains('is-visible')).toBe(true);
  });

  test('401 : boutons Réessayer et Se reconnecter', async () => {
    const err = new Error('Session expirée — reconnectez-vous à Gnomes & Licornes.');
    err.status = 401;
    apiGlMock.mockRejectedValue(err);

    render(
      <GLContentPage slug="world" fallbackTitle="Monde" auth={{ permissions: ['gl.read'] }} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Session expirée/i)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se reconnecter' })).toBeTruthy();
  });

  test('Réessayer relance le chargement sans reload complet', async () => {
    apiGlMock.mockRejectedValueOnce(new Error('Service indisponible')).mockResolvedValueOnce({
      slug: 'world',
      title: 'Monde OK',
      bodyMarkdown: 'Contenu',
    });

    render(
      <GLContentPage slug="world" fallbackTitle="Monde" auth={{ permissions: ['gl.read'] }} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Service indisponible/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Monde OK' })).toBeTruthy();
    });
    expect(apiGlMock).toHaveBeenCalledTimes(2);
  });
});
