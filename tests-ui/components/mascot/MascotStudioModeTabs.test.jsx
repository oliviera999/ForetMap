import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotStudioModeTabs from '../../../src/components/mascot/MascotStudioModeTabs.jsx';

const MODES = [
  { id: 'packs', label: 'Packs' },
  { id: 'dialogues', label: 'Dialogues' },
];

describe('MascotStudioModeTabs', () => {
  test('rend un onglet par mode avec son libellé', () => {
    render(<MascotStudioModeTabs modes={MODES} activeMode="packs" onSelectMode={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Packs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Dialogues' })).toBeTruthy();
  });

  // Ces onglets étaient des `btn btn-sm btn-primary/btn-ghost` : des boutons déguisés en
  // onglets, sans rail, l'une des quatre apparences d'onglets recensées par
  // `docs/AUDIT_UI_FORMULAIRES_ONGLETS_2026-09.md`. Ils portent désormais la barre commune
  // `.fm-subtabs`, qui lit l'état courant sur `aria-selected` — l'attribut d'accessibilité
  // devient donc la seule source de vérité, au lieu d'être doublé par une classe.
  test('le mode actif porte aria-selected, et aucun onglet ne porte de classe de bouton', () => {
    render(<MascotStudioModeTabs modes={MODES} activeMode="dialogues" onSelectMode={vi.fn()} />);
    const active = screen.getByRole('tab', { name: 'Dialogues' });
    const inactive = screen.getByRole('tab', { name: 'Packs' });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(active.closest('.fm-subtabs')).not.toBeNull();
    for (const tab of [active, inactive]) {
      expect(tab.className).not.toMatch(/\bbtn(-|\b)/);
      expect(tab.getAttribute('type')).toBe('button');
    }
  });

  test('clic sur un onglet remonte son id au parent', () => {
    const onSelectMode = vi.fn();
    render(<MascotStudioModeTabs modes={MODES} activeMode="packs" onSelectMode={onSelectMode} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Dialogues' }));
    expect(onSelectMode).toHaveBeenCalledWith('dialogues');
  });
});
