import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

/**
 * Profil endossé par un porteur du code du plan des personnels : le sélecteur ne propose que
 * la liste blanche du serveur (`personnel`, `visiteur`) — jamais un profil d'encadrement.
 */

vi.mock('../../../src/services/api', () => ({ api: vi.fn() }));
vi.mock('../../../src/components/settings/CategoryIdsMultiSelect.jsx', () => ({
  CategoryIdsMultiSelect: () => null,
}));

const { StaffPlanSettingsPanel } =
  await import('../../../src/components/settings/StaffPlanSettingsPanel.jsx');

function renderPanel(values = {}) {
  const saveSetting = vi.fn();
  const get = (key, fallback) => (key in values ? values[key] : (fallback ?? ''));
  render(<StaffPlanSettingsPanel get={get} saveSetting={saveSetting} canWrite />);
  return { saveSetting, select: screen.getByLabelText('Profil endossé par un porteur de code') };
}

describe('StaffPlanSettingsPanel — profil endossé par un porteur de code', () => {
  it('ne propose que « Personnel » et « Visiteur »', () => {
    const { select } = renderPanel({ 'ui.staff_plan.code_role_slug': 'personnel' });
    const values = within(select)
      .getAllByRole('option')
      .map((option) => option.value);
    expect(values).toEqual(['personnel', 'visiteur']);
  });

  it('enregistre le profil choisi', () => {
    const { select, saveSetting } = renderPanel({ 'ui.staff_plan.code_role_slug': 'personnel' });
    fireEvent.change(select, { target: { value: 'visiteur' } });
    expect(saveSetting).toHaveBeenCalledWith(
      'ui.staff_plan.code_role_slug',
      'visiteur',
      expect.any(String),
    );
  });

  it('une valeur hors liste s’affiche comme le repli du serveur (« Personnel »)', () => {
    const { select } = renderPanel({ 'ui.staff_plan.code_role_slug': 'admin' });
    expect(select.value).toBe('personnel');
  });
});
