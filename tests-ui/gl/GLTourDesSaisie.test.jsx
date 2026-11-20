import { describe, test, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLTourDesSaisie } from '../../src/gl/components/mj/GLTourDesSaisie.jsx';

describe('GLTourDesSaisie — l’avance libre derrière « Corriger la position… » (K6)', () => {
  afterEach(() => cleanup());

  test('la carte ne montre que le jet : ni champ d’avance, ni motif, ni « Avancer »', () => {
    render(<GLTourDesSaisie allowLibre onLancer={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Saisir le jet/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corriger la position…' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('gl-tour-des-libre')).toBeNull();
    expect(screen.queryByLabelText('Motif de l’avance libre')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Avancer' })).toBeNull();
  });

  test('sans `allowLibre` (écran d’équipe), pas de bouton de correction', () => {
    render(<GLTourDesSaisie onLancer={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Corriger la position…' })).toBeNull();
  });

  test('« Corriger la position… » ouvre l’avance libre ; le motif reste obligatoire', async () => {
    const onLancer = vi.fn().mockResolvedValue({ ok: true });
    render(<GLTourDesSaisie allowLibre onLancer={onLancer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Corriger la position…' }));
    const avancer = screen.getByRole('button', { name: 'Avancer' });
    expect(avancer).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Avance libre'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Motif de l’avance libre'), {
      target: { value: 'pion mal posé' },
    });
    expect(avancer).not.toBeDisabled();
    fireEvent.click(avancer);
    expect(onLancer).toHaveBeenCalledWith({ mode: 'libre', cases: 4, motif: 'pion mal posé' });
    // Correction faite : le formulaire se referme, la carte revient au jet seul.
    await waitFor(() => expect(screen.queryByTestId('gl-tour-des-libre')).toBeNull());
    expect(screen.getByRole('button', { name: 'Corriger la position…' })).toBeInTheDocument();
  });

  test('correction refusée par le serveur : le formulaire garde la saisie', async () => {
    const onLancer = vi.fn().mockResolvedValue(null);
    render(<GLTourDesSaisie allowLibre onLancer={onLancer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Corriger la position…' }));
    fireEvent.change(screen.getByLabelText('Motif de l’avance libre'), {
      target: { value: 'erreur de jet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Avancer' }));
    await waitFor(() => expect(onLancer).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Motif de l’avance libre')).toHaveValue('erreur de jet');
  });

  test('carte inactive (au tableau, une autre équipe joue) : la correction est fermée aussi', () => {
    render(<GLTourDesSaisie allowLibre disabled onLancer={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Corriger la position…' })).toBeDisabled();
  });

  test('« Annuler » referme sans rien envoyer', () => {
    const onLancer = vi.fn();
    render(<GLTourDesSaisie allowLibre onLancer={onLancer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Corriger la position…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByTestId('gl-tour-des-libre')).toBeNull();
    expect(onLancer).not.toHaveBeenCalled();
  });
});
