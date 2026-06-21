import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitMapChrome } from '../../../src/components/visit/VisitMapChrome.jsx';

const MAPS_2 = [
  { id: 'foret', label: 'Forêt' },
  { id: 'potager', label: 'Potager' },
];
const MAPS_5 = [
  ...MAPS_2,
  { id: 'mare', label: 'Mare' },
  { id: 'verger', label: 'Verger' },
  { id: 'prairie', label: 'Prairie' },
];

function setup(overrides = {}) {
  const props = {
    title: '🧭 Visite de la carte',
    showPresentationButton: false,
    presentationInvitePulse: false,
    onOpenPresentation: vi.fn(),
    networkStatusLabel: null,
    isOnline: true,
    syncStatus: 'idle',
    pendingSyncCount: 0,
    visitImmersion: false,
    onToggleImmersion: vi.fn(),
    isTeacher: false,
    teacherPreviewAsStudent: false,
    onToggleTeacherPreview: vi.fn(),
    visitMascotId: 'renard',
    visitMascotOptions: [],
    onChangeVisitMascotId: vi.fn(),
    cartographyProgress: { total: 4, seenCount: 1, pct: 25 },
    helpPanelSlot: null,
    onBackToAuth: null,
    maps: MAPS_2,
    mapId: 'foret',
    onSelectMapId: vi.fn(),
    quickTipPrefix: 'Astuce :',
    quickTipText: null,
    ...overrides,
  };
  const utils = render(<VisitMapChrome {...props} />);
  return { props, ...utils };
}

describe('VisitMapChrome', () => {
  test('titre + donut de progression avec valeurs et libellé accessibles', () => {
    setup();
    expect(screen.getByText('🧭 Visite de la carte')).toBeTruthy();
    const donut = screen.getByTestId('visit-progress-donut');
    expect(donut.getAttribute('aria-valuenow')).toBe('25');
    expect(donut.getAttribute('title')).toBe('25 % — 1 / 4 vus');
  });

  test('bouton présentation : masqué par défaut, pulse piloté par prop, clic → onOpenPresentation', () => {
    const { props, rerender } = setup();
    expect(screen.queryByTestId('visit-presentation-link')).toBeNull();
    rerender(<VisitMapChrome {...props} showPresentationButton presentationInvitePulse />);
    const btn = screen.getByTestId('visit-presentation-link');
    expect(btn.getAttribute('data-invite-pulse')).toBe('1');
    fireEvent.click(btn);
    expect(props.onOpenPresentation).toHaveBeenCalledTimes(1);
  });

  test('statut réseau : rendu seulement avec un libellé, classes/data hors-ligne et en attente', () => {
    setup({
      networkStatusLabel: '2 actions en attente de sync.',
      isOnline: false,
      syncStatus: 'pending',
      pendingSyncCount: 2,
    });
    const status = screen.getByTestId('visit-network-status');
    expect(status.textContent).toBe('2 actions en attente de sync.');
    expect(status.className).toContain('visit-network-status--offline');
    expect(status.className).toContain('visit-network-status--pending');
    expect(status.getAttribute('data-pending')).toBe('2');
  });

  test('bascules : plein plan toujours, aperçu élève réservé au prof', () => {
    const { props } = setup({ isTeacher: false });
    expect(screen.queryByTestId('visit-teacher-preview-toggle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    expect(props.onToggleImmersion).toHaveBeenCalledTimes(1);

    const teacher = setup({ isTeacher: true, teacherPreviewAsStudent: true });
    const toggle = screen.getByTestId('visit-teacher-preview-toggle');
    expect(toggle.textContent).toBe('Retour édition prof');
    fireEvent.click(toggle);
    expect(teacher.props.onToggleTeacherPreview).toHaveBeenCalledTimes(1);
  });

  test('sélecteur de mascotte : visible avec options, change → onChangeVisitMascotId', () => {
    const { props } = setup({
      visitMascotOptions: [
        { id: 'renard', label: 'Renard' },
        { id: 'hibou', label: 'Hibou' },
      ],
    });
    const select = screen.getByLabelText('Choisir la mascotte affichée sur le plan');
    fireEvent.change(select, { target: { value: 'hibou' } });
    expect(props.onChangeVisitMascotId).toHaveBeenCalledWith('hibou');
  });

  test('sélecteur de carte : boutons jusqu’à 4 cartes, menu déroulant au-delà', () => {
    const few = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Potager' }));
    expect(few.props.onSelectMapId).toHaveBeenCalledWith('potager');
    few.unmount();

    const many = setup({ maps: MAPS_5 });
    const select = screen.getByLabelText('Sélection de carte visite');
    fireEvent.change(select, { target: { value: 'mare' } });
    expect(many.props.onSelectMapId).toHaveBeenCalledWith('mare');
  });

  test('sous le bandeau : message carte vide (variante multi-cartes), astuce et slot d’aide', () => {
    setup({
      cartographyProgress: { total: 0, seenCount: 0, pct: 0 },
      quickTipText: 'Coche ce que tu vois.',
      helpPanelSlot: <div data-testid="help-slot" />,
      onBackToAuth: vi.fn(),
    });
    expect(
      screen.getByText(
        'Aucune zone ni repère sur cette carte. Choisis une autre carte ci-dessus si besoin.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Coche ce que tu vois.', { exact: false })).toBeTruthy();
    expect(screen.getByTestId('help-slot')).toBeTruthy();
    expect(screen.getByRole('button', { name: '↩ Retour connexion' })).toBeTruthy();
    expect(screen.queryByTestId('visit-progress-donut')).toBeNull();
  });
});
