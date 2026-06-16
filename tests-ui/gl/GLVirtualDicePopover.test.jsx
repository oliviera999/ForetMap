import React, { useRef } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLVirtualDicePopover } from '../../src/gl/components/GLVirtualDicePopover.jsx';

function PopoverHarness(props) {
  const anchorRef = useRef(null);
  return (
    <>
      <button type="button" ref={anchorRef}>
        Ancre
      </button>
      <GLVirtualDicePopover anchorRef={anchorRef} open {...props} />
    </>
  );
}

const baseProps = {
  open: true,
  phase: 'idle',
  diceCount: 1,
  lastRoll: null,
  onClose: vi.fn(),
  onAddDie: vi.fn(),
  onRemoveDie: vi.fn(),
  onStartRoll: vi.fn(),
  onReset: vi.fn(),
  canAddDie: true,
  canRemoveDie: false,
  isRolling: false,
};

describe('GLVirtualDicePopover', () => {
  test('affiche le compteur et appelle onAddDie / onRemoveDie', async () => {
    const onAddDie = vi.fn();
    const onRemoveDie = vi.fn();
    render(
      <PopoverHarness
        {...baseProps}
        diceCount={2}
        canRemoveDie
        onAddDie={onAddDie}
        onRemoveDie={onRemoveDie}
      />,
    );
    expect(screen.getByText(/2 dés/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('gl-dice-add'));
    expect(onAddDie).toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('gl-dice-remove'));
    expect(onRemoveDie).toHaveBeenCalled();
  });

  test('désactive + à 5 dés', () => {
    render(<PopoverHarness {...baseProps} diceCount={5} canAddDie={false} canRemoveDie />);
    expect(screen.getByTestId('gl-dice-add')).toBeDisabled();
    expect(document.querySelector('.gl-dice-popover__count-label')).toHaveTextContent('5 dés');
  });

  test('affiche le total après un résultat', () => {
    render(
      <PopoverHarness
        {...baseProps}
        phase="result"
        diceCount={3}
        lastRoll={{ values: [4, 5, 2], total: 11 }}
        canRemoveDie
      />,
    );
    expect(screen.getByTestId('gl-dice-result')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('4 + 5 + 2')).toBeInTheDocument();
  });

  test('désactive les étapes pendant le jet', () => {
    render(
      <PopoverHarness
        {...baseProps}
        phase="rolling"
        isRolling
        canAddDie={false}
        canRemoveDie={false}
      />,
    );
    expect(screen.getByText(/Les dés roulent/)).toBeInTheDocument();
    expect(screen.getByTestId('gl-dice-roll')).toBeDisabled();
  });

  test('lancer appelle onStartRoll', async () => {
    const onStartRoll = vi.fn();
    render(<PopoverHarness {...baseProps} onStartRoll={onStartRoll} />);
    await userEvent.click(screen.getByTestId('gl-dice-roll'));
    expect(onStartRoll).toHaveBeenCalled();
  });
});
