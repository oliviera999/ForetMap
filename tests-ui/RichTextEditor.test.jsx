/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RichTextEditor } from '../src/components/RichTextEditor.jsx';

function lastMarkdown(onChange) {
  return onChange.mock.calls.at(-1)?.[0]?.target?.value ?? '';
}

function openToolbar() {
  fireEvent.click(screen.getByRole('button', { name: /Mise en forme/ }));
}

function placeCaretIn(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

const originalExecCommand = document.execCommand;

afterEach(() => {
  document.execCommand = originalExecCommand;
  vi.restoreAllMocks();
});

describe('RichTextEditor — barre repliée par défaut', () => {
  it('n’affiche que le bouton « Mise en forme » pour un texte simple', () => {
    render(<RichTextEditor value="Arroser les tomates" onChange={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /Mise en forme/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByText(/Sélectionner un mot/)).toBeNull();
  });

  it('se déplie d’office si le texte est déjà mis en forme', () => {
    render(<RichTextEditor value={'## Objectif\n\n- planter'} onChange={vi.fn()} />);
    expect(screen.getByRole('toolbar', { name: 'Mise en forme du texte' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mise en forme/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('se déplie quand un contenu mis en forme arrive après coup', () => {
    const { rerender } = render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    rerender(<RichTextEditor value="Un mot en **gras**" onChange={vi.fn()} />);
    expect(screen.getByRole('toolbar', { name: 'Mise en forme du texte' })).toBeTruthy();
  });

  it('reste repliée si l’utilisateur l’a refermée', () => {
    const { rerender } = render(<RichTextEditor value="**gras**" onChange={vi.fn()} />);
    openToolbar();
    expect(screen.queryByRole('toolbar')).toBeNull();
    rerender(<RichTextEditor value="**gras** et *italique*" onChange={vi.fn()} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('n’affiche rien avec toolbar={false}', () => {
    render(<RichTextEditor value="**gras**" onChange={vi.fn()} toolbar={false} />);
    expect(screen.queryByRole('button', { name: /Mise en forme/ })).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

describe('RichTextEditor — libellés compréhensibles', () => {
  it('propose des boutons nommés en mots simples, et la phrase d’aide', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    openToolbar();
    for (const name of ['Gras', 'Italique', 'Titre', 'Liste à puces', 'Ajouter un lien']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gras' }).getAttribute('title')).toMatch(
      /^Gras \((Ctrl|Cmd)\+B\)$/,
    );
    expect(screen.getByText(/Sélectionner un mot/)).toBeTruthy();
    expect(screen.queryByText(/Markdown/)).toBeNull();
  });

  it('garde les outils rares derrière « Plus… »', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    openToolbar();
    expect(screen.queryByRole('button', { name: 'Petit titre' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Plus/ }));
    for (const name of [
      'Petit titre',
      'Liste numérotée',
      'Encadré (citation)',
      'Ligne de séparation',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('ne montre « Enlever le lien » que lorsque le curseur est dans un lien', () => {
    render(<RichTextEditor value="Voir [la fiche](https://ex.org) ici" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Enlever le lien' })).toBeNull();
    const editor = screen.getByRole('textbox');
    const anchor = editor.querySelector('a');
    placeCaretIn(anchor.firstChild, 2);
    fireEvent.mouseUp(editor);
    expect(screen.getByRole('button', { name: 'Enlever le lien' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajouter un lien' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('allume le bouton Gras quand le curseur est dans un mot en gras', () => {
    render(<RichTextEditor value="Un **mot** fort" onChange={vi.fn()} />);
    const editor = screen.getByRole('textbox');
    const strong = editor.querySelector('strong');
    placeCaretIn(strong.firstChild, 1);
    fireEvent.keyUp(editor);
    const bold = screen.getByRole('button', { name: 'Gras' });
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(bold.className).toContain('is-active');
    expect(screen.getByRole('button', { name: 'Italique' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('RichTextEditor — panneau de lien', () => {
  it('insère un lien avec son texte, même sans sélection', () => {
    const onChange = vi.fn();
    document.execCommand = vi.fn((command, _ui, arg) => {
      if (command === 'insertHTML') {
        document.querySelector('.rich-text-editor-surface').insertAdjacentHTML('beforeend', arg);
      }
      return true;
    });
    render(<RichTextEditor value="" onChange={onChange} />);
    openToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }));

    fireEvent.change(screen.getByLabelText('Texte à afficher'), {
      target: { value: 'le site du lycée' },
    });
    fireEvent.change(screen.getByLabelText('Adresse du lien'), {
      target: { value: 'www.exemple.fr' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le lien' }));

    expect(document.execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('<a href="https://www.exemple.fr">le site du lycée</a>'),
    );
    expect(lastMarkdown(onChange)).toContain('[le site du lycée](https://www.exemple.fr)');
    expect(screen.queryByLabelText('Adresse du lien')).toBeNull();
  });

  it('refuse une adresse non reconnue avec un message simple', () => {
    document.execCommand = vi.fn(() => true);
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    openToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }));
    fireEvent.change(screen.getByLabelText('Adresse du lien'), {
      target: { value: 'ftp://serveur/fichier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le lien' }));

    expect(screen.getByRole('alert').textContent).toContain('Cette adresse n’est pas reconnue');
    expect(screen.getByText('En savoir plus')).toBeTruthy();
    expect(document.execCommand).not.toHaveBeenCalledWith(
      'insertHTML',
      expect.anything(),
      expect.anything(),
    );
  });

  it('Entrée dans le panneau ne soumet pas le formulaire englobant', () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    document.execCommand = vi.fn(() => true);
    render(
      <form onSubmit={onSubmit}>
        <RichTextEditor value="" onChange={vi.fn()} />
      </form>,
    );
    openToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien' }));
    const url = screen.getByLabelText('Adresse du lien');
    fireEvent.change(url, { target: { value: 'ftp://x' } });
    fireEvent.keyDown(url, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('Ctrl+K dans le texte ouvre le panneau de lien', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'k', ctrlKey: true });
    expect(screen.getByLabelText('Adresse du lien')).toBeTruthy();
  });
});

describe('RichTextEditor — retours à la ligne', () => {
  it('Entrée façon Chrome (<div>) garde deux paragraphes distincts', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox');
    editor.innerHTML = 'Première ligne<div>Deuxième ligne</div><div>Troisième ligne</div>';
    fireEvent.input(editor);

    expect(lastMarkdown(onChange)).toBe('Première ligne\n\nDeuxième ligne\n\nTroisième ligne');
    expect(editor.querySelectorAll('p')).toHaveLength(2);
  });

  it('Maj+Entrée (<br>) donne un simple retour à la ligne, conservé au réaffichage', () => {
    const onChange = vi.fn();
    const { unmount } = render(<RichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox');
    editor.innerHTML = '<p>Ligne A<br>Ligne B</p>';
    fireEvent.input(editor);
    const markdown = lastMarkdown(onChange);
    expect(markdown).toMatch(/^Ligne A\s*\nLigne B$/);
    unmount();

    render(<RichTextEditor value={markdown} onChange={vi.fn()} />);
    const reloaded = screen.getByRole('textbox');
    expect(reloaded.querySelector('br')).not.toBeNull();
    expect(reloaded.textContent).toContain('Ligne A');
    expect(reloaded.textContent).toContain('Ligne B');
  });

  it('pose le séparateur <p> juste avant chaque Entrée (Chrome l’ignore au focus)', () => {
    document.execCommand = vi.fn(() => true);
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    const editor = screen.getByRole('textbox');
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(document.execCommand).toHaveBeenCalledWith('defaultParagraphSeparator', false, 'p');
    document.execCommand.mockClear();
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('demande des paragraphes <p> au navigateur à la prise de focus', () => {
    document.execCommand = vi.fn(() => true);
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(document.execCommand).toHaveBeenCalledWith('defaultParagraphSeparator', false, 'p');
  });
});

describe('RichTextEditor — nom accessible', () => {
  it('aria-labelledby nomme la surface éditable, pas son enveloppe', () => {
    render(
      <>
        <span id="lbl-notes">Notes du professeur</span>
        <RichTextEditor value="" onChange={vi.fn()} id="notes" aria-labelledby="lbl-notes" />
      </>,
    );
    const editor = screen.getByRole('textbox', { name: 'Notes du professeur' });
    expect(editor).toHaveAttribute('id', 'notes');
    expect([...document.querySelectorAll('[aria-labelledby="lbl-notes"]')]).toEqual([editor]);
  });
});
