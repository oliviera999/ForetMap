import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { VisitMapChrome } from '../../../src/components/visit/VisitMapChrome.jsx';

const MASCOTS = [
  { id: 'gnome', label: 'Gnome des bois' },
  { id: 'spore', label: 'Spore' },
];

function setup(overrides = {}) {
  const props = {
    title: '🧭 Visite de la carte',
    onOpenPresentation: vi.fn(),
    onToggleImmersion: vi.fn(),
    onCycleMapTextSize: vi.fn(),
    onChangeVisitMascotId: vi.fn(),
    onSelectMapId: vi.fn(),
    maps: [],
    mapId: 'foret',
    ...overrides,
  };
  const utils = render(<VisitMapChrome {...props} />);
  return { ...utils, props };
}

describe('VisitMapChrome — état et rechargement', () => {
  test('un rechargement affiche une pastille discrète au lieu de masquer la carte', () => {
    setup({ refreshing: true });
    const pill = screen.getByTestId('visit-refresh-pill');
    expect(pill).toHaveTextContent('Actualisation');
    expect(pill).toHaveAttribute('role', 'status');
  });

  test('hors rechargement, aucune pastille', () => {
    setup();
    expect(screen.queryByTestId('visit-refresh-pill')).toBeNull();
  });
});

describe('VisitMapChrome — trois zones', () => {
  test('les commandes d’affichage forment un groupe nommé', () => {
    setup({ visitMascotOptions: MASCOTS, visitMascotId: 'gnome' });
    const group = screen.getByRole('group', { name: 'Affichage du plan' });
    // Plein écran, taille du texte et mascotte vivent ensemble, et rien d'autre.
    expect(within(group).getByTestId('visit-map-fullscreen-open')).toBeInTheDocument();
    expect(within(group).getByTestId('visit-map-text-size')).toBeInTheDocument();
    expect(within(group).getByTestId('visit-mascot-picker')).toBeInTheDocument();
    expect(within(group).queryByTestId('visit-progress-donut')).toBeNull();
    expect(within(group).queryByTestId('visit-teacher-preview-toggle')).toBeNull();
  });

  test('la progression accompagne le titre, hors du groupe de commandes', () => {
    const { container } = setup({ cartographyProgress: { total: 10, seenCount: 5, pct: 50 } });
    const titleLine = container.querySelector('.visit-map-card__chrome-title-line');
    expect(within(titleLine).getByTestId('visit-progress-donut')).toBeInTheDocument();
    const donut = screen.getByTestId('visit-progress-donut');
    expect(donut).toHaveAttribute('aria-valuenow', '50');
    // Un seul donut rendu (la migration en a laissé deux à un stade intermédiaire).
    expect(screen.getAllByTestId('visit-progress-donut')).toHaveLength(1);
  });

  test('aucune progression à afficher → pas de donut', () => {
    setup({ cartographyProgress: { total: 0, seenCount: 0, pct: 0 } });
    expect(screen.queryByTestId('visit-progress-donut')).toBeNull();
  });

  test('la bascule prof reste hors du groupe d’affichage', () => {
    setup({ isTeacher: true, onToggleTeacherPreview: vi.fn() });
    const group = screen.getByRole('group', { name: 'Affichage du plan' });
    const toggle = screen.getByTestId('visit-teacher-preview-toggle');
    expect(toggle).toBeInTheDocument();
    expect(group.contains(toggle)).toBe(false);
  });
});

describe('VisitMapChrome — commandes compactées', () => {
  test('le plein écran est en icône seule mais garde son nom accessible', () => {
    setup();
    const btn = screen.getByTestId('visit-map-fullscreen-open');
    expect(btn).toHaveClass('fm-map-fullscreen-open--compact');
    expect(btn).toHaveAccessibleName('Afficher la carte en plein écran');
    expect(btn).toHaveAttribute('title', 'Plein écran');
  });

  test('le plein écran actif annonce la sortie', () => {
    const { props } = setup({ visitImmersion: true });
    const btn = screen.getByTestId('visit-map-fullscreen-open');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveAccessibleName('Quitter le plein écran');
    fireEvent.click(btn);
    expect(props.onToggleImmersion).toHaveBeenCalledTimes(1);
  });

  test('le bouton taille de texte reprend son libellé visible dans son nom accessible', () => {
    setup({ mapTextSizeLabel: 'A+' });
    const btn = screen.getByTestId('visit-map-text-size');
    expect(btn).toHaveTextContent('A+');
    // WCAG 2.5.3 « Label in Name » : le nom accessible doit contenir le texte visible.
    expect(btn.getAttribute('aria-label')).toContain('A+');
  });

  test('le sélecteur de mascotte perd son libellé visible mais garde son nom accessible', () => {
    const { props } = setup({ visitMascotOptions: MASCOTS, visitMascotId: 'gnome' });
    const picker = screen.getByTestId('visit-mascot-picker');
    // Le mot « Mascotte » doublait la valeur affichée : il ne doit plus occuper de place.
    expect(picker).not.toHaveTextContent('Mascotte');
    const select = screen.getByLabelText('Choisir la mascotte affichée sur le plan');
    expect(select).toHaveValue('gnome');
    fireEvent.change(select, { target: { value: 'spore' } });
    expect(props.onChangeVisitMascotId).toHaveBeenCalledWith('spore');
  });

  test('sans mascotte disponible, le sélecteur disparaît du groupe', () => {
    setup({ visitMascotOptions: [] });
    expect(screen.queryByTestId('visit-mascot-picker')).toBeNull();
    expect(screen.getByRole('group', { name: 'Affichage du plan' })).toBeInTheDocument();
  });
});
