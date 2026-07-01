import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLPlayerJournalImportCard } from '../../src/gl/components/GLPlayerJournalImportCard.jsx';

const baseItem = {
  id: 42,
  resourceType: 'glossary',
  resourceRef: 'GL1',
  title: 'Photosynthèse',
  createdAt: '2026-05-02T10:00:00Z',
  pinned: false,
};

describe('GLPlayerJournalImportCard — épinglage & accessibilité', () => {
  test('bouton « Voir » profond appelle onNavigateTab avec la cible enrichie', () => {
    const onNavigateTab = vi.fn();
    render(<GLPlayerJournalImportCard item={baseItem} onNavigateTab={onNavigateTab} />);
    const voir = screen.getByRole('button', { name: /Voir « Photosynthèse »/ });
    fireEvent.click(voir);
    expect(onNavigateTab).toHaveBeenCalledWith({
      tab: 'glossary',
      focusType: 'glossary',
      focusRef: 'GL1',
    });
  });

  test('épingler : bouton étiqueté et appel onTogglePin(id, true)', () => {
    const onTogglePin = vi.fn();
    render(<GLPlayerJournalImportCard item={baseItem} onTogglePin={onTogglePin} />);
    const pin = screen.getByRole('button', { name: 'Épingler « Photosynthèse »' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);
    expect(onTogglePin).toHaveBeenCalledWith(42, true);
  });

  test('déjà épinglé : état pressé + libellé de désépinglage', () => {
    const onTogglePin = vi.fn();
    render(
      <GLPlayerJournalImportCard item={{ ...baseItem, pinned: true }} onTogglePin={onTogglePin} />,
    );
    const pin = screen.getByRole('button', { name: 'Désépingler « Photosynthèse »' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pin);
    expect(onTogglePin).toHaveBeenCalledWith(42, false);
  });

  test('mode lecture seule (MJ) : ni épingler ni retirer', () => {
    render(<GLPlayerJournalImportCard item={baseItem} onNavigateTab={vi.fn()} readOnly />);
    expect(screen.queryByRole('button', { name: /Épingler/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });
});
