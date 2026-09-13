import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';

import { PlantRangeGauge } from '../../../src/components/pedago/PlantRangeGauge.jsx';

describe('PlantRangeGauge', () => {
  test('l’icône est un nœud React, pas une chaîne interpolée', () => {
    // L'icône était insérée dans un gabarit de chaîne : chaque fiche espèce affichait
    // « [object Object] pH optimal ».
    const { container } = render(
      <PlantRangeGauge
        label="pH optimal"
        min={6}
        max={8}
        domainMin={0}
        domainMax={14}
        icon={<svg data-testid="icone" />}
      />,
    );
    const label = container.querySelector('.pedago-range-gauge__label');
    expect(label.textContent).not.toContain('[object Object]');
    expect(label.textContent).toContain('pH optimal');
    expect(label.querySelector('svg')).not.toBeNull();
  });

  test('sans icône, seul le libellé est rendu', () => {
    const { container } = render(<PlantRangeGauge label="Température idéale" min={15} max={25} />);
    const label = container.querySelector('.pedago-range-gauge__label');
    expect(label.textContent.trim()).toBe('Température idéale');
  });

  test('bornes non numériques : rien n’est rendu', () => {
    const { container } = render(<PlantRangeGauge label="pH optimal" min={null} max={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
