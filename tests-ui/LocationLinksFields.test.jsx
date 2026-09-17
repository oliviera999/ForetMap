/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  LocationLinksFields,
  buildLocationLinksPayload,
  locationLinkRowError,
  normalizeLocationLinksForForm,
} from '../src/shared/ui/LocationLinksFields.jsx';
import { LocationAudienceFields } from '../src/shared/ui/LocationAudienceFields.jsx';
import { MarkdownTextarea } from '../src/components/MarkdownTextarea.jsx';
import { LocationLinksBlock } from '../src/components/map/LocationLinksBlock.jsx';

describe('LocationLinksFields — logique de formulaire', () => {
  it('normalise une liste venue de l’API', () => {
    expect(
      normalizeLocationLinksForForm([
        { id: 4, label: 'A', url: 'https://a.org', audience_role_slugs: ['prof', 'zzz'] },
      ]),
    ).toEqual([{ label: 'A', url: 'https://a.org', audience_role_slugs: ['prof'] }]);
    expect(normalizeLocationLinksForForm(undefined)).toEqual([]);
  });

  it('ignore les lignes entièrement vides à l’enregistrement', () => {
    // Ajouter une ligne puis changer d’avis ne doit pas faire échouer la sauvegarde du lieu.
    expect(
      buildLocationLinksPayload([
        { label: '  ', url: '  ', audience_role_slugs: [] },
        { label: ' A ', url: ' https://a.org ', audience_role_slugs: [] },
      ]),
    ).toEqual([{ label: 'A', url: 'https://a.org', audience_role_slugs: [] }]);
  });

  it('signale les lignes incomplètes ou hors politique de lien', () => {
    expect(locationLinkRowError({ label: '', url: '' })).toBe('');
    expect(locationLinkRowError({ label: '', url: 'https://a.org' })).toMatch(/Libellé/);
    expect(locationLinkRowError({ label: 'A', url: '' })).toMatch(/Adresse requise/);
    expect(locationLinkRowError({ label: 'A', url: '//a.org' })).toMatch(/non reconnue/);
    expect(locationLinkRowError({ label: 'A', url: 'javascript:alert(1)' })).toMatch(
      /non reconnue/,
    );
    expect(locationLinkRowError({ label: 'A', url: '/tutoriels/3' })).toBe('');
    expect(locationLinkRowError({ label: 'A', url: 'mailto:a@b.c' })).toBe('');
  });
});

describe('LocationLinksFields — rendu', () => {
  it('ajoute une ligne, la renseigne et marque le lien réservé', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LocationLinksFields links={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un lien/ }));
    expect(onChange).toHaveBeenCalledWith([{ label: '', url: '', audience_role_slugs: [] }]);

    rerender(
      <LocationLinksFields
        links={[{ label: 'Consignes', url: '/interne', audience_role_slugs: ['prof'] }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByDisplayValue('Consignes')).toBeTruthy();
    expect(screen.getByTitle('Lien réservé')).toBeTruthy();
  });

  it('affiche l’erreur d’une adresse refusée sans bloquer la saisie', () => {
    render(
      <LocationLinksFields
        links={[{ label: 'A', url: 'ftp://a.org', audience_role_slugs: [] }]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/non reconnue/);
  });
});

describe('LocationLinksBlock — affichage', () => {
  it('ouvre les liens externes dans un nouvel onglet, pas les internes', () => {
    render(
      <LocationLinksBlock
        links={[
          { id: 1, label: 'Fiche', url: 'https://exemple.org/a', is_external: true },
          { id: 2, label: 'Tutoriel', url: '/tutoriels/3', is_external: false },
        ]}
      />,
    );
    const externe = screen.getByRole('link', { name: /Fiche \(ouvre un nouvel onglet\)/ });
    expect(externe.getAttribute('target')).toBe('_blank');
    expect(externe.getAttribute('rel')).toBe('noopener noreferrer');

    const interne = screen.getByRole('link', { name: 'Tutoriel' });
    expect(interne.getAttribute('target')).toBeNull();
  });

  it('ne rend rien sans lien lisible', () => {
    const { container } = render(<LocationLinksBlock links={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LocationAudienceFields — parité d’édition du complément réservé', () => {
  it('sans éditeur injecté, garde le textarea historique', () => {
    render(
      <LocationAudienceFields
        visibleRoleSlugs={[]}
        restrictedNote="note"
        restrictedNoteRoleSlugs={[]}
        onRestrictedNoteChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('note').tagName).toBe('TEXTAREA');
  });

  it('avec MarkdownTextarea injecté, le confidentiel reçoit la barre d’outils (bouton Lien)', () => {
    // C’était l’asymétrie corrigée par le lot 1 : la description publique avait un éditeur
    // riche, le complément réservé un textarea nu — donc aucun moyen guidé d’y poser un lien.
    render(
      <LocationAudienceFields
        visibleRoleSlugs={[]}
        restrictedNote="note"
        restrictedNoteRoleSlugs={[]}
        onRestrictedNoteChange={vi.fn()}
        NoteEditor={MarkdownTextarea}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Complément réservé' });
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(screen.getByRole('button', { name: 'Insérer un lien' })).toBeTruthy();
  });
});
