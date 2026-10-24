import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Durée du laissez-passer posé après la saisie du code (échéance signée côté serveur) :
 * réglable dans chacun des trois panneaux, bornée comme le registre (`lib/settings/plan.js`).
 */

vi.mock('../../../src/services/api', () => ({ api: vi.fn() }));
vi.mock('../../../src/components/settings/CategoryIdsMultiSelect.jsx', () => ({
  CategoryIdsMultiSelect: () => null,
}));

const { PlanSettingsPanel } =
  await import('../../../src/components/settings/PlanSettingsPanel.jsx');
const { StaffPlanSettingsPanel } =
  await import('../../../src/components/settings/StaffPlanSettingsPanel.jsx');
const { EnovPlanSettingsPanel } =
  await import('../../../src/components/settings/EnovPlanSettingsPanel.jsx');
const { KEYS_HANDLED_BY_PANEL } = await import('../../../src/constants/settingsAdminMeta.js');

describe.each([
  ['plan public', PlanSettingsPanel, 'security.plan_access_pass_days', 30, 90],
  ['plan des personnels', StaffPlanSettingsPanel, 'security.staff_plan_access_pass_days', 7, 30],
  ['plan e-nov', EnovPlanSettingsPanel, 'security.enov_plan_access_pass_days', 30, 90],
])('réglages du %s : durée du laissez-passer', (_label, Panel, key, defaultDays, maxDays) => {
  it('affiche la durée réglée (défaut compris) et l’enregistre en jours', () => {
    const saveSetting = vi.fn();
    render(<Panel get={(k, fallback) => fallback ?? ''} saveSetting={saveSetting} canWrite />);
    const input = screen.getByLabelText('Durée du laissez-passer (jours)');
    expect(input.value).toBe(String(defaultDays));
    expect(input.getAttribute('min')).toBe('1');
    expect(input.getAttribute('max')).toBe(String(maxDays));
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(saveSetting).toHaveBeenCalledWith(key, 3, expect.any(String));
  });

  it('n’apparaît pas en double dans la grille générique', () => {
    expect(KEYS_HANDLED_BY_PANEL.has(key)).toBe(true);
  });
});
