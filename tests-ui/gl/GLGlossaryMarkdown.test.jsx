import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  GLGlossaryMarkdown,
  GLGlossaryInlineText,
} from '../../src/gl/components/GLGlossaryMarkdown.jsx';

const GLOSSARY_ITEMS = [{ glossary_code: 'GL0001', terme: 'Biome', variantes: '' }];

describe('GLGlossaryMarkdown', () => {
  test('ouvre le popover au clic sur un terme hyperlié', () => {
    const onOpenGlossaryTerm = vi.fn();
    render(
      <GLGlossaryMarkdown
        markdown="Le biome est vaste."
        glossaryItems={GLOSSARY_ITEMS}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />,
    );
    const link = screen.getByRole('link', { name: /biome/i });
    fireEvent.click(link);
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('GL0001');
  });
});

describe('GLGlossaryInlineText', () => {
  test('hyperlie le texte brut et déclenche onOpenGlossaryTerm', () => {
    const onOpenGlossaryTerm = vi.fn();
    render(
      <GLGlossaryInlineText
        text="Quel biome ?"
        glossaryItems={GLOSSARY_ITEMS}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /biome/i }));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('GL0001');
  });
});
