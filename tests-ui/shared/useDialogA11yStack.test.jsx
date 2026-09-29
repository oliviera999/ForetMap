import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useDialogA11y } from '../../src/shared/platform/useDialogA11y.js';

function Overlay({ label, onClose }) {
  const ref = useDialogA11y(onClose);
  return (
    <div ref={ref} role="dialog" aria-label={label}>
      <button type="button">{label}</button>
    </div>
  );
}

describe('useDialogA11y — pile des surcouches', () => {
  test('Échap ne ferme que la surcouche du dessus', () => {
    const closeBelow = vi.fn();
    const closeAbove = vi.fn();
    const { rerender } = render(
      <>
        <Overlay label="Fenêtre" onClose={closeBelow} />
        <Overlay label="Lightbox" onClose={closeAbove} />
      </>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeAbove).toHaveBeenCalledTimes(1);
    expect(closeBelow).not.toHaveBeenCalled();

    rerender(<Overlay label="Fenêtre" onClose={closeBelow} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeBelow).toHaveBeenCalledTimes(1);
    expect(closeAbove).toHaveBeenCalledTimes(1);
  });
});
