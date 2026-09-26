// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Bandeau du gestionnaire d'un module pédagogique éteint pour les élèves (décision du 25/09
 * révisée) : la vue reste ouverte au prof, qui doit savoir que rien n'est visible côté élève.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
}));

const { ModuleLearnerOffBanner } =
  await import('../../../src/components/pedago/ModuleLearnerOffBanner.jsx');
const { IdKeysView } = await import('../../../src/components/pedago/IdKeysView.jsx');
const { IndividualsView } = await import('../../../src/components/pedago/IndividualsView.jsx');

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ items: [] });
});

describe('ModuleLearnerOffBanner', () => {
  it('nomme le module, rassure sur la préparation et dit où le rallumer', () => {
    render(<ModuleLearnerOffBanner moduleLabel="Clés d’identification" />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain(
      'Clés d’identification — module désactivé pour les élèves',
    );
    expect(banner.textContent).toContain('Vous pouvez continuer à préparer');
    expect(banner.textContent).toContain('rien n’est visible côté élève');
    expect(banner.textContent).toContain('Paramètres → Accueil & modules');
  });

  it('accepte un détail propre au module (récompenses)', () => {
    render(
      <ModuleLearnerOffBanner moduleLabel="Récompenses" detail="Badges comptés en silence." />,
    );
    expect(screen.getByRole('status').textContent).toContain('Badges comptés en silence.');
  });
});

describe('vues pédagogiques : bandeau selon `moduleOffForLearners`', () => {
  it('clés d’identification', async () => {
    const { unmount } = render(<IdKeysView canManage moduleOffForLearners />);
    expect(await screen.findByTestId('pedago-module-off-banner')).toBeTruthy();
    unmount();
    render(<IdKeysView canManage />);
    expect(screen.queryByTestId('pedago-module-off-banner')).toBeNull();
  });

  it('individus suivis', async () => {
    const { unmount } = render(<IndividualsView canManage moduleOffForLearners />);
    expect((await screen.findByTestId('pedago-module-off-banner')).textContent).toContain(
      'Individus suivis',
    );
    unmount();
    render(<IndividualsView canManage />);
    expect(screen.queryByTestId('pedago-module-off-banner')).toBeNull();
  });
});
