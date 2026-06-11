/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarkdownTextarea } from '../src/components/MarkdownTextarea.jsx';

describe('MarkdownTextarea', () => {
  it('utilise une surface WYSIWYG tout en affichant le markdown existant', async () => {
    render(
      <MarkdownTextarea
        value="## Titre\n\nTexte de consigne"
        onChange={vi.fn()}
        placeholder="Décrire"
      />
    );

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    // Attendre que le module de rendu soit chargé et que le contenu soit peuplé.
    await waitFor(() => {
      expect(editor.textContent).toContain('Titre');
    });
    expect(editor.textContent).toContain('Texte de consigne');
  });

  it('renvoie une valeur markdown quand le contenu visuel change', async () => {
    const onChange = vi.fn();
    render(<MarkdownTextarea value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox');
    // Simuler la modification du DOM et déclencher syncFromDom en boucle jusqu’au succès.
    await waitFor(() => {
      editor.innerHTML = '<h2>Objectif</h2><p>Planter et arroser</p>';
      fireEvent.input(editor);
      const markdown = onChange.mock.calls.at(-1)?.[0]?.target?.value || '';
      expect(markdown).toContain('## Objectif');
      expect(markdown).toContain('Planter et arroser');
    });
  });

  it('permet de conserver l’ancien textarea en fallback explicite', () => {
    render(<MarkdownTextarea rich={false} value="texte brut" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('texte brut').tagName).toBe('TEXTAREA');
  });
});
