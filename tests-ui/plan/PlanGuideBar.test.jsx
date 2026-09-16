import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PlanGuideBar } from '../../src/plan/components/PlanGuideBar.jsx';

const place = { id: 'z-cdi', kind: 'zone', name: '📚 CDI', emoji: '📚' };

describe('PlanGuideBar', () => {
  test('sans lieu visé, rien n’est rendu', () => {
    const { container } = render(<PlanGuideBar place={null} onStop={() => {}} />);
    expect(container.firstChild).toBe(null);
  });

  test('annonce le lieu visé et sa distance, et n’arrête le guidage que sur « Arrêter »', () => {
    const onStop = vi.fn();
    const onOpenPlace = vi.fn();
    render(
      <PlanGuideBar
        place={place}
        distanceLabel="120 m"
        positionActive
        canLocate
        onStop={onStop}
        onOpenPlace={onOpenPlace}
      />,
    );

    expect(screen.getByText('CDI')).toBeTruthy();
    expect(screen.getByText(/120 m à vol d’oiseau/)).toBeTruthy();
    // Position acquise : pas de rappel « Me situer ».
    expect(screen.queryByRole('button', { name: 'Me situer' })).toBe(null);

    fireEvent.click(screen.getByRole('button', { name: /CDI/ }));
    expect(onOpenPlace).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('position pas encore acquise : la barre propose de l’activer', () => {
    const onLocate = vi.fn();
    render(<PlanGuideBar place={place} canLocate onStop={() => {}} onLocate={onLocate} />);

    expect(screen.getByText(/direction en attente de votre position/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Me situer' }));
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  test('plan non calé : la barre le dit au lieu de proposer une localisation impossible', () => {
    render(<PlanGuideBar place={place} canLocate={false} onStop={() => {}} />);
    expect(screen.getByText(/la localisation n’est pas disponible ici/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Me situer' })).toBe(null);
  });
});
