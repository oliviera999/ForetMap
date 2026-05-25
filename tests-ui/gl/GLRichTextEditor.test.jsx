/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GLRichTextEditor } from '../../src/gl/components/ui/GLRichTextEditor.jsx';

describe('GLRichTextEditor', () => {
  it('affiche le markdown initial dans la surface editable', () => {
    render(
      <GLRichTextEditor
        value="# Titre\n\nParagraphe."
        onChange={vi.fn()}
      />
    );

    const editor = screen.getByRole('textbox');
    expect(editor.innerHTML).toContain('Titre');
    expect(editor.innerHTML).toContain('Paragraphe.');
  });

  it('reconvertit le HTML edite en markdown', () => {
    const onChange = vi.fn();
    render(<GLRichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox');
    editor.innerHTML = '<h2>Chapitre</h2><p>Contenu lisible</p>';
    fireEvent.input(editor);

    expect(onChange).toHaveBeenCalled();
    const lastValue = onChange.mock.calls.at(-1)?.[0]?.target?.value || '';
    expect(lastValue).toContain('## Chapitre');
    expect(lastValue).toContain('Contenu lisible');
  });

  it('preserve les images inline GL en markdown HTML', () => {
    const onChange = vi.fn();
    render(<GLRichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox');
    editor.innerHTML = '<p>Intro</p><img src="/uploads/test.jpg" alt="Photo" class="gl-content-image" data-gl-frame=\'{"aspectRatio":"1/1"}\' loading="lazy" />';
    fireEvent.input(editor);

    const lastValue = onChange.mock.calls.at(-1)?.[0]?.target?.value || '';
    expect(lastValue).toContain('<img src="/uploads/test.jpg"');
    expect(lastValue).toContain('data-gl-frame=');
  });
});
