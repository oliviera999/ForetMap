import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GLSablier, GLSablierReglage } from '../../src/gl/components/tenir/GLSablier.jsx';

/**
 * Sabliers réglables d'un clic (14 novembre 2026). Le prof clique sur le sablier pour ouvrir
 * le panneau ; élèves et projection le voient sans pouvoir le régler ; un sablier n'annule rien.
 */
const reglages = { actif: true, equipeSecondes: 180, phaseSecondes: 300, phaseAuto: false };

describe('GLSablier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('élève ou projection : le sablier s’affiche, sans bouton ni panneau', () => {
    render(<GLSablier mode="phase" secondes={300} restantSecondes={240} />);
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('4:00');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('gl-sablier-panneau')).toBeNull();
  });

  test('temps du serveur : décompte entre deux lectures, recalage à la lecture suivante, pause figée', () => {
    const { rerender } = render(<GLSablier mode="phase" secondes={300} restantSecondes={240} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('3:57');
    rerender(<GLSablier mode="phase" secondes={300} restantSecondes={200} />);
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('3:20');
    rerender(<GLSablier mode="phase" secondes={300} restantSecondes={200} enPause />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('3:20');
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('en pause');
  });

  test('à zéro : rien n’est annulé, onDone est appelé une seule fois', () => {
    const onDone = vi.fn();
    render(<GLSablier mode="phase" secondes={300} restantSecondes={2} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('0:00');
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('rien n’est annulé');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('prof : un clic ouvre le panneau ; une durée d’un clic, l’interrupteur, le passage au souffle', () => {
    const onRegler = vi.fn();
    render(
      <GLSablier
        mode="phase"
        secondes={300}
        restantSecondes={240}
        reglages={reglages}
        onRegler={onRegler}
      />,
    );
    const bouton = screen.getByRole('button', { name: /Sablier 4:00 : régler/ });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(bouton);
    expect(screen.getByTestId('gl-sablier-panneau')).toBeInTheDocument();
    for (const m of [1, 2, 3, 5, 8, 10]) {
      expect(screen.getByRole('button', { name: `${m} min` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '5 min' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '8 min' }));
    expect(onRegler).toHaveBeenLastCalledWith({ phaseSecondes: 480 });
    fireEvent.click(screen.getByRole('switch', { name: 'Sablier' }));
    expect(onRegler).toHaveBeenLastCalledWith({ actif: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Passer au souffle à la fin' }));
    expect(onRegler).toHaveBeenLastCalledWith({ phaseAuto: true });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onRegler).toHaveBeenLastCalledWith({ action: 'pause' });
    fireEvent.click(screen.getByRole('button', { name: 'Remise à zéro' }));
    expect(onRegler).toHaveBeenLastCalledWith({ action: 'zero' });
  });

  test('prof : durée saisie en minutes ; une saisie hors bornes ne part pas', () => {
    const onRegler = vi.fn();
    render(
      <GLSablier
        mode="phase"
        secondes={300}
        restantSecondes={240}
        reglages={reglages}
        onRegler={onRegler}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /régler/ }));
    const saisie = screen.getByLabelText(/Autre durée/);
    expect(screen.getByRole('button', { name: 'Régler' })).toBeDisabled();
    fireEvent.change(saisie, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Régler' }));
    expect(onRegler).toHaveBeenLastCalledWith({ phaseSecondes: 240 });
    fireEvent.change(saisie, { target: { value: '90' } });
    expect(screen.getByRole('button', { name: 'Régler' })).toBeDisabled();
  });

  test('sablier de l’équipe active (tableau) : pause, reprise et remise à zéro restent locales', () => {
    const onRegler = vi.fn();
    render(
      <GLSablier
        mode="equipe"
        secondes={180}
        reglages={reglages}
        onRegler={onRegler}
        resetKey={1}
      />,
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('2:50');
    fireEvent.click(screen.getByRole('button', { name: /régler/ }));
    expect(screen.queryByRole('checkbox', { name: 'Passer au souffle à la fin' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('2:50');
    fireEvent.click(screen.getByRole('button', { name: 'Reprise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remise à zéro' }));
    expect(screen.getByTestId('gl-sablier')).toHaveTextContent('3:00');
    expect(onRegler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2 min' }));
    expect(onRegler).toHaveBeenLastCalledWith({ secondes: 120 });
  });

  test('sans sablier en cours : le bouton « Sablier » ouvre le panneau et rallume d’un clic', () => {
    const onRegler = vi.fn();
    render(
      <GLSablierReglage
        mode="phase"
        reglages={{ ...reglages, actif: false, phaseSecondes: 0 }}
        onRegler={onRegler}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Sablier/ }));
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '5 min' }));
    expect(onRegler).toHaveBeenLastCalledWith({ phaseSecondes: 300, actif: true });
  });
});
