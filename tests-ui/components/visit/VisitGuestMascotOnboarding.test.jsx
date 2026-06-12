import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitGuestMascotOnboarding } from '../../../src/components/visit/VisitGuestMascotOnboarding.jsx';

vi.mock('../../../src/components/VisitMapMascotRenderer.jsx', () => ({
  default: ({ mascotId }) => <span data-testid={`mascot-preview-${mascotId}`} />,
}));

const OPTIONS = [
  { id: 'renard', label: 'Renard' },
  { id: 'hibou', label: 'Hibou' },
];

function setup(overrides = {}) {
  const props = {
    requested: true,
    mascotId: 'renard',
    mascotOptions: OPTIONS,
    onChangeMascotId: vi.fn(),
    extraCatalogEntries: [],
    onDone: vi.fn(),
    ...overrides,
  };
  const utils = render(<VisitGuestMascotOnboarding {...props} />);
  return { props, ...utils };
}

describe('VisitGuestMascotOnboarding', () => {
  test('fermée tant que non demandée, resynchronisée quand requested change', () => {
    const { props, rerender } = setup({ requested: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<VisitGuestMascotOnboarding {...props} requested />);
    expect(screen.getByRole('dialog', { name: 'Choix de la mascotte' })).toBeTruthy();
  });

  test('options listées avec aperçu, choix actif pressé, clic → onChangeMascotId', () => {
    const { props } = setup();
    const active = screen.getByText('Renard').closest('button');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('mascot-preview-hibou')).toBeTruthy();
    fireEvent.click(screen.getByText('Hibou').closest('button'));
    expect(props.onChangeMascotId).toHaveBeenCalledWith('hibou');
  });

  test('« Commencer la visite » ferme la modale et notifie onDone', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Commencer la visite' }));
    expect(props.onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('sans option : bouton désactivé + message, onDone jamais appelé', () => {
    const { props } = setup({ mascotOptions: [] });
    const start = screen.getByRole('button', { name: 'Commencer la visite' });
    expect(start.disabled).toBe(true);
    expect(screen.getByText('Aucune mascotte disponible pour l’instant.')).toBeTruthy();
    fireEvent.click(start);
    expect(props.onDone).not.toHaveBeenCalled();
  });
});
