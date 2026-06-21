import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlantnetPredictionsList } from '../../../src/components/biodiv/PlantnetPredictionsList.jsx';

const PREDS = [
  { scientificName: 'Malus domestica', score: 0.873, commonNames: ['Apple', 'Néflier'] },
  { scientificNameWithoutAuthor: 'Prunus avium', score: 0.5, commonNames: [] },
];

describe('PlantnetPredictionsList', () => {
  test('aucune proposition → ne rend rien', () => {
    const { container } = render(<PlantnetPredictionsList predictions={[]} onApply={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('rend libellé + score % ; nom usuel FR (accent) affiché', () => {
    render(<PlantnetPredictionsList predictions={PREDS} onApply={() => {}} />);
    expect(screen.getByText('Malus domestica — 87.3 %')).toBeInTheDocument();
    expect(screen.getByText('Néflier')).toBeInTheDocument();
    expect(screen.getByText('Prunus avium — 50 %')).toBeInTheDocument();
  });

  test('score absent/non fini → pas de « % »', () => {
    render(
      <PlantnetPredictionsList
        predictions={[{ scientificName: 'Taxus', commonNames: [] }]}
        onApply={() => {}}
      />,
    );
    expect(screen.getByText('Taxus')).toBeInTheDocument();
  });

  test('clic « Utiliser pour le formulaire » → onApply(prediction)', () => {
    const onApply = vi.fn();
    render(<PlantnetPredictionsList predictions={PREDS} onApply={onApply} />);
    fireEvent.click(screen.getAllByText('Utiliser pour le formulaire')[0]);
    expect(onApply).toHaveBeenCalledWith(PREDS[0]);
  });

  test('applying → libellé « Import des photos… » ; disabled → boutons désactivés', () => {
    render(<PlantnetPredictionsList predictions={PREDS} applying disabled onApply={() => {}} />);
    const btns = screen.getAllByRole('button');
    expect(btns[0]).toBeDisabled();
    expect(screen.getAllByText('Import des photos…').length).toBe(2);
  });
});
