import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrefillSourceBadge } from '../../../src/components/biodiv/PrefillSourceBadge.jsx';

describe('PrefillSourceBadge', () => {
  test('source openai → badge « 🧠 OpenAI »', () => {
    render(<PrefillSourceBadge sourceMeta={{ source: 'openai' }} />);
    const badge = screen.getByText('🧠 OpenAI');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toMatch(/OpenAI à partir du contexte multi-sources/);
  });

  test('source openai_gap → badge « 🧠 OpenAI »', () => {
    render(<PrefillSourceBadge sourceMeta={{ source: 'openai_gap' }} />);
    expect(screen.getByText('🧠 OpenAI')).toBeInTheDocument();
  });

  test('autre source → badge « 🔎 <source> » (normalisé en minuscules)', () => {
    render(<PrefillSourceBadge sourceMeta={{ source: 'GBIF' }} />);
    const badge = screen.getByText('🔎 gbif');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toBe('Champ proposé par la source gbif');
  });

  test('source absente → ne rend rien', () => {
    const { container } = render(<PrefillSourceBadge sourceMeta={{}} />);
    expect(container.firstChild).toBeNull();
  });

  test('sourceMeta absent → ne rend rien', () => {
    const { container } = render(<PrefillSourceBadge />);
    expect(container.firstChild).toBeNull();
  });
});
