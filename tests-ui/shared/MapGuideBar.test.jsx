import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { MapGuideBar } from '../../src/shared/map-guide/MapGuideBar.jsx';

/**
 * Le comportement complet de la barre est couvert côté Plan (`tests-ui/plan/PlanGuideBar.test.jsx`,
 * sur l'enveloppe). Ici : ce que le partage ajoute — lecture d'un lieu au format Visite et
 * phrase d'indisponibilité propre à chaque carte.
 */
describe('MapGuideBar (socle partagé Visite / Plan)', () => {
  test('lit un lieu au format Visite sans configuration (emoji du nom, pas de doublon)', () => {
    render(
      <MapGuideBar
        place={{ kind: 'zone', id: 3, name: '🍏 Verger' }}
        onStop={() => {}}
        positionActive
      />,
    );
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label', 'Guidage vers Verger');
    expect(screen.getByText('Verger')).toBeTruthy();
  });

  test('la phrase d’indisponibilité est celle de la carte qui l’affiche', () => {
    render(
      <MapGuideBar
        place={{ kind: 'marker', id: 11, name: 'Compost' }}
        canLocate={false}
        onStop={() => {}}
        unavailableHint="Le lieu est mis en avant sur la carte ; la localisation n’est pas disponible ici."
      />,
    );
    expect(screen.getByText(/mis en avant sur la carte/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Me situer' })).toBe(null);
  });

  test('sans rouverture de fiche possible, le lieu visé n’est pas un bouton actif', () => {
    const onStop = vi.fn();
    render(
      <MapGuideBar
        place={{ kind: 'marker', id: 11, name: 'Compost' }}
        positionActive
        onStop={onStop}
      />,
    );
    expect(screen.getByRole('button', { name: /Compost/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
