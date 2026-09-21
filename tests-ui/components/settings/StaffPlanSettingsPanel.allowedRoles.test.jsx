import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StaffPlanSettingsPanel } from '../../../src/components/settings/StaffPlanSettingsPanel.jsx';

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(),
}));

vi.mock('../../../src/components/settings/CategoryIdsMultiSelect.jsx', () => ({
  CategoryIdsMultiSelect: () => null,
}));

describe('StaffPlanSettingsPanel — profils autorisés', () => {
  it('affiche les cases et enregistre la sélection', async () => {
    const saveSetting = vi.fn().mockResolvedValue(undefined);
    const get = (key, fallback) => {
      if (key === 'ui.staff_plan.allowed_role_slugs') return 'admin;personnel';
      if (key === 'ui.staff_plan.access_mode') return 'disabled';
      if (key === 'ui.staff_plan.code_role_slug') return 'personnel';
      return fallback ?? '';
    };

    render(<StaffPlanSettingsPanel get={get} saveSetting={saveSetting} canWrite={true} />);

    const panel = screen.getByTestId('staff-plan-allowed-role-slugs');
    expect(panel).toBeTruthy();

    const adminBox = screen.getByRole('checkbox', { name: /Administrateur/i });
    const personnelBox = screen.getByRole('checkbox', { name: /^Personnel$/i });
    expect(adminBox).toBeChecked();
    expect(personnelBox).toBeChecked();

    fireEvent.click(adminBox);
    await waitFor(() => {
      expect(saveSetting).toHaveBeenCalled();
    });
    const [, value] = saveSetting.mock.calls[0];
    expect(String(value)).toContain('personnel');
    expect(String(value)).not.toContain('admin');
  });
});
