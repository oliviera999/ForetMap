import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportPanel, importTemplateButtonKey } from '../src/shared/components/ImportPanel.jsx';

/**
 * Audit ForetMap du 19/11/2026, lot 11 — F6 : boutons « Modèle CSV / XLSX » à libellé JSX,
 * tous sous la clé React `[object Object]` (avertissement console, bouton omis ou doublé).
 */
describe('ImportPanel — F6 (clés des boutons modèle)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('deux libellés JSX : pas d’avertissement de clé dupliquée, deux boutons rendus', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ImportPanel
        title="Import"
        templateButtons={[
          {
            label: (
              <>
                Modèle <strong>CSV</strong>
              </>
            ),
            onClick: vi.fn(),
          },
          {
            label: (
              <>
                Modèle <strong>XLSX</strong>
              </>
            ),
            onClick: vi.fn(),
          },
        ]}
        onImport={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole('button', { name: 'Modèle CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modèle XLSX' })).toBeTruthy();
    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('same key')),
    );
    expect(keyWarnings).toEqual([]);
  });

  test('importTemplateButtonKey : clé explicite, libellé textuel, libellé JSX', () => {
    expect(importTemplateButtonKey({ key: 'csv', label: <b>x</b> }, 0)).toBe('k:csv');
    expect(importTemplateButtonKey({ label: 'Modèle CSV' }, 1)).toBe('l:1:Modèle CSV');
    const a = importTemplateButtonKey({ label: <b>CSV</b> }, 0);
    const b = importTemplateButtonKey({ label: <b>XLSX</b> }, 1);
    expect(a).not.toBe(b);
    expect(a).not.toContain('[object Object]');
  });
});
