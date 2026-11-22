import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AppPreviewMenu } from '../../../src/components/app/AppPreviewMenu.jsx';
import {
  BiodivPedagoProvider,
  useBiodivPedago,
} from '../../../src/contexts/BiodivPedagoContext.jsx';
import { getRoleTerms } from '../../../src/utils/n3-terminology.js';

const baseProps = {
  roleViewMode: 'native',
  canSwitchToStudentView: true,
  canSwitchToTeacherView: false,
  onRoleViewModeSelect: () => {},
  roleTerms: getRoleTerms(),
  helpText: () => 'aide',
};

function LevelProbe() {
  const { level } = useBiodivPedago();
  return <output data-testid="level-probe">{level}</output>;
}

// Compte non élève qui a choisi « Complet (vue gestion) » dans son profil : l'ancienne vue
// complète d'office n'existe plus (demande du 22/11/2026).
const STAFF_COMPLET = { canTeacherPreview: true, staff: true, contentLevel: 'complet' };

function renderMenu(props = {}, provider = STAFF_COMPLET) {
  return render(
    <BiodivPedagoProvider {...provider}>
      <AppPreviewMenu {...baseProps} {...props} />
      <LevelProbe />
    </BiodivPedagoProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /^Aperçu/ }));
  return screen.getByTestId('app-preview-panel');
}

describe('AppPreviewMenu — menu Aperçu de l’en-tête', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('rien n’est rendu sans aucune option d’aperçu ouverte au compte', () => {
    const { container } = render(<AppPreviewMenu {...baseProps} canSwitchToStudentView={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('un seul bouton, fermé par défaut, qui ouvre les deux groupes', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Aperçu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const panel = openPanel();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByRole('group', { name: 'Interface' })).toBeInTheDocument();
    expect(
      within(panel).getByRole('group', { name: 'Affichage biodiversité' }),
    ).toBeInTheDocument();
    expect(within(panel).queryByLabelText('Vue n3boss')).toBeNull();
  });

  test('choisir la vue n3beur passe par le callback de rôle', () => {
    const onRoleViewModeSelect = vi.fn();
    renderMenu({ onRoleViewModeSelect });
    const panel = openPanel();
    fireEvent.click(within(panel).getByLabelText('Vue n3beur'));
    expect(onRoleViewModeSelect).toHaveBeenCalledWith('student');
  });

  test('choisir un niveau change le niveau effectif et signale l’aperçu sur le bouton', () => {
    renderMenu();
    expect(screen.getByTestId('level-probe')).toHaveTextContent('universite');
    const panel = openPanel();
    fireEvent.click(within(panel).getByLabelText('Collège · 6e (cycle 3)'));
    expect(screen.getByTestId('level-probe')).toHaveTextContent('college');
    const trigger = screen.getByRole('button', {
      name: 'Aperçu actif : Affichage Collège · 6e (cycle 3)',
    });
    expect(trigger).toHaveClass('is-active');
    expect(sessionStorage.getItem('foretmap.biodivPedagoPreview')).toBe('cycle3');
  });

  test('aperçu : 6e, 3e et lycée, sans entrée Université', () => {
    renderMenu();
    const panel = openPanel();
    const group = within(panel).getByRole('group', { name: 'Affichage biodiversité' });
    const labels = within(group)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label').textContent);
    expect(labels).toEqual([
      'Mon niveau : Complet (vue gestion)',
      'Collège · 6e (cycle 3)',
      'Collège · 3e (cycle 4)',
      'Lycée',
    ]);
    fireEvent.click(within(panel).getByLabelText('Collège · 3e (cycle 4)'));
    expect(screen.getByTestId('level-probe')).toHaveTextContent('college');
  });

  test('choix « Complet » du profil : l’option sans aperçu le rappelle', () => {
    renderMenu();
    const panel = openPanel();
    expect(within(panel).getByLabelText('Mon niveau : Complet (vue gestion)')).toBeChecked();
  });

  test('sans choix ni groupe : l’option sans aperçu annonce le cycle 3 par défaut', () => {
    renderMenu({}, { canTeacherPreview: true, staff: true });
    expect(screen.getByTestId('level-probe')).toHaveTextContent('college');
    const panel = openPanel();
    expect(
      within(panel).getByLabelText('Mon niveau : Cycle 3 (CM1–6e) — par défaut'),
    ).toBeChecked();
  });

  test('« Quitter l’aperçu » ramène au niveau du profil, plus à la vue complète d’office', () => {
    sessionStorage.setItem('foretmap.biodivPedagoPreview', 'lycee');
    renderMenu({}, { canTeacherPreview: true, staff: true, contentLevel: 'cycle4' });
    expect(screen.getByTestId('level-probe')).toHaveTextContent('lycee');
    const panel = openPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Quitter l’aperçu' }));
    expect(screen.getByTestId('level-probe')).toHaveTextContent('college');
    expect(within(panel).getByLabelText('Mon niveau : Cycle 4 (5e–3e) — mon choix')).toBeChecked();
  });

  test('vue n3beur simulée : l’option automatique suit la carte et le groupe', () => {
    renderMenu({ roleViewMode: 'student' }, { canTeacherPreview: true, staff: false });
    expect(screen.getByTestId('level-probe')).toHaveTextContent('college');
    const panel = openPanel();
    expect(within(panel).getByLabelText('Automatique (carte et groupe)')).toBeChecked();
  });

  test('« Quitter l’aperçu » remet tout à zéro', () => {
    sessionStorage.setItem('foretmap.biodivPedagoPreview', 'lycee');
    const onRoleViewModeSelect = vi.fn();
    renderMenu({ roleViewMode: 'student', onRoleViewModeSelect });
    const panel = openPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Quitter l’aperçu' }));
    expect(onRoleViewModeSelect).toHaveBeenCalledWith('native');
    expect(sessionStorage.getItem('foretmap.biodivPedagoPreview')).toBeNull();
  });

  test('Échap ferme le panneau', () => {
    renderMenu();
    openPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('app-preview-panel')).toBeNull();
  });
});
