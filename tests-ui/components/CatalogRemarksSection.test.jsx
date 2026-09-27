import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CatalogRemarksSection,
  plantRemarksText,
} from '../../src/components/map/LivingBeingsCatalogPanel.jsx';

// Remarques d'une fiche : un seul champ `remarks` (migration 305), repli sur les trois
// anciens champs pour une réponse de serveur antérieur.

describe('CatalogRemarksSection', () => {
  test('champ unique : un paragraphe par remarque (ligne vide)', () => {
    render(<CatalogRemarksSection plant={{ remarks: 'Première.\n\nSeconde.', remark_1: 'x' }} />);
    expect(screen.getByText('Remarques')).toBeInTheDocument();
    expect(screen.getByText('Première.')).toBeInTheDocument();
    expect(screen.getByText('Seconde.')).toBeInTheDocument();
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    // Plus de tiret pour une case vide : il n'y a plus de cases.
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  test('sans champ unique : les trois anciens champs, vides ignorés', () => {
    expect(plantRemarksText({ remark_1: 'A', remark_2: '  ', remark_3: 'C' })).toBe('A\n\nC');
    expect(plantRemarksText({ remarks: '' })).toBe(null);
    const { container } = render(<CatalogRemarksSection plant={{ remarks: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
