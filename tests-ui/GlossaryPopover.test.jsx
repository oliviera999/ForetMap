import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import {
  GlossaryPopover,
  clearGlossaryDetailCache,
  readGlossaryTermMessage,
} from '../src/components/pedago/GlossaryPopover.jsx';

// Le popover porte désormais le bouton « J'ai appris ce terme » et l'annonce du contrôle
// de compréhension : sans jeton, ni l'un ni l'autre ne se déclenche — c'est ce qu'on veut
// ici, ces tests portent sur la navigation entre fiches.
vi.mock('../src/services/api', () => ({
  api: vi.fn(),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { api } from '../src/services/api';

const TERM = {
  glossary_code: 'FM0001',
  terme: 'Écosystème',
  categorie: 'ecologie',
  niveau: 'base',
  definition_courte: 'Un milieu et les êtres vivants qui l’habitent.',
  definition_complete: 'Ensemble formé par une **communauté** vivante et son milieu.',
  exemple: 'La mare du lycée est un écosystème.',
  etymologie: 'Du grec oikos, la maison.',
  relatedTerms: [{ glossary_code: 'FM0002', terme: 'Humus' }],
  incomingRelations: [{ glossary_code: 'FM0003', terme: 'Biodiversité' }],
  linkedPlants: [{ id: 7, name: 'Ortie', emoji: '🌿' }],
  linkedTutorials: [{ id: 3, title: 'Composter au lycée', slug: 'compost' }],
  linkedQuizQuestions: [],
};

const RELATED = {
  glossary_code: 'FM0002',
  terme: 'Humus',
  categorie: 'sol',
  niveau: 'approfondissement',
  definition_courte: 'La couche sombre et fertile du sol.',
  relatedTerms: [],
  incomingRelations: [],
  linkedPlants: [],
  linkedTutorials: [],
  linkedQuizQuestions: [],
};

function renderPopover(props = {}) {
  return render(
    <GlossaryPopover
      open
      glossaryCode="FM0001"
      onClose={vi.fn()}
      onOpenFullGlossary={vi.fn()}
      {...props}
    />,
  );
}

describe('GlossaryPopover', () => {
  beforeEach(() => {
    clearGlossaryDetailCache();
    vi.mocked(api).mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('charge le terme demandé et affiche sa fiche', async () => {
    vi.mocked(api).mockResolvedValue(TERM);
    renderPopover();

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    expect(api).toHaveBeenCalledWith('/api/glossary/terms/FM0001');
    expect(screen.getByText(/Un milieu et les êtres vivants/i)).toBeInTheDocument();
    expect(screen.getByText(/Ensemble formé par une/i)).toBeInTheDocument();
    expect(screen.getByText(/La mare du lycée est un écosystème/i)).toBeInTheDocument();
    expect(screen.getByText(/Du grec oikos/i)).toBeInTheDocument();
    expect(screen.getByText('ecologie')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText(/Ortie/)).toBeInTheDocument();
    expect(screen.getByText('Composter au lycée')).toBeInTheDocument();
  });

  test('affiche un état de chargement avant la réponse', async () => {
    let resolve;
    vi.mocked(api).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPopover();

    expect(screen.getByText(/Chargement de la fiche/i)).toBeInTheDocument();
    resolve(TERM);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
  });

  test('affiche une erreur explicite si la fiche est introuvable', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Terme introuvable'));
    renderPopover();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Terme introuvable');
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('navigue vers un terme lié sans se fermer', async () => {
    vi.mocked(api).mockImplementation((url) =>
      Promise.resolve(String(url).includes('FM0002') ? RELATED : TERM),
    );
    const onClose = vi.fn();
    renderPopover({ onClose });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Humus' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Humus/i })).toBeInTheDocument();
    });
    expect(api).toHaveBeenCalledWith('/api/glossary/terms/FM0002');
    expect(onClose).not.toHaveBeenCalled();
  });

  test('les relations entrantes sont aussi navigables', async () => {
    vi.mocked(api).mockResolvedValue(TERM);
    renderPopover();

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Biodiversité' })).toBeInTheDocument();
  });

  test('ne recharge pas une fiche déjà vue (cache mémoire)', async () => {
    vi.mocked(api).mockImplementation((url) =>
      Promise.resolve(String(url).includes('FM0002') ? RELATED : TERM),
    );
    const { unmount } = renderPopover();
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    unmount();

    renderPopover();
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    expect(vi.mocked(api).mock.calls.filter(([url]) => url.includes('FM0001'))).toHaveLength(1);
  });

  test('se ferme avec Échap, après l’animation', async () => {
    vi.mocked(api).mockResolvedValue(TERM);
    const onClose = vi.fn();
    renderPopover({ onClose });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('se ferme au clic sur l’extérieur, pas au clic dans le panneau', async () => {
    vi.mocked(api).mockResolvedValue(TERM);
    const onClose = vi.fn();
    const { container } = renderPopover({ onClose });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('dialog'));
    await vi.advanceTimersByTimeAsync(200);
    expect(onClose).not.toHaveBeenCalled();

    const overlay = document.body.querySelector('.fm-glossary-popover');
    expect(overlay).toBeTruthy();
    expect(container).toBeTruthy();
    fireEvent.click(overlay);
    await vi.advanceTimersByTimeAsync(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('« Voir la fiche complète » ferme le popover et bascule sur l’onglet', async () => {
    vi.mocked(api).mockResolvedValue(TERM);
    const onClose = vi.fn();
    const onOpenFullGlossary = vi.fn();
    renderPopover({ onClose, onOpenFullGlossary });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Voir la fiche complète/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenFullGlossary).toHaveBeenCalledWith('FM0001');
  });

  test('« Voir la fiche complète » suit le terme visité dans le popover', async () => {
    vi.mocked(api).mockImplementation((url) =>
      Promise.resolve(String(url).includes('FM0002') ? RELATED : TERM),
    );
    const onOpenFullGlossary = vi.fn();
    renderPopover({ onOpenFullGlossary });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Humus' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Humus/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Voir la fiche complète/i }));
    expect(onOpenFullGlossary).toHaveBeenCalledWith('FM0002');
  });

  test('le lien vers l’onglet est masqué quand on y est déjà', async () => {
    vi.mocked(api).mockResolvedValue(TERM);
    renderPopover({ showFullGlossaryLink: false });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Voir la fiche complète/i })).toBeNull();
  });

  test('n’est pas rendu quand il est fermé', () => {
    render(<GlossaryPopover open={false} glossaryCode="FM0001" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});

describe('readGlossaryTermMessage — contrôle d’origine (audit A10)', () => {
  const ORIGIN = 'https://foretmap.example';

  test('accepte un message du glossaire venu de notre origine', () => {
    const event = { origin: ORIGIN, data: { type: 'foretmap:glossary', code: 'FM0001' } };
    expect(readGlossaryTermMessage(event, ORIGIN)).toBe('FM0001');
  });

  test('ignore un message venu d’une origine étrangère', () => {
    const event = {
      origin: 'https://site-tiers.example',
      data: { type: 'foretmap:glossary', code: 'FM0001' },
    };
    expect(readGlossaryTermMessage(event, ORIGIN)).toBeNull();
  });

  test('ignore une origine opaque (iframe sandbox « null »)', () => {
    const event = { origin: 'null', data: { type: 'foretmap:glossary', code: 'FM0001' } };
    expect(readGlossaryTermMessage(event, ORIGIN)).toBeNull();
  });

  test('ignore les messages d’un autre type ou sans code', () => {
    expect(
      readGlossaryTermMessage({ origin: ORIGIN, data: { type: 'autre', code: 'FM0001' } }, ORIGIN),
    ).toBeNull();
    expect(
      readGlossaryTermMessage({ origin: ORIGIN, data: { type: 'foretmap:glossary' } }, ORIGIN),
    ).toBeNull();
    expect(
      readGlossaryTermMessage({ origin: ORIGIN, data: 'foretmap:glossary' }, ORIGIN),
    ).toBeNull();
    expect(readGlossaryTermMessage(null, ORIGIN)).toBeNull();
  });
});
