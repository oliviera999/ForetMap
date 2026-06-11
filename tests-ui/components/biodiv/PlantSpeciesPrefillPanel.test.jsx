import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));

import { PlantSpeciesPrefillPanel } from '../../../src/components/biodiv/PlantSpeciesPrefillPanel.jsx';

function setup(overrides = {}) {
  const props = {
    saving: false,
    form: { name: 'Pommier', scientific_name: 'Malus domestica' },
    setForm: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  };
  render(<PlantSpeciesPrefillPanel {...props} />);
  return props;
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('PlantSpeciesPrefillPanel', () => {
  test('rend les sources (toutes cochées par défaut) et le bouton de pré-saisie', () => {
    setup();
    expect(screen.getByText('Sources à interroger')).toBeInTheDocument();
    expect(screen.getByText('Wikipedia (FR)')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(10);
    // toutes les sources cochées + « écrasement » décoché
    const sourceBoxes = boxes.slice(0, boxes.length - 1);
    expect(sourceBoxes.every((c) => c.checked)).toBe(true);
    expect(screen.getByText('✨ Pré-saisir depuis sources externes')).toBeInTheDocument();
  });

  test('requête trop courte → toast, aucun appel api', () => {
    const { onToast } = setup({ form: { name: 'A', scientific_name: '' } });
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    expect(onToast).toHaveBeenCalledWith('Indique un nom (ou nom scientifique) avec au moins 2 caractères.');
    expect(api).not.toHaveBeenCalled();
  });

  test('pré-saisie → GET /api/plants/autofill avec q + indices, champs proposés affichés', async () => {
    api.mockReset();
    api.mockResolvedValueOnce({
      confidence: 0.8,
      fields: { habitat: 'Verger' },
      field_sources: { habitat: { source: 'wikipedia', confidence: 0.9 } },
      photos: [],
    });
    setup();
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const url = api.mock.calls[0][0];
    expect(url).toContain('/api/plants/autofill?');
    expect(url).toContain('q=Malus+domestica');
    expect(url).toContain('hint_scientific=Malus+domestica');
    expect(url).toContain('hint_name=Pommier');
    expect(await screen.findByText(/Pré-saisie proposée — confiance 80%/)).toBeInTheDocument();
    expect(screen.getByText('Habitat')).toBeInTheDocument();
    expect(screen.getByText('Verger')).toBeInTheDocument();
    expect(screen.getByText('🔎 wikipedia')).toBeInTheDocument();
  });

  test('« Appliquer la sélection » → setForm + toast ; champ vide prérempli est présélectionné', async () => {
    api.mockReset();
    api.mockResolvedValueOnce({ confidence: 0.5, fields: { habitat: 'Verger' }, photos: [] });
    const { setForm, onToast } = setup({ form: { name: 'Pommier', scientific_name: 'Malus', habitat: '' } });
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    await screen.findByText('Verger');
    fireEvent.click(screen.getByText('Appliquer la sélection'));
    expect(setForm).toHaveBeenCalledTimes(1);
    // l'updater applique applyPrefillToForm : habitat vide + champ sélectionné par défaut → écrit
    const updater = setForm.mock.calls[0][0];
    expect(updater({ habitat: '', sources: '' }).habitat).toBe('Verger');
    expect(onToast).toHaveBeenCalledWith('Pré-saisie appliquée au formulaire ✓');
  });

  test('erreur serveur → message « Pré-saisie indisponible »', async () => {
    api.mockReset();
    api.mockRejectedValueOnce(new Error('boom'));
    setup();
    fireEvent.click(screen.getByText('✨ Pré-saisir depuis sources externes'));
    expect(await screen.findByText(/Pré-saisie indisponible: boom/)).toBeInTheDocument();
  });
});
