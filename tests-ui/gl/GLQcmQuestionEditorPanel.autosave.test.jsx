import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLQcmQuestionEditorPanel } from '../../src/gl/components/admin/GLQcmQuestionEditorPanel.jsx';
import { GLQcmLoreQuestionEditorPanel } from '../../src/gl/components/admin/GLQcmLoreQuestionEditorPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function biomeQuestion(overrides = {}) {
  return {
    question_code: 'QF999',
    biome_slug: 'foret',
    categorie_slug: 'faune',
    numero_dans_categorie: 1,
    question: '',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: '',
    choix_d: '',
    choix_e: '',
    reponse_correcte: 'A',
    reponse_texte: '',
    niveau: 'base',
    difficulte: null,
    difficulte_label: '',
    notes_pedagogiques: '',
    tags: '',
    mots_cles: '',
    photo_url: '',
    photo_credit: '',
    photo_licence: '',
    photo_legende: '',
    statut: 'actif',
    feedback_correct: '',
    feedback_a: '',
    feedback_b: '',
    feedback_c: '',
    feedback_d: '',
    feedback_e: '',
    ...overrides,
  };
}

function loreQuestion(overrides = {}) {
  return {
    question_code: 'QL999',
    chapitre_slug: 'tous',
    categorie_slug: 'lore',
    numero_dans_categorie: 1,
    tier_lore: 'recit',
    question: '',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: '',
    choix_d: '',
    choix_e: '',
    reponse_correcte: 'A',
    reponse_texte: '',
    niveau: '',
    difficulte: null,
    difficulte_label: '',
    notes_pedagogiques: '',
    source_lore: '',
    tags: '',
    mots_cles: '',
    statut: 'actif',
    feedback_correct: '',
    feedback_a: '',
    feedback_b: '',
    feedback_c: '',
    feedback_d: '',
    feedback_e: '',
    ...overrides,
  };
}

beforeEach(() => {
  apiGlMock.mockReset();
});

describe('éditeurs QCM GL — autosave de création', () => {
  test('persiste une frappe saisie pendant le POST de création biomes', async () => {
    const postCreate = deferred();
    apiGlMock.mockImplementation(async (path, method, payload) => {
      if (path === '/api/gl/biomes') return [{ slug: 'foret', nom: 'Forêt' }];
      if (path === '/api/gl/qcm/categories') return [{ slug: 'faune', nom: 'Faune' }];
      if (path.startsWith('/api/gl/admin/qcm/questions?')) return { items: [] };
      if (path === '/api/gl/admin/qcm/questions/next-code') return { question_code: 'QF999' };
      if (path === '/api/gl/admin/qcm/questions' && method === 'POST') {
        return postCreate.promise;
      }
      if (path === '/api/gl/admin/qcm/questions/QF999' && method === 'PUT') {
        return { question: biomeQuestion(payload) };
      }
      return {};
    });

    render(<GLQcmQuestionEditorPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle question' }));
    await screen.findByDisplayValue('QF999');

    fireEvent.change(screen.getByLabelText(/^question$/i), {
      target: { value: 'Question initiale' },
    });

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/admin/qcm/questions',
        'POST',
        expect.objectContaining({ question: 'Question initiale' }),
      );
    });

    fireEvent.change(screen.getByLabelText(/^question$/i), {
      target: { value: 'Question initiale complétée' },
    });

    await act(async () => {
      postCreate.resolve({ question: biomeQuestion({ question: 'Question initiale' }) });
      await postCreate.promise;
    });

    expect(screen.getByDisplayValue('Question initiale complétée')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(apiGlMock).toHaveBeenCalledWith(
          '/api/gl/admin/qcm/questions/QF999',
          'PUT',
          expect.objectContaining({ question: 'Question initiale complétée' }),
        );
      },
      { timeout: 3000 },
    );
  });

  test('persiste une frappe saisie pendant le POST de création lore', async () => {
    const postCreate = deferred();
    apiGlMock.mockImplementation(async (path, method, payload) => {
      if (path === '/api/gl/lore/qcm/scopes') return [{ slug: 'tous', nom: 'Tous' }];
      if (path === '/api/gl/lore/qcm/categories') return [{ slug: 'lore', nom: 'Lore' }];
      if (path.startsWith('/api/gl/lore/admin/qcm/questions?')) return { items: [] };
      if (path === '/api/gl/lore/admin/qcm/questions/next-code') {
        return { question_code: 'QL999' };
      }
      if (path === '/api/gl/lore/admin/qcm/questions' && method === 'POST') {
        return postCreate.promise;
      }
      if (path === '/api/gl/lore/admin/qcm/questions/QL999' && method === 'PUT') {
        return { question: loreQuestion(payload) };
      }
      return {};
    });

    render(<GLQcmLoreQuestionEditorPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle question' }));
    await screen.findByDisplayValue('QL999');

    fireEvent.change(screen.getByLabelText(/^question$/i), {
      target: { value: 'Question lore initiale' },
    });

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/lore/admin/qcm/questions',
        'POST',
        expect.objectContaining({ question: 'Question lore initiale' }),
      );
    });

    fireEvent.change(screen.getByLabelText(/^question$/i), {
      target: { value: 'Question lore initiale complétée' },
    });

    await act(async () => {
      postCreate.resolve({ question: loreQuestion({ question: 'Question lore initiale' }) });
      await postCreate.promise;
    });

    expect(screen.getByDisplayValue('Question lore initiale complétée')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(apiGlMock).toHaveBeenCalledWith(
          '/api/gl/lore/admin/qcm/questions/QL999',
          'PUT',
          expect.objectContaining({ question: 'Question lore initiale complétée' }),
        );
      },
      { timeout: 3000 },
    );
  });
});
