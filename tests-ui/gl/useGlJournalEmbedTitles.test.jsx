import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { useGlJournalEmbedTitles } from '../../src/gl/hooks/useGlJournalEmbedTitles.js';

const EMBED_HTML =
  '<aside class="gl-journal-embed" data-gl-embed-type="spell" data-gl-ref="SL001"></aside>';

describe('useGlJournalEmbedTitles', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
  });

  test('injecte data-gl-title une fois les titres résolus', async () => {
    apiGLMock.mockResolvedValue({ titles: { 'spell|SL001': 'Flamme protectrice' } });
    const { result } = renderHook(() => useGlJournalEmbedTitles(EMBED_HTML));

    // Avant résolution : HTML d'origine (pas de titre)
    expect(result.current).toBe(EMBED_HTML);

    await waitFor(() => {
      expect(result.current).toContain('data-gl-title="Flamme protectrice"');
    });
    expect(apiGLMock).toHaveBeenCalledWith('/api/gl/player-journal/embeds/resolve', 'POST', {
      embeds: [{ type: 'spell', ref: 'SL001' }],
    });
  });

  test('sans encart, ne fait aucun appel et renvoie le HTML tel quel', () => {
    const html = '<p>Bonjour</p>';
    const { result } = renderHook(() => useGlJournalEmbedTitles(html));
    expect(result.current).toBe(html);
    expect(apiGLMock).not.toHaveBeenCalled();
  });

  test('titre non résolu : conserve le HTML d’origine (repli CSS type · ref)', async () => {
    apiGLMock.mockResolvedValue({ titles: {} });
    const { result } = renderHook(() => useGlJournalEmbedTitles(EMBED_HTML));
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    expect(result.current).toBe(EMBED_HTML);
  });
});
