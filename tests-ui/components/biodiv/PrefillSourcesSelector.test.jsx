import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PrefillSourcesSelector,
  SPECIES_PREFILL_SOURCE_CHECKBOXES,
} from '../../../src/components/biodiv/PrefillSourcesSelector.jsx';

const allChecked = () =>
  Object.fromEntries(SPECIES_PREFILL_SOURCE_CHECKBOXES.map((o) => [o.id, true]));

describe('PrefillSourcesSelector', () => {
  test('rend le résumé et une case par source, état coché reflété', () => {
    render(<PrefillSourcesSelector sources={allChecked()} onToggle={() => {}} />);
    expect(screen.getByText('Sources à interroger')).toBeInTheDocument();
    expect(screen.getByText('Wikipedia (FR)')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(SPECIES_PREFILL_SOURCE_CHECKBOXES.length);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  test('case décochée dans le prop sources → input non coché', () => {
    render(
      <PrefillSourcesSelector sources={{ ...allChecked(), openai: false }} onToggle={() => {}} />,
    );
    // l’id de la source apparaît en petit à côté du label
    expect(screen.getByText('(openai)')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.filter((b) => !b.checked)).toHaveLength(1);
  });

  test('clic sur un label → onToggle(id) avec l’id de la source', () => {
    const onToggle = vi.fn();
    render(<PrefillSourcesSelector sources={allChecked()} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('OpenAI'));
    expect(onToggle).toHaveBeenCalledWith('openai');
  });
});
