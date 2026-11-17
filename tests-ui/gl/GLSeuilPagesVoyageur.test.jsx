import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLSeuilLettre, GLSeuilMentorat } from '../../src/gl/components/GLSeuilPagesVoyageur.jsx';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

/**
 * Ensemble unifié (M23) — « Ma Lettre » et « Mon Mentorat » au Seuil : écrire avec une amorce,
 * réécrire après un « pas encore » sans repayer, retenter son Mentorat. Aucun texte interdit.
 */

const amorces = [
  { code: 'vu', titre: 'Ce que j’ai vu', texte: 'Raconte ce que tu as vu dans ce biome.' },
  { code: 'surprise', titre: 'Ce qui m’a surpris', texte: 'Choisis une espèce qui t’a surpris.' },
  { code: 'question', titre: 'Ce que je me demande', texte: 'Écris une question que tu te poses.' },
];

describe('Le Seuil — Lettre et Mentorat', () => {
  test('rien à afficher sans Lettre ni Mentorat', () => {
    const { container } = render(
      <>
        <GLSeuilLettre lettre={null} onEcrire={vi.fn()} />
        <GLSeuilMentorat mentorat={null} onRetenter={vi.fn()} />
      </>,
    );
    expect(container.textContent).toBe('');
  });

  test('Lettre à écrire : trois amorces, envoi du titre, du texte et de l’amorce choisie', async () => {
    const onEcrire = vi.fn().mockResolvedValue({});
    render(
      <GLSeuilLettre
        lettre={{
          id: 4,
          statut: 'a_ecrire',
          amorces,
          presentation: 'Une Lettre, c’est une page à toi.',
        }}
        onEcrire={onEcrire}
      />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    const envoyer = screen.getByRole('button', { name: 'Envoyer à la relecture' });
    expect(envoyer.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Ce qui m’a surpris'));
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Le fennec' } });
    fireEvent.change(screen.getByLabelText('Ta page'), {
      target: { value: 'Ses grandes oreilles lui servent à perdre de la chaleur.' },
    });
    expect(envoyer.disabled).toBe(false);
    fireEvent.click(envoyer);
    await waitFor(() =>
      expect(onEcrire).toHaveBeenCalledWith(4, {
        amorce: 'surprise',
        titre: 'Le fennec',
        texte: 'Ses grandes oreilles lui servent à perdre de la chaleur.',
      }),
    );
  });

  test('Lettre « pas encore » : la piste du prof, le texte repris, rien à repayer', () => {
    const { container } = render(
      <GLSeuilLettre
        lettre={{
          id: 4,
          statut: 'pas_encore',
          amorce: 'vu',
          titre: 'Le soir',
          texte: 'Nous avons vu des traces dans le sable.',
          piste: 'Dis quel animal a laissé ces traces.',
          retour: 'Pas encore : ta page a besoin d’un détail de plus. Tu n’as rien à repayer.',
          amorces,
        }}
        onEcrire={vi.fn()}
      />,
    );
    expect(screen.getByTestId('gl-seuil-lettre-piste').textContent).toContain(
      'Dis quel animal a laissé ces traces.',
    );
    expect(screen.getByLabelText('Titre').value).toBe('Le soir');
    expect(findForbiddenString(container.textContent)).toBeNull();
  });

  test('Lettre en relecture : plus de formulaire', () => {
    render(
      <GLSeuilLettre
        lettre={{ id: 4, statut: 'proposee', titre: 'Le soir', amorces }}
        onEcrire={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Envoyer à la relecture' })).toBeNull();
    expect(screen.getByText('Ta page est en relecture chez ton professeur.')).toBeTruthy();
  });

  test('Mentorat « pas encore » : il se retente sans repayer ; un refus s’affiche sans gronder', async () => {
    const onRetenter = vi
      .fn()
      .mockRejectedValueOnce(new Error('Un Mentorat est déjà prévu aujourd’hui.'))
      .mockResolvedValueOnce({});
    const { container } = render(
      <GLSeuilMentorat
        mentorat={{
          id: 9,
          statut: 'pas_encore',
          piste: 'Dis où vit cette espèce.',
          consigne: 'Mentorat : tu expliques à la classe, en deux minutes, une page du carnet.',
          retour: 'Pas encore : il manque un morceau à ton explication.',
        }}
        onRetenter={onRetenter}
      />,
    );
    const bouton = screen.getByRole('button', { name: 'Je retente, sans rien repayer' });
    fireEvent.click(bouton);
    await waitFor(() =>
      expect(screen.getByText('Un Mentorat est déjà prévu aujourd’hui.')).toBeTruthy(),
    );
    fireEvent.click(bouton);
    await waitFor(() => expect(onRetenter).toHaveBeenCalledTimes(2));
    expect(findForbiddenString(container.textContent)).toBeNull();
  });

  test('Mentorat prévu ou réussi : pas de bouton', () => {
    const { rerender } = render(
      <GLSeuilMentorat mentorat={{ id: 9, statut: 'prevu', consigne: 'Prépare trois choses.' }} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <GLSeuilMentorat
        mentorat={{
          id: 9,
          statut: 'valide',
          retour: 'Mentorat réussi : la classe en sait plus grâce à toi.',
        }}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Mentorat réussi/)).toBeTruthy();
  });
});
