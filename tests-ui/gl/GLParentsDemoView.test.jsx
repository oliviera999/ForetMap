import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';
import { GLParentsDemoView } from '../../src/gl/components/parents/GLParentsDemoView.jsx';

function mockQuizApi() {
  apiGL.mockImplementation(async (path, method) => {
    if (path.startsWith('/api/gl/qcm/draw')) return { question_code: 'Q-DEMO-1' };
    if (path.endsWith('/present')) {
      return {
        presentationToken: 'tok-1',
        question: 'Quel animal disperse les graines de la mangue sauvage ?',
        choices: [
          { id: 'a', text: 'L’éléphant de forêt' },
          { id: 'b', text: 'Le crocodile' },
        ],
      };
    }
    if (path.endsWith('/answer') && method === 'POST') {
      return { correct: true, feedback: 'Il en raffole et sème ses graines.' };
    }
    throw new Error(`appel inattendu : ${method} ${path}`);
  });
}

describe('GLParentsDemoView', () => {
  beforeEach(() => {
    apiGL.mockReset();
    mockQuizApi();
  });

  test('cinq étapes, trois boutons de navigation, ancres de visite', async () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <GLParentsDemoView onNavigate={onNavigate} biomeSlugs={['tropiques']} />,
    );
    expect(screen.getByText('Visite pour les parents')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /en cinq minutes/ })).toBeInTheDocument();
    for (const anchor of ['parents-chemin', 'parents-quiz', 'parents-apprentissages']) {
      expect(container.querySelector(`[data-gl-tour="${anchor}"]`)).not.toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Lire l’introduction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Essayer le plateau' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir une fiche' }));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(['world', 'discovery', 'ecosystemes']);
    expect(screen.getByRole('link', { name: '« Vos données »' })).toHaveAttribute(
      'href',
      expect.stringContaining('/confidentialite'),
    );
    await screen.findByText(/Quel animal disperse/);
  });

  test('quiz d’essai : tirage, réponse, retour — sans partie ni score', async () => {
    render(<GLParentsDemoView onNavigate={() => {}} biomeSlugs={['tropiques', 'savane']} />);
    await screen.findByText(/Quel animal disperse/);
    expect(apiGL).toHaveBeenCalledWith('/api/gl/qcm/draw?biomeSlugs=tropiques%2Csavane');
    expect(apiGL).toHaveBeenCalledWith('/api/gl/qcm/questions/Q-DEMO-1/present');

    const submit = screen.getByRole('button', { name: 'Valider ma réponse' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText('L’éléphant de forêt'));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await screen.findByText('Bonne réponse.');
    expect(screen.getByText('Il en raffole et sème ses graines.')).toBeInTheDocument();
    expect(apiGL).toHaveBeenCalledWith('/api/gl/qcm/questions/Q-DEMO-1/answer', 'POST', {
      presentationToken: 'tok-1',
      choiceId: 'a',
    });
    // Aucun appel à une route de partie : le quiz d'essai ne compte pour personne.
    expect(apiGL.mock.calls.some((c) => String(c[0]).includes('/api/gl/games/'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Une autre question' }));
    await waitFor(() => {
      expect(
        apiGL.mock.calls.filter((c) => String(c[0]).startsWith('/api/gl/qcm/draw')).length,
      ).toBe(2);
    });
  });

  test('sans biome de chapitre, le quiz se rabat sur tout le catalogue de biomes', async () => {
    apiGL.mockImplementation(async (path, method) => {
      if (path === '/api/gl/biomes') return [{ slug: 'savane' }, { slug: 'taiga' }];
      if (path.startsWith('/api/gl/qcm/draw')) return { question_code: 'Q-DEMO-2' };
      if (path.endsWith('/present')) {
        return { presentationToken: 'tok-2', question: 'Question de repli ?', choices: [] };
      }
      throw new Error(`appel inattendu : ${method} ${path}`);
    });
    render(<GLParentsDemoView onNavigate={() => {}} biomeSlugs={[]} />);
    expect(screen.getByText(/la question arrive/)).toBeInTheDocument();
    await screen.findByText('Question de repli ?');
    expect(apiGL).toHaveBeenCalledWith('/api/gl/qcm/draw?biomeSlugs=savane%2Ctaiga');
  });

  test('catalogue de biomes vide : message explicite, aucun tirage', async () => {
    apiGL.mockImplementation(async (path) => {
      if (path === '/api/gl/biomes') return [];
      throw new Error(`appel inattendu : ${path}`);
    });
    render(<GLParentsDemoView onNavigate={() => {}} biomeSlugs={[]} />);
    await screen.findByText(/Aucune question n’est disponible/);
    expect(apiGL.mock.calls.some((c) => String(c[0]).startsWith('/api/gl/qcm/draw'))).toBe(false);
  });
});
