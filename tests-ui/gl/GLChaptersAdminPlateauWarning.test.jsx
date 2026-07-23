import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

// Composants enfants lourds ou à effets réseau : remplacés par des stubs inertes
// afin d'isoler le comportement testé (bandeau d'avertissement plateau).
vi.mock('../../src/gl/components/GLChapterMapStudio.jsx', () => ({
  GLChapterMapStudio: () => <div data-testid="stub-map-studio" />,
}));
vi.mock('../../src/gl/components/GLFeuilletZonePlateauPanel.jsx', () => ({
  GLFeuilletZonePlateauPanel: () => <div data-testid="stub-feuillet-zone" />,
}));
vi.mock('../../src/gl/components/admin/GLChapterScenesAdminPanel.jsx', () => ({
  GLChapterScenesAdminPanel: () => <div data-testid="stub-scenes" />,
}));
vi.mock('../../src/gl/components/admin/GLChaptersImportExportPanel.jsx', () => ({
  GLChaptersImportExportPanel: () => <div data-testid="stub-import-export" />,
}));
vi.mock('../../src/gl/components/ui/GLRichTextEditor.jsx', () => ({
  GLRichTextEditor: () => <div data-testid="stub-rich-text" />,
}));
vi.mock('../../src/components/MediaLibraryMenu.jsx', () => ({
  MediaLibraryMenu: () => <div data-testid="stub-media-library" />,
}));
vi.mock('../../src/gl/components/GLImageFrameEditor.jsx', () => ({
  GLImageFrameEditor: () => <div data-testid="stub-frame-editor" />,
}));
vi.mock('../../src/gl/components/admin/chapters/GLChapterMapPreview.jsx', () => ({
  GLChapterMapPreview: () => <div data-testid="stub-map-preview" />,
}));

import { GLChaptersAdminView } from '../../src/gl/components/GLChaptersAdminView.jsx';

const WARNING_TESTID = 'gl-chapter-plateau-warning';

/**
 * Prépare le mock apiGL : liste d'un chapitre + détail dont le plateau est
 * piloté par l'appelant (null = sans plateau, 3 = avec plateau).
 */
function mockApiWithPlateau(plateauNumber) {
  apiGlMock.mockReset();
  apiGlMock.mockImplementation((path) => {
    if (path === '/api/gl/chapters') {
      return Promise.resolve([{ id: 1, slug: 'chap-un', title: 'Chapitre Un', biomes: [] }]);
    }
    if (path === '/api/gl/biomes') return Promise.resolve([]);
    if (path === '/api/gl/admin/spells/all') return Promise.resolve({ items: [] });
    if (path === '/api/gl/auth/config') return Promise.resolve({ brand: {}, modules: {} });
    if (path === '/api/gl/chapters/chap-un') {
      return Promise.resolve({
        chapter: {
          id: 1,
          slug: 'chap-un',
          title: 'Chapitre Un',
          plateau_number: plateauNumber,
          biomes: [],
          spells: [],
        },
        markers: [],
      });
    }
    return Promise.resolve(null);
  });
}

async function selectFirstChapter() {
  const button = await screen.findByRole('button', { name: /Chapitre Un/ });
  fireEvent.click(button);
}

describe('GLChaptersAdminView — avertissement plateau manquant', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  test("affiche l'avertissement quand le chapitre sélectionné n'a pas de plateau", async () => {
    mockApiWithPlateau(null);
    render(<GLChaptersAdminView />);
    await selectFirstChapter();
    await waitFor(() => {
      expect(screen.getByTestId(WARNING_TESTID)).toBeInTheDocument();
    });
    expect(screen.getByTestId(WARNING_TESTID).textContent).toMatch(/n'a pas de plateau/);
  });

  test("n'affiche pas l'avertissement quand un plateau est défini", async () => {
    mockApiWithPlateau(3);
    render(<GLChaptersAdminView />);
    await selectFirstChapter();
    // Le studio de carte (rendu uniquement après sélection) confirme que le
    // détail est bien chargé avant de vérifier l'absence du bandeau.
    await waitFor(() => {
      expect(screen.getByTestId('stub-map-studio')).toBeInTheDocument();
    });
    expect(screen.queryByTestId(WARNING_TESTID)).not.toBeInTheDocument();
  });
});
