import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';

function Probe() {
  const { isN3Affiliated = false, canParticipateContextComments = true } = useSession();
  return (
    <span data-testid="v">
      {String(isN3Affiliated)}|{String(canParticipateContextComments)}
    </span>
  );
}

describe('SessionContext', () => {
  test('fournit les valeurs aux consommateurs', () => {
    render(
      <SessionProvider value={{ isN3Affiliated: true, canParticipateContextComments: false }}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('true|false');
  });

  test('hors Provider : déstructuration sur les défauts (false/true) sans crash', () => {
    render(<Probe />);
    expect(screen.getByTestId('v').textContent).toBe('false|true');
  });

  test('value null = hors Provider', () => {
    render(
      <SessionProvider value={null}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('false|true');
  });
});
