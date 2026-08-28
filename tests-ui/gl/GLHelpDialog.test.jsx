import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { GLHelpDialog } from '../../src/gl/components/GLHelpDialog.jsx';
import { invalidateGlNarratorCache } from '../../src/gl/hooks/useGlNarrator.js';
import { invalidateGlHelpConfigCache } from '../../src/gl/hooks/useGlHelpContent.js';

const NARRATOR = { enabled: true, speakerName: 'OLU', fallbackSilhouette: 'olu', portraits: {} };
const HELP = {
  entries: {
    'tab:maps': {
      title: 'Les cartes',
      body: 'Zoome et clique un repère.',
      bodyMj: 'Vérifiez les repères avant la séance.',
    },
    'tab:forum': { title: 'Forum', body: 'Pour poser une question.' },
    'tab:vide': { title: 'Vide', body: '   ' },
  },
};

function mockApi() {
  apiGLMock.mockImplementation((path) => {
    if (path === '/api/gl/content/narrator') return Promise.resolve(NARRATOR);
    if (path === '/api/gl/content/help') return Promise.resolve(HELP);
    return Promise.reject(new Error(`inattendu: ${path}`));
  });
}

describe('GLHelpDialog — aide GL appelée', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    invalidateGlNarratorCache();
    invalidateGlHelpConfigCache();
    localStorage.clear();
    mockApi();
  });

  test('un bouton « ? » ouvre l’aide, qui n’est pas affichée avant', async () => {
    render(<GLHelpDialog helpKey="tab:maps" />);
    const button = await screen.findByRole('button', { name: /Ouvrir l'aide/ });
    expect(screen.queryByText('Zoome et clique un repère.')).toBeNull();

    await userEvent.click(button);
    expect(await screen.findByText('Zoome et clique un repère.')).toBeTruthy();
    expect(screen.getByText('Les cartes')).toBeTruthy();
  });

  test('le bouton pulse tant que l’aide de l’onglet n’a jamais été ouverte', async () => {
    const { unmount } = render(<GLHelpDialog helpKey="tab:maps" />);
    const button = await screen.findByRole('button', { name: /Ouvrir l'aide/ });
    expect(button.className).toContain('is-pulsing');

    await userEvent.click(button);
    expect(button.className).not.toContain('is-pulsing');
    unmount();

    // La mémoire est persistée par clé : au retour, le bouton ne réclame plus l'attention.
    render(<GLHelpDialog helpKey="tab:maps" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Ouvrir l'aide/ }).className).not.toContain(
        'is-pulsing',
      ),
    );
  });

  test('un MJ lit la variante qui lui est destinée', async () => {
    render(<GLHelpDialog helpKey="tab:maps" isStaff />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir l'aide/ }));
    expect(await screen.findByText('Vérifiez les repères avant la séance.')).toBeTruthy();
    expect(screen.queryByText('Zoome et clique un repère.')).toBeNull();
  });

  test('sans variante MJ, joueur et MJ lisent le même texte', async () => {
    render(<GLHelpDialog helpKey="tab:forum" isStaff />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir l'aide/ }));
    expect(await screen.findByText('Pour poser une question.')).toBeTruthy();
  });

  test('une entrée sans texte n’affiche aucun bouton', async () => {
    const { container } = render(<GLHelpDialog helpKey="tab:vide" />);
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.gl-help-btn')).toBeNull());
  });

  test('le portrait d’OLU accompagne l’aide, sans porter d’information', async () => {
    render(<GLHelpDialog helpKey="tab:maps" />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir l'aide/ }));
    const portrait = document.querySelector('.gl-help-dialog__portrait');
    expect(portrait).toBeTruthy();
    expect(portrait).toHaveAttribute('aria-hidden', 'true');
    expect(portrait).toHaveAttribute('data-framing', 'face');
  });

  test('le bouton de visite guidée n’apparaît que si un parcours est proposé', async () => {
    const onStartTour = vi.fn();
    const { unmount } = render(<GLHelpDialog helpKey="tab:maps" />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir l'aide/ }));
    expect(screen.queryByRole('button', { name: /Visite guidée/ })).toBeNull();
    unmount();

    render(<GLHelpDialog helpKey="tab:maps" onStartTour={onStartTour} />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir l'aide/ }));
    await userEvent.click(screen.getByRole('button', { name: /Visite guidée/ }));
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });
});
