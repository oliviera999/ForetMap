import { Suspense } from 'react';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  GLMorceauIndisponible,
  importerAvecReprise,
  lazyAvecReprise,
  REPRISES_DU_MORCEAU,
} from '../../src/gl/utils/lazyAvecReprise.jsx';

const sansAttendre = { attendre: () => Promise.resolve(), delaiMaxMs: 0 };

function Section() {
  return <p>section chargée</p>;
}

function monter(Composant) {
  return render(
    <Suspense fallback={<p>Chargement de la section…</p>}>
      <Composant />
    </Suspense>,
  );
}

describe('lazyAvecReprise — un morceau qui ne se charge pas (K8)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('un échec passager : nouvelle tentative, la section s’affiche', async () => {
    const charger = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: Section });
    monter(lazyAvecReprise(charger, sansAttendre));
    expect(await screen.findByText('section chargée')).toBeInTheDocument();
    expect(charger).toHaveBeenCalledTimes(2);
  });

  test('toutes les tentatives échouent : message de mise à jour et « Recharger », plus de « Chargement… »', async () => {
    const charger = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    monter(lazyAvecReprise(charger, sansAttendre));
    const message = await screen.findByTestId('gl-morceau-indisponible');
    expect(message).toHaveTextContent('L’application vient d’être mise à jour');
    expect(screen.queryByText('Chargement de la section…')).toBeNull();
    expect(charger).toHaveBeenCalledTimes(1 + REPRISES_DU_MORCEAU);
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeInTheDocument();
  });

  test('« Recharger » recharge la page', () => {
    const recharger = vi.fn();
    render(<GLMorceauIndisponible onRecharger={recharger} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  test('appareil hors ligne : la phrase parle du réseau, pas d’une mise à jour', () => {
    render(<GLMorceauIndisponible horsLigne />);
    const message = screen.getByTestId('gl-morceau-indisponible');
    expect(message).toHaveTextContent('Pas de réseau pour l’instant.');
    expect(message).not.toHaveTextContent('mise à jour');
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeInTheDocument();
  });

  test('un chargement qui pend est abandonné, puis retenté', async () => {
    const charger = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ default: Section });
    const module = await importerAvecReprise(charger, {
      attendre: () => Promise.resolve(),
      delaiMaxMs: 20,
    });
    expect(module.default).toBe(Section);
    expect(charger).toHaveBeenCalledTimes(2);
  });

  test('les pauses entre deux tentatives suivent la liste', async () => {
    const attendre = vi.fn().mockResolvedValue();
    const charger = vi.fn().mockRejectedValue(new Error('non'));
    await expect(
      importerAvecReprise(charger, { attendre, pauses: [10, 30], delaiMaxMs: 0 }),
    ).rejects.toThrow('non');
    expect(attendre.mock.calls.map((c) => c[0])).toEqual([10, 30]);
  });
});
