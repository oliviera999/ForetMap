// @vitest-environment jsdom
//
// A4 — consultation de la doc de référence ForetMap, en lecture seule.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { api } = await import('../../src/services/api');
const { ForetMapReferenceDocsPanel } =
  await import('../../src/components/help/ForetMapReferenceDocsPanel.jsx');

const SUMMARY = {
  docs: [
    { slug: 'presentation', title: 'Présentation', summary: 'Vue d’ensemble.' },
    { slug: 'carte-et-zones', title: 'La carte et les zones', summary: 'Plans et repères.' },
  ],
};

beforeEach(() => {
  api.mockReset();
});

describe('ForetMapReferenceDocsPanel', () => {
  it('affiche le sommaire dans l’ordre renvoyé par l’API', async () => {
    api.mockImplementation(async () => SUMMARY);
    render(<ForetMapReferenceDocsPanel />);

    await screen.findByText('Présentation');
    const titles = screen.getAllByRole('button').map((b) => b.textContent);
    expect(titles[0]).toContain('Présentation');
    expect(titles[1]).toContain('La carte et les zones');
    expect(screen.getByText('Vue d’ensemble.')).toBeInTheDocument();
  });

  it('ouvre un document et affiche son contenu Markdown', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/api/admin/reference-docs') return SUMMARY;
      return {
        doc: {
          slug: 'presentation',
          title: 'Présentation',
          bodyMarkdown: '# Titre\n\nCorps du document.',
        },
      };
    });
    render(<ForetMapReferenceDocsPanel />);

    fireEvent.click(await screen.findByText('Présentation'));

    await waitFor(() => expect(screen.getByText(/Corps du document/)).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith('/api/admin/reference-docs/presentation');
  });

  it('revient au sommaire depuis un document ouvert', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/api/admin/reference-docs') return SUMMARY;
      return { doc: { slug: 'presentation', title: 'Présentation', bodyMarkdown: 'Corps.' } };
    });
    render(<ForetMapReferenceDocsPanel />);

    fireEvent.click(await screen.findByText('Présentation'));
    fireEvent.click(await screen.findByText('← Retour au sommaire'));

    await waitFor(() => expect(screen.getByText('Plans et repères.')).toBeInTheDocument());
  });

  it('signale une documentation indisponible sans casser le rendu', async () => {
    api.mockImplementation(async () => {
      throw new Error('Documentation indisponible');
    });
    render(<ForetMapReferenceDocsPanel />);

    await waitFor(() => expect(screen.getByText(/Documentation indisponible/)).toBeInTheDocument());
  });

  it('n’expose aucune commande d’édition (lecture seule)', async () => {
    api.mockImplementation(async () => SUMMARY);
    render(<ForetMapReferenceDocsPanel />);
    await screen.findByText('Présentation');

    expect(screen.queryByRole('textbox')).toBeNull();
    for (const label of [/enregistrer/i, /modifier/i, /supprimer/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});
