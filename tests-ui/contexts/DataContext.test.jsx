import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataProvider, useData } from '../../src/contexts/DataContext.jsx';

function Probe() {
  const { zones = [], tasks = [], activeMapId = 'foret' } = useData();
  return <span data-testid="v">{zones.length}|{tasks.length}|{activeMapId}</span>;
}

describe('DataContext', () => {
  test('fournit les données aux consommateurs', () => {
    render(
      <DataProvider value={{ zones: [1, 2, 3], tasks: [{}], activeMapId: 'verger' }}>
        <Probe />
      </DataProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('3|1|verger');
  });

  test('hors Provider : déstructuration sur les défauts ([] / foret)', () => {
    render(<Probe />);
    expect(screen.getByTestId('v').textContent).toBe('0|0|foret');
  });

  test('value null = hors Provider', () => {
    render(
      <DataProvider value={null}>
        <Probe />
      </DataProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('0|0|foret');
  });
});
