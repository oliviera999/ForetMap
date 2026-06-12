import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));

import { PlantPrefillPanel } from '../../../src/components/biodiv/PlantPrefillPanel.jsx';

function setup(overrides = {}) {
  const props = {
    form: { name: 'Tomate', scientific_name: '', habitat: '', sources: '' },
    setForm: vi.fn(),
    saving: false,
    onToast: vi.fn(),
    ...overrides,
  };
  render(<PlantPrefillPanel {...props} />);
  return props;
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('PlantPrefillPanel', () => {
  test('rend le panneau « Sources à interroger » avec toutes les sources cochées par défaut', () => {
    setup();
    expect(screen.getByText('Sources à interroger')).toBeInTheDocument();
    expect(screen.getByText('Wikipedia (FR)')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    // 11 sources + la case « écrasement » = 12 checkboxes, sources toutes cochées
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(12);
    expect(boxes.filter((b) => b.checked)).toHaveLength(11);
  });

  test('requête trop courte → toast, aucun appel serveur', () => {
    const { onToast } = setup({ form: { name: 'T', scientific_name: '' } });
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    expect(onToast).toHaveBeenCalledWith('Indique un nom (ou nom scientifique) avec au moins 2 caractères.');
    expect(api).not.toHaveBeenCalled();
  });

  test('pré-saisie → GET /api/plants/autofill avec q + hint_name, champs proposés affichés', async () => {
    api.mockResolvedValueOnce({
      confidence: 0.8,
      fields: { habitat: 'Potager ensoleillé' },
      field_sources: { habitat: { source: 'wikipedia', confidence: 0.9 } },
      photos: [],
    });
    setup();
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/autofill?q=Tomate&hint_name=Tomate');
    });
    expect(await screen.findByText(/Pré-saisie proposée — confiance 80%/)).toBeInTheDocument();
    expect(screen.getByText('Potager ensoleillé')).toBeInTheDocument();
    expect(screen.getByText('🔎 wikipedia')).toBeInTheDocument();
  });

  test('sources décochées partiellement → paramètre sources=… dans la requête', async () => {
    setup();
    // décoche OpenAI (label cliquable)
    fireEvent.click(screen.getByText('OpenAI'));
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    await waitFor(() => expect(api).toHaveBeenCalled());
    const url = api.mock.calls[0][0];
    expect(url).toContain('sources=');
    expect(url).not.toContain('openai');
  });

  test('« Appliquer la sélection » écrit le champ coché via setForm et notifie', async () => {
    api.mockResolvedValueOnce({
      confidence: 0.5,
      fields: { habitat: 'Potager' },
      photos: [],
    });
    const { setForm, onToast } = setup();
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    await screen.findByText('Appliquer la sélection');
    fireEvent.click(screen.getByText('Appliquer la sélection'));
    expect(setForm).toHaveBeenCalledTimes(1);
    const updater = setForm.mock.calls[0][0];
    expect(updater({ name: 'Tomate', habitat: '', sources: '' })).toMatchObject({ habitat: 'Potager' });
    expect(onToast).toHaveBeenCalledWith('Pré-saisie appliquée au formulaire ✓');
  });

  test('photos proposées : carte avec case décochée + menu « Associer au champ » désactivé', async () => {
    api.mockResolvedValueOnce({
      confidence: 0.5,
      fields: {},
      photos: [{ field: 'photo_leaf', url: 'https://example.org/a.jpg', credit: 'Alice', license: 'CC-BY' }],
    });
    setup();
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    await screen.findByText(/Photos proposées/);
    const check = document.querySelector('.plant-prefill-photo-check');
    expect(check.checked).toBe(false);
    const assign = document.querySelector('.plant-prefill-photo-assign');
    expect(assign.disabled).toBe(true);
    expect(assign.value).toBe('photo_leaf');
    fireEvent.click(check);
    expect(document.querySelector('.plant-prefill-photo-assign').disabled).toBe(false);
    expect(screen.getByText(/Crédit : Alice · Licence : CC-BY/)).toBeInTheDocument();
  });

  test('erreur serveur → message « Pré-saisie indisponible »', async () => {
    api.mockRejectedValueOnce(new Error('autofill HS'));
    setup();
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    expect(await screen.findByText(/Pré-saisie indisponible: autofill HS/)).toBeInTheDocument();
  });
});
