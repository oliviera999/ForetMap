import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { GLHelpPanel } from '../../src/gl/components/GLHelpPanel.jsx';
import { invalidateGlNarratorCache } from '../../src/gl/hooks/useGlNarrator.js';

const NARRATOR = {
  enabled: true,
  speakerName: 'OLU',
  fallbackSilhouette: 'olu',
  portraits: { neutre: { face: '/uploads/media-library/image/olu-face.webp' } },
};

describe('GLHelpPanel — portrait du narrateur', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    invalidateGlNarratorCache();
    localStorage.clear();
  });

  test('l’en-tête porte le portrait `face`, sans toucher au titre', async () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    render(<GLHelpPanel helpKey="tab:maps" title="Aide carte" body="Corps de l’aide" />);

    await waitFor(() => expect(document.querySelector('.gl-help-panel__portrait')).toBeTruthy());
    const node = document.querySelector('.gl-help-panel__portrait');
    expect(node).toHaveAttribute('data-framing', 'face');
    expect(node).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Aide carte')).toBeTruthy();
    expect(screen.getByText('Corps de l’aide')).toBeTruthy();
  });

  test('narrateur éteint : l’aide reste affichée sans portrait', async () => {
    apiGLMock.mockResolvedValue({ ...NARRATOR, enabled: false });
    render(<GLHelpPanel helpKey="tab:maps" title="Aide carte" body="Corps de l’aide" />);

    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.gl-help-panel__portrait')).toBeNull());
    expect(screen.getByText('Aide carte')).toBeTruthy();
  });

  test('sans corps d’aide, rien ne s’affiche — pas même le portrait', () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    const { container } = render(<GLHelpPanel helpKey="tab:maps" title="Aide carte" body="" />);
    expect(container.innerHTML).toBe('');
  });
});
