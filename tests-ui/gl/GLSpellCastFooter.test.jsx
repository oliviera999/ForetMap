import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLSpellCastFooter } from '../../src/gl/components/spell-cast/GLSpellCastFooter.jsx';

function renderFooter(props = {}) {
  return render(
    <GLSpellCastFooter
      step="fund"
      busy={false}
      fundLoading={false}
      canLaunch
      onCancelDraft={vi.fn()}
      onLaunch={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe('GLSpellCastFooter', () => {
  test("à l'étape fund, rend Annuler et Lancer", () => {
    renderFooter();
    expect(screen.getByText('Annuler le brouillon')).toBeInTheDocument();
    expect(screen.getByText('Lancer le sortilège')).toBeInTheDocument();
  });

  test('hors étape fund, rend uniquement Fermer', () => {
    renderFooter({ step: 'team' });
    expect(screen.getByText('Fermer')).toBeInTheDocument();
    expect(screen.queryByText('Lancer le sortilège')).not.toBeInTheDocument();
  });

  test('désactive Lancer si canLaunch est faux', () => {
    renderFooter({ canLaunch: false });
    expect(screen.getByText('Lancer le sortilège').closest('button').disabled).toBe(true);
  });

  test('désactive les deux boutons quand busy', () => {
    renderFooter({ busy: true });
    expect(screen.getByText('Annuler le brouillon').closest('button').disabled).toBe(true);
    expect(screen.getByText('Lancer le sortilège').closest('button').disabled).toBe(true);
  });

  test('remonte onLaunch et onCancelDraft au clic', () => {
    const onLaunch = vi.fn();
    const onCancelDraft = vi.fn();
    renderFooter({ onLaunch, onCancelDraft });
    fireEvent.click(screen.getByText('Lancer le sortilège'));
    fireEvent.click(screen.getByText('Annuler le brouillon'));
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onCancelDraft).toHaveBeenCalledTimes(1);
  });

  test('remonte onClose au clic sur Fermer', () => {
    const onClose = vi.fn();
    renderFooter({ step: 'spell', onClose });
    fireEvent.click(screen.getByText('Fermer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
