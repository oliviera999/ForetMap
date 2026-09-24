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

function renderMenu(props = {}, provider = { canTeacherPreview: true }) {
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
    fireEvent.click(within(panel).getByLabelText('Collège'));
    expect(screen.getByTestId('level-probe')).toHaveTextContent('college');
    const trigger = screen.getByRole('button', { name: 'Aperçu actif : Affichage Collège' });
    expect(trigger).toHaveClass('is-active');
  });

  test('vue gestion : l’option automatique s’appelle « Complet »', () => {
    renderMenu();
    const panel = openPanel();
    expect(within(panel).getByLabelText('Complet (vue gestion)')).toBeChecked();
  });

  test('vue n3beur simulée : l’option automatique suit la carte et le groupe', () => {
    renderMenu({ roleViewMode: 'student' }, { canTeacherPreview: true, fullViewByDefault: false });
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
