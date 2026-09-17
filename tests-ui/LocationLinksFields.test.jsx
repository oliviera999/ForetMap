/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  LocationLinksFields,
  buildLocationLinksPayload,
  locationLinkRowError,
  normalizeLocationLinksForForm,
} from '../src/shared/ui/LocationLinksFields.jsx';
import {
  LocationAudienceFields,
  normalizeAudienceGroupList,
} from '../src/shared/ui/LocationAudienceFields.jsx';
import { MarkdownTextarea } from '../src/components/MarkdownTextarea.jsx';
import { LocationLinksBlock } from '../src/components/map/LocationLinksBlock.jsx';

describe('LocationLinksFields — logique de formulaire', () => {
  it('normalise une liste venue de l’API', () => {
    expect(
      normalizeLocationLinksForForm([
        { id: 4, label: 'A', url: 'https://a.org', audience_role_slugs: ['prof', 'zzz'] },
      ]),
    ).toEqual([
      { label: 'A', url: 'https://a.org', audience_role_slugs: ['prof'], audience_group_ids: [] },
    ]);
    expect(normalizeLocationLinksForForm(undefined)).toEqual([]);
  });

  it('ignore les lignes entièrement vides à l’enregistrement', () => {
    // Ajouter une ligne puis changer d’avis ne doit pas faire échouer la sauvegarde du lieu.
    expect(
      buildLocationLinksPayload([
        { label: '  ', url: '  ', audience_role_slugs: [] },
        { label: ' A ', url: ' https://a.org ', audience_role_slugs: [] },
      ]),
    ).toEqual([
      { label: 'A', url: 'https://a.org', audience_role_slugs: [], audience_group_ids: [] },
    ]);
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
    expect(onChange).toHaveBeenCalledWith([
      { label: '', url: '', audience_role_slugs: [], audience_group_ids: [] },
    ]);

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

const GROUP_OPTIONS = [
  { id: 'g1', name: 'Classe A', slug: 'classe-a' },
  { id: 'g2', name: 'Classe B', slug: 'classe-b' },
];

describe('Audience par groupes (migration 262)', () => {
  it('propose les groupes à côté des rôles, et remonte la sélection', () => {
    const onChange = vi.fn();
    render(
      <LocationAudienceFields
        visibleRoleSlugs={[]}
        restrictedNoteRoleSlugs={[]}
        groupOptions={GROUP_OPTIONS}
        visibleGroupIds={[]}
        onVisibleGroupIdsChange={onChange}
      />,
    );
    // Le libellé apparaît dans les deux fieldsets (voir le lieu / lire le complément) :
    // on vise le premier, celui de la visibilité du lieu.
    fireEvent.click(screen.getAllByLabelText('Classe A')[0]);
    expect(onChange).toHaveBeenCalledWith(['g1']);
  });

  it('n’affiche aucun bloc groupes quand la liste n’a pas chargé', () => {
    // Repli volontaire : un réglage de confidentialité ne doit pas devenir inaccessible
    // parce qu'une liste annexe a échoué — les rôles restent utilisables.
    render(
      <LocationAudienceFields
        visibleRoleSlugs={[]}
        restrictedNoteRoleSlugs={[]}
        groupOptions={[]}
      />,
    );
    expect(screen.queryByText('…ou membres de ces groupes')).toBeNull();
    expect(screen.getAllByLabelText('Administrateur').length).toBeGreaterThan(0);
  });

  it('normalise une liste de groupes venue de l’API', () => {
    expect(normalizeAudienceGroupList('["g2","g1","g2"]')).toEqual(['g2', 'g1']);
    expect(normalizeAudienceGroupList('g1 ; g2')).toEqual(['g1', 'g2']);
    expect(normalizeAudienceGroupList(null)).toEqual([]);
    expect(normalizeAudienceGroupList(['x'.repeat(65), 'ok'])).toEqual(['ok']);
  });

  it('un lien réservé à un groupe porte le cadenas et résume son audience', () => {
    render(
      <LocationLinksFields
        links={[{ label: 'Doc', url: 'https://a.org', audience_group_ids: ['g1'] }]}
        onChange={vi.fn()}
        groupOptions={GROUP_OPTIONS}
      />,
    );
    expect(screen.getByTitle('Lien réservé')).toBeTruthy();
    expect(screen.getByText('Classe A', { selector: 'strong' })).toBeTruthy();
  });

  it('un lien sans audience annonce qu’il suit le lieu', () => {
    render(
      <LocationLinksFields
        links={[{ label: 'Doc', url: 'https://a.org' }]}
        onChange={vi.fn()}
        groupOptions={GROUP_OPTIONS}
      />,
    );
    expect(screen.getByText('visible par tous ceux qui voient le lieu')).toBeTruthy();
    expect(screen.queryByTitle('Lien réservé')).toBeNull();
  });

  it('conserve les groupes dans la charge d’enregistrement', () => {
    expect(
      buildLocationLinksPayload([
        { label: 'A', url: 'https://a.org', audience_group_ids: ['g1', 'g1'] },
      ]),
    ).toEqual([
      { label: 'A', url: 'https://a.org', audience_role_slugs: [], audience_group_ids: ['g1'] },
    ]);
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
