import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLFeuilletChapterMemberships } from '../../src/gl/components/admin/GLFeuilletChapterMemberships.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const NOTE =
  'Rattachement déduit du biome, du plateau ou du pays du feuillet. Modifiez ces champs pour changer le rattachement.';

describe('GLFeuilletChapterMemberships', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('feuillet rattaché à 2 chapitres : affiche leurs noms', async () => {
    apiGlMock.mockResolvedValue({
      items: [
        {
          feuilletCode: 'ep-01',
          chapters: [
            { id: 1, name: 'Chapitre 1' },
            { id: 2, name: 'Chapitre 2' },
          ],
        },
      ],
    });
    render(<GLFeuilletChapterMemberships feuilletCode="ep-01" />);

    expect(await screen.findByText('Chapitre 1')).toBeInTheDocument();
    expect(screen.getByText('Chapitre 2')).toBeInTheDocument();
    expect(screen.queryByText('Hors chapitre.')).not.toBeInTheDocument();
  });

  test('feuillet sans chapitre : affiche « Hors chapitre. »', async () => {
    apiGlMock.mockResolvedValue({
      items: [{ feuilletCode: 'ep-01', chapters: [] }],
    });
    render(<GLFeuilletChapterMemberships feuilletCode="ep-01" />);

    expect(await screen.findByText('Hors chapitre.')).toBeInTheDocument();
  });

  test('affiche toujours la note d’explication', async () => {
    apiGlMock.mockResolvedValue({
      items: [{ feuilletCode: 'ep-01', chapters: [{ id: 1, name: 'Chapitre 1' }] }],
    });
    render(<GLFeuilletChapterMemberships feuilletCode="ep-01" />);

    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });
});
