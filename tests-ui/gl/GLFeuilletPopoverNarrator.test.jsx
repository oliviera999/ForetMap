import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { GLFeuilletPopover } from '../../src/gl/components/GLFeuilletPopover.jsx';
import { invalidateGlNarratorCache } from '../../src/gl/hooks/useGlNarrator.js';

const PORTRAIT = '/uploads/media-library/image/olu-parle.webp';
const NARRATOR = {
  enabled: true,
  speakerName: 'OLU',
  fallbackSilhouette: 'olu',
  portraits: { parle: { bust: PORTRAIT } },
};

function portrait() {
  return document.querySelector('.gl-narrator-scene__portrait');
}

describe('GLFeuilletPopover — mise en scène OLU', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    invalidateGlNarratorCache();
  });

  test('le feuillet est porté par une bulle signée OLU, portrait à l’appui', async () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    render(
      <GLFeuilletPopover open titre="La Trame" popover="J’ai noté ceci." onClose={() => {}} />,
    );

    await waitFor(() => expect(screen.getByText('OLU')).toBeTruthy());
    expect(document.querySelector('.fm-speech-bubble')).toBeTruthy();
    const img = portrait().querySelector('img');
    expect(img.getAttribute('src')).toBe(PORTRAIT);
  });

  test('le portrait reste décoratif : aria-hidden, alt vide, texte intact', async () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    render(
      <GLFeuilletPopover open titre="La Trame" popover="Texte du feuillet" onClose={() => {}} />,
    );

    await waitFor(() => expect(portrait()).toBeTruthy());
    expect(portrait()).toHaveAttribute('aria-hidden', 'true');
    expect(portrait().querySelector('img')).toHaveAttribute('alt', '');
    // Machine à écrire : le texte complet est dans le DOM dès le premier rendu (§9.1).
    expect(document.querySelector('.fm-speech-bubble__text').textContent).toBe('Texte du feuillet');
  });

  test('sans portrait téléversé, la silhouette SVG prend le relais', async () => {
    apiGLMock.mockResolvedValue({ ...NARRATOR, portraits: {} });
    render(<GLFeuilletPopover open titre="La Trame" popover="Texte" onClose={() => {}} />);

    await waitFor(() => expect(portrait()).toBeTruthy());
    expect(portrait()).toHaveAttribute('data-source', 'svg');
    expect(portrait().querySelector('svg')).toBeTruthy();
  });

  test('narrateur éteint : ni portrait ni étiquette, le feuillet reste lisible', async () => {
    apiGLMock.mockResolvedValue({ ...NARRATOR, enabled: false });
    render(
      <GLFeuilletPopover open titre="La Trame" popover="Texte du feuillet" onClose={() => {}} />,
    );

    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() => expect(portrait()).toBeNull());
    expect(screen.queryByText('OLU')).toBeNull();
    expect(document.querySelector('.fm-speech-bubble__text').textContent).toBe('Texte du feuillet');
  });

  test('les mécaniques de jeu du feuillet ne bougent pas', async () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    render(
      <GLFeuilletPopover
        open
        titre="La Trame"
        popover="Texte"
        coutGemme={2}
        gainCoeur={1}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(portrait()).toBeTruthy());
    expect(screen.getByLabelText('Effets de jeu').textContent).toContain('2 gemmes');
  });
});
