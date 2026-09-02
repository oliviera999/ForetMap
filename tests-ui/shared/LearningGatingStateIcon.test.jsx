import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LearningGatingStateIcon } from '../../src/shared/components/LearningGatingStateIcon.jsx';

describe('LearningGatingStateIcon', () => {
  it('n’affiche rien quand rien ne conditionne la ressource', () => {
    const { container } = render(<LearningGatingStateIcon summary={{ required: false }} />);
    // Une icône partout ne signalerait plus rien : le silence est le comportement voulu.
    expect(container).toBeEmptyDOMElement();
  });

  it('n’affiche rien sur une ressource déjà validée', () => {
    const { container } = render(
      <LearningGatingStateIcon summary={{ required: true, ask_count: 1 }} done />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('respecte le réglage prof qui éteint les pastilles', () => {
    const { container } = render(
      <LearningGatingStateIcon summary={{ required: true, ask_count: 1, show_icon: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('montre la coche (SVG) et une phrase lisible quand le contrôle est acquis', () => {
    const { container } = render(
      <LearningGatingStateIcon summary={{ required: true, satisfied: true }} />,
    );
    expect(container.querySelector('.learning-gating-state--acquired svg')).not.toBeNull();
    // La phrase complète existe en texte : le title HTML n'est pas lu par tous les
    // lecteurs d'écran ni atteignable au clavier sur un span.
    expect(screen.getByText(/validation est ouverte/i)).toBeInTheDocument();
  });

  it('montre l’icône « question » et le nombre de questions en attente', () => {
    const { container } = render(
      <LearningGatingStateIcon
        summary={{ required: true, ask_count: 2, pending_count: 2 }}
        withLabel
      />,
    );
    expect(container.querySelector('.learning-gating-state--pending svg')).not.toBeNull();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
  });

  it('montre le cadenas et l’échéance quand la ressource est bloquée', () => {
    const { container } = render(
      <LearningGatingStateIcon summary={{ required: true, locked: true, remaining_days: 3 }} />,
    );
    expect(container.querySelector('.learning-gating-state--locked svg')).not.toBeNull();
    expect(screen.getByText(/3 jours/)).toBeInTheDocument();
    // La classe porte l'état : la couleur ne fait que renforcer la forme.
    expect(container.querySelector('.learning-gating-state--locked')).not.toBeNull();
  });
});
