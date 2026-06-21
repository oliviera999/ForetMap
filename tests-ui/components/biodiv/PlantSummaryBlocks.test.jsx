import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// MarkdownContent rend du HTML : on le réduit à un passe-plat texte pour isoler l'affichage.
vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

import {
  PlantSummaryBadges,
  PlantEcosystemHumanLead,
} from '../../../src/components/biodiv/PlantSummaryBlocks.jsx';

describe('PlantSummaryBadges', () => {
  test('nutrition + température + pH → 3 pastilles', () => {
    render(
      <PlantSummaryBadges
        plant={{
          nutrition: 'Autotrophe',
          temp_min_c: '18',
          temp_max_c: '18',
          ph_min: '6.5',
          ph_max: '6.5',
        }}
      />,
    );
    expect(screen.getByText('🍽️ Autotrophe')).toBeInTheDocument();
    expect(screen.getByText('🌡️ 18°C')).toBeInTheDocument();
    expect(screen.getByText('🧪 pH 6.5')).toBeInTheDocument();
  });
  test('entrée « végétal » → préfère preferred_nutrients à nutrition', () => {
    render(
      <PlantSummaryBadges
        plant={{ group_1: 'Végétal', nutrition: 'Autotrophe', preferred_nutrients: 'Azote' }}
      />,
    );
    expect(screen.getByText('🍽️ Azote')).toBeInTheDocument();
    expect(screen.queryByText('🍽️ Autotrophe')).not.toBeInTheDocument();
  });
  test('au plus 3 pastilles', () => {
    const { container } = render(
      <PlantSummaryBadges
        plant={{
          nutrition: 'x',
          temp_min_c: '1',
          temp_max_c: '1',
          ph_min: '2',
          ph_max: '2',
          preferred_nutrients: 'y',
        }}
      />,
    );
    expect(container.querySelectorAll('.plant-badge').length).toBeLessThanOrEqual(3);
  });
  test('aucune donnée → ne rend rien', () => {
    const { container } = render(<PlantSummaryBadges plant={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PlantEcosystemHumanLead', () => {
  test('rôle + utilité → les deux blocs', () => {
    render(
      <PlantEcosystemHumanLead
        plant={{ ecosystem_role: 'Fixe l’azote', human_utility: 'Comestible' }}
      />,
    );
    expect(screen.getByText("Rôle dans l'écosystème")).toBeInTheDocument();
    expect(screen.getByText('Fixe l’azote')).toBeInTheDocument();
    expect(screen.getByText("Utilité pour l'être humain")).toBeInTheDocument();
    expect(screen.getByText('Comestible')).toBeInTheDocument();
  });
  test('seulement le rôle → un seul bloc', () => {
    render(<PlantEcosystemHumanLead plant={{ ecosystem_role: 'Couvre-sol' }} />);
    expect(screen.getByText('Couvre-sol')).toBeInTheDocument();
    expect(screen.queryByText("Utilité pour l'être humain")).not.toBeInTheDocument();
  });
  test('ni rôle ni utilité (ou « - ») → ne rend rien', () => {
    const { container } = render(
      <PlantEcosystemHumanLead plant={{ ecosystem_role: '-', human_utility: '' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
