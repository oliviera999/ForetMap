import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLSpellsEditorPanel } from '../../src/gl/components/admin/GLSpellsEditorPanel.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLSpellsEditorPanel', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.mocked(apiGL).mockImplementation((url) => {
      if (url === '/api/gl/spell-categories') {
        return Promise.resolve([{ slug: 'vie', nom: 'Vie' }]);
      }
      if (String(url).includes('/api/gl/admin/spells?')) {
        return Promise.resolve({
          category: { slug: 'vie', nom: 'Vie' },
          items: [{ spell_code: 'SL001', nom: 'Test', emoji: '✨', statut: 'officiel' }],
        });
      }
      return Promise.resolve({});
    });
  });

  test('affiche le panneau et la liste des sorts', async () => {
    render(<GLSpellsEditorPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Saisie manuelle — sortilèges/i)).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
