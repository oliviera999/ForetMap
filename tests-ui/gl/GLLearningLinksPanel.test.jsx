import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLLearningLinksPanel } from '../../src/gl/components/admin/GLLearningLinksPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const SETTINGS = {
  gating: {
    enabled: false,
    granularity: 'player',
    autoMarkOnCorrect: true,
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
    retryCooldownDays: 3,
  },
  resource_types: ['species', 'glossary', 'tutorial'],
  keys: [],
};

const LINK = {
  id: 7,
  question_dataset: 'qcm',
  resource_type: 'species',
  resource_ref: 'ESP001',
  question_code: 'QF001',
  is_gating: 1,
  status: 'approved',
  note: null,
};

describe('GLLearningLinksPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('liste les liens et affiche l’état global inactif', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/learning-links/settings') return SETTINGS;
      if (path.startsWith('/api/gl/learning-links')) return { links: [LINK] };
      throw new Error(`appel inattendu: ${path}`);
    });
    render(<GLLearningLinksPanel />);
    await waitFor(() => {
      expect(screen.getByText('QF001')).toBeInTheDocument();
    });
    expect(screen.getByText(/inactif/)).toBeInTheDocument();
    expect(screen.getByText(/ESP001/)).toBeInTheDocument();
  });

  test('crée un lien via le formulaire (POST puis rechargement)', async () => {
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (path === '/api/gl/learning-links/settings') return SETTINGS;
      if (path === '/api/gl/learning-links' && method === 'POST') {
        expect(body.resource_ref).toBe('ESP002');
        expect(body.question_code).toBe('QF002');
        expect(body.question_dataset).toBe('qcm');
        return { link: { ...LINK, id: 8, resource_ref: 'ESP002', question_code: 'QF002' } };
      }
      if (path.startsWith('/api/gl/learning-links')) return { links: [LINK] };
      throw new Error(`appel inattendu: ${path}`);
    });
    render(<GLLearningLinksPanel />);
    await waitFor(() => expect(screen.getByText('QF001')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('code espèce / terme / id tutoriel…'), {
      target: { value: 'ESP002' },
    });
    fireEvent.change(screen.getByPlaceholderText('QF001 / LQCM001…'), {
      target: { value: 'qf002' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le lien' }));

    await waitFor(() => {
      expect(screen.getByText('Lien enregistré.')).toBeInTheDocument();
    });
    expect(
      apiGlMock.mock.calls.some(
        ([path, method]) => path === '/api/gl/learning-links' && method === 'POST',
      ),
    ).toBe(true);
  });

  test('bascule le drapeau bloquant (PATCH is_gating)', async () => {
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (path === '/api/gl/learning-links/settings') return SETTINGS;
      if (path === '/api/gl/learning-links/7' && method === 'PATCH') {
        expect(body).toEqual({ is_gating: false });
        return { link: { ...LINK, is_gating: 0 } };
      }
      if (path.startsWith('/api/gl/learning-links')) return { links: [LINK] };
      throw new Error(`appel inattendu: ${path}`);
    });
    render(<GLLearningLinksPanel />);
    await waitFor(() => expect(screen.getByText('QF001')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bloquant' }));
    await waitFor(() => {
      expect(
        apiGlMock.mock.calls.some(
          ([path, method]) => path === '/api/gl/learning-links/7' && method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  test('supprime un lien (DELETE)', async () => {
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/learning-links/settings') return SETTINGS;
      if (path === '/api/gl/learning-links/7' && method === 'DELETE') return { success: true };
      if (path.startsWith('/api/gl/learning-links')) return { links: [LINK] };
      throw new Error(`appel inattendu: ${path}`);
    });
    render(<GLLearningLinksPanel />);
    await waitFor(() => expect(screen.getByText('QF001')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => {
      expect(screen.getByText('Lien supprimé.')).toBeInTheDocument();
    });
  });

  test('affiche l’erreur API (question introuvable)', async () => {
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/learning-links/settings') return SETTINGS;
      if (path === '/api/gl/learning-links' && method === 'POST') {
        throw new Error('Question introuvable');
      }
      if (path.startsWith('/api/gl/learning-links')) return { links: [] };
      throw new Error(`appel inattendu: ${path}`);
    });
    render(<GLLearningLinksPanel />);
    await waitFor(() =>
      expect(screen.getByText('Aucun lien pour ces filtres.')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByPlaceholderText('code espèce / terme / id tutoriel…'), {
      target: { value: 'ESP404' },
    });
    fireEvent.change(screen.getByPlaceholderText('QF001 / LQCM001…'), {
      target: { value: 'QF404' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le lien' }));
    await waitFor(() => {
      expect(screen.getByText('Question introuvable')).toBeInTheDocument();
    });
  });
});
