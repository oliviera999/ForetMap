import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GLPeripetieOverlay } from '../../src/gl/components/tenir/GLPeripetieOverlay.jsx';
import {
  GLSpellCastEffectParams,
  neededParams,
  buildDraftOptions,
} from '../../src/gl/components/spell-cast/GLSpellCastEffectParams.jsx';

describe('GLPeripetieOverlay', () => {
  test('plein écran, compte à rebours de 30 s, « On passe » renvoie la péripétie', () => {
    vi.useFakeTimers();
    const onPasser = vi.fn();
    const peripetie = { id: 'per-1', texte: 'Une mangouste a volé le dé.' };
    render(<GLPeripetieOverlay peripetie={peripetie} teamName="Gnomes A" onPasser={onPasser} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Une mangouste a volé le dé.')).toBeInTheDocument();
    expect(screen.getByText('30 s')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('27 s')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'On passe' }));
    expect(onPasser).toHaveBeenCalledWith(peripetie);
    vi.useRealTimers();
  });

  test('sans péripétie : rien', () => {
    const { container } = render(<GLPeripetieOverlay peripetie={null} onPasser={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('GLSpellCastEffectParams', () => {
  test('paramètres déduits du sort : Progression (sens), Bourrasque (cible), Cordée (partenaire), Nommer (page), Héritage', () => {
    expect(
      neededParams({
        tenir_v2: true,
        spell_code: 'SL002',
        ressource: 'choix',
        cible: 'pion_equipe',
      }),
    ).toEqual(['ressource', 'delta']);
    expect(
      neededParams({
        tenir_v2: true,
        spell_code: 'SL039',
        ressource: 'gemmes',
        cible: 'autre_equipe',
      }),
    ).toEqual(['cible']);
    expect(
      neededParams({
        tenir_v2: true,
        spell_code: 'SL045',
        peuple: 'pacte',
        ressource: 'pacte',
        cible: 'deux_equipes',
      }),
    ).toEqual(['partenaire']);
    expect(
      neededParams({
        tenir_v2: true,
        spell_code: 'SL041',
        ressource: 'coeurs',
        cible: 'zone_palie',
      }),
    ).toEqual(['zoneKey']);
    expect(
      neededParams({ tenir_v2: true, spell_code: 'SL033', ressource: 'choix', cible: 'eleve' }),
    ).toEqual(['ressource', 'heritage']);
    expect(neededParams({ spell_code: 'SCT01' })).toEqual([]);
    expect(buildDraftOptions({ ressource: 'coeurs', delta: 1 })).toEqual({
      ressource: 'coeurs',
      partnerTeamId: undefined,
      effectParams: { delta: 1 },
    });
    expect(
      buildDraftOptions({ beneficiairePlayerId: 4, heritageRessource: 'gemmes' }).effectParams,
    ).toEqual({ beneficiairePlayerId: 4, ressource: 'gemmes' });
  });

  test('le bouton « Continuer » attend les paramètres requis', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const spell = {
      tenir_v2: true,
      spell_code: 'SL039',
      ressource: 'gemmes',
      cible: 'autre_equipe',
      fenetre: 'jeu',
      limite: { par: 'tour', n: 1, portee: 'equipe' },
    };
    const teams = [
      { id: 1, name: 'Gnomes A', type: 'gnome' },
      { id: 2, name: 'Licornes A', type: 'unicorn' },
    ];
    const { rerender } = render(
      <GLSpellCastEffectParams
        spell={spell}
        teams={teams}
        teamId={2}
        value={{}}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/Fenêtre : phase jeu/)).toBeInTheDocument();
    expect(screen.getByText(/Limite : 1\/tour\/équipe/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Équipe visée'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith({ targetTeamId: 1 });
    rerender(
      <GLSpellCastEffectParams
        spell={spell}
        teams={teams}
        teamId={2}
        value={{ targetTeamId: 1 }}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(onSubmit).toHaveBeenCalledWith({ targetTeamId: 1 });
  });
});
