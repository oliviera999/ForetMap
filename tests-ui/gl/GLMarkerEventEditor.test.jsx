import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGL = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: (...args) => apiGL(...args) }));

const { GLMarkerEventEditor } = await import('../../src/gl/components/GLMarkerEventEditor.jsx');

// Montage de l'éditeur de repère : le mode « Biome de la case » lit le sous-biome saisi dans
// le formulaire du repère (prop `sousBiomeSlug`), à défaut celui du repère enregistré.
const QUIZ_MARKER = {
  id: 12,
  chapter_id: 7,
  event_type: 'quiz',
  sous_biome_slug: 'taiga',
  event_config: {
    version: 2,
    question: { set: 'biome', mode: 'random', pool: { biomeMode: 'sous_biome' } },
  },
};
const CHAPTER_BIOMES = [
  { slug: 'taiga', nom: 'Taïga' },
  { slug: 'toundra', nom: 'Toundra arctique' },
];

beforeEach(() => {
  apiGL.mockReset();
  apiGL.mockImplementation(async (url) =>
    String(url).includes('pool-preview') ? { items: [] } : [],
  );
});

function poolPreviewUrls() {
  return apiGL.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('pool-preview'));
}

describe('GLMarkerEventEditor — mode « Biome de la case »', () => {
  test('le sous-biome saisi (non enregistré) pilote l’aide et l’aperçu du pool', async () => {
    render(
      <GLMarkerEventEditor
        marker={QUIZ_MARKER}
        chapterBiomes={CHAPTER_BIOMES}
        sousBiomeSlug="toundra_hiver"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Biome de la case')).toBeInTheDocument();
    expect(
      screen.getByText('Questions du biome de la case : toundra (sous-biome toundra_hiver).'),
    ).toBeInTheDocument();
    await waitFor(() => expect(poolPreviewUrls().length).toBeGreaterThan(0));
    expect(poolPreviewUrls().at(-1)).toContain('biomeSlugs=toundra&');
  });

  test('sans saisie : sous-biome du repère enregistré ; case-charnière : repli chapitre', async () => {
    const { rerender } = render(
      <GLMarkerEventEditor
        marker={QUIZ_MARKER}
        chapterBiomes={CHAPTER_BIOMES}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Questions du biome de la case : taiga.')).toBeInTheDocument();

    rerender(
      <GLMarkerEventEditor
        marker={QUIZ_MARKER}
        chapterBiomes={CHAPTER_BIOMES}
        sousBiomeSlug="transition"
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/sans biome propre : tirage dans les biomes du chapitre/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(poolPreviewUrls().at(-1)).toContain(
        `biomeSlugs=${encodeURIComponent('taiga,toundra')}`,
      ),
    );
  });
});
