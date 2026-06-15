import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesStatsExportRow } from '../../../src/components/profiles/ProfilesStatsExportRow.jsx';

function renderRow(overrides = {}) {
  const props = {
    canExport: true,
    onExport: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ProfilesStatsExportRow {...props} />) };
}

describe('ProfilesStatsExportRow', () => {
  test('rend la ligne d export avec son bouton', () => {
    const { container } = renderRow();
    expect(container.querySelector('.export-row')).toBeInTheDocument();
    expect(container.querySelector('button.btn.btn-secondary.btn-sm')).toBeInTheDocument();
  });

  test('canExport vrai → bouton actif, libellé sans mention PIN', () => {
    const { container } = renderRow({ canExport: true });
    const button = container.querySelector('button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('📥 Exporter CSV');
    expect(button).not.toHaveTextContent('(PIN requis)');
  });

  test('canExport faux → bouton désactivé, libellé « (PIN requis) »', () => {
    const { container } = renderRow({ canExport: false });
    const button = container.querySelector('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('📥 Exporter CSV (PIN requis)');
  });

  test('clic → déclenche onExport', () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByRole('button'));
    expect(props.onExport).toHaveBeenCalledTimes(1);
  });
});
