import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserJournalImportCard } from '../../../src/components/journal/UserJournalImportCard.jsx';

const baseItem = {
  id: 42,
  resourceType: 'plant',
  resourceRef: 'noisetier',
  title: 'Noisetier',
  createdAt: '2026-05-02T10:00:00Z',
  pinned: false,
};

/** Miroir ForetMap du test G&L : même carte partagée, métadonnées et thème du produit. */
describe('UserJournalImportCard — carte d’import partagée, habillage ForetMap', () => {
  test('« Voir » navigue vers l’onglet biodiversité avec la fiche ciblée', () => {
    const onNavigateTab = vi.fn();
    render(<UserJournalImportCard item={baseItem} onNavigateTab={onNavigateTab} />);
    fireEvent.click(screen.getByRole('button', { name: /Voir « Noisetier »/ }));
    expect(onNavigateTab).toHaveBeenCalledWith({
      tab: 'plants',
      focusType: 'plant',
      focusRef: 'noisetier',
    });
    expect(screen.getByText('Espèce')).toBeInTheDocument();
  });

  test('épingler : bouton étiqueté et appel onTogglePin(id, true)', () => {
    const onTogglePin = vi.fn();
    render(<UserJournalImportCard item={baseItem} onTogglePin={onTogglePin} />);
    const pin = screen.getByRole('button', { name: 'Épingler « Noisetier »' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);
    expect(onTogglePin).toHaveBeenCalledWith(42, true);
  });

  test('déjà épinglé : état pressé + désépinglage', () => {
    const onTogglePin = vi.fn();
    render(
      <UserJournalImportCard item={{ ...baseItem, pinned: true }} onTogglePin={onTogglePin} />,
    );
    const pin = screen.getByRole('button', { name: 'Désépingler « Noisetier »' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pin);
    expect(onTogglePin).toHaveBeenCalledWith(42, false);
  });

  test('lecture seule (professeur) : ni épingler ni retirer, thème ForetMap conservé', () => {
    const { container } = render(
      <UserJournalImportCard item={baseItem} onNavigateTab={vi.fn()} readOnly />,
    );
    expect(screen.queryByRole('button', { name: /Épingler/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
    expect(container.querySelector('article.card.fm-journal__import')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Voir/ }).className).toContain('btn-secondary');
  });

  test('type inconnu : libellé de repli, pas de bouton « Voir »', () => {
    render(
      <UserJournalImportCard
        item={{ ...baseItem, resourceType: 'mystere', title: '' }}
        onNavigateTab={vi.fn()}
      />,
    );
    expect(screen.getByText('Ressource')).toBeInTheDocument();
    expect(screen.getByText('mystere · noisetier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir/ })).not.toBeInTheDocument();
  });
});
