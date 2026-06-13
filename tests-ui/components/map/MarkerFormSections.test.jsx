import React, { useState } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MarkerCommonFormFields,
  MarkerEmojiField,
  MarkerVisitImageBuilder,
} from '../../../src/components/map/MarkerFormSections.jsx';

const PLANTS = [
  { id: 1, name: 'Olivier', emoji: '🫒' },
  { id: 2, name: 'Tomate', emoji: '🍅' },
];

function harness(initialForm) {
  return function Harness({ children }) {
    const [form, setForm] = useState(initialForm);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    return children({ form, setForm, set });
  };
}

const EMPTY_FORM = {
  label: '', living_beings: [], note: '', emoji: '',
  visit_subtitle: '', visit_short_description: '', visit_details_title: 'Détails', visit_details_text: '',
};

describe('MarkerCommonFormFields', () => {
  test('rend tous les champs et reflète la valeur du formulaire', () => {
    const Harness = harness({ ...EMPTY_FORM, label: 'Olivier n°10' });
    render(<Harness>{(p) => <MarkerCommonFormFields {...p} plants={PLANTS} />}</Harness>);
    expect(screen.getByText('Nom du repère *')).toBeTruthy();
    expect(screen.getByDisplayValue('Olivier n°10')).toBeTruthy();
    expect(screen.getByText('Êtres vivants')).toBeTruthy();
    expect(screen.getByText('Sous-titre (visite)')).toBeTruthy();
    expect(screen.getByText('Détails dépliables (visite)')).toBeTruthy();
  });

  test('édition du nom met à jour le formulaire (set contrôlé)', () => {
    const Harness = harness({ ...EMPTY_FORM });
    render(<Harness>{(p) => <MarkerCommonFormFields {...p} plants={PLANTS} />}</Harness>);
    const input = screen.getByPlaceholderText('Ex: Olivier n°10');
    fireEvent.change(input, { target: { value: 'Pin parasol' } });
    expect(screen.getByDisplayValue('Pin parasol')).toBeTruthy();
  });

  test('catalogue d’êtres vivants masqué quand aucune sélection', () => {
    const Harness = harness({ ...EMPTY_FORM });
    const { container } = render(<Harness>{(p) => <MarkerCommonFormFields {...p} plants={PLANTS} />}</Harness>);
    // pas de panneau catalogue → seul le <select multiple> liste les options
    expect(container.querySelectorAll('option').length).toBe(PLANTS.length);
  });
});

describe('MarkerEmojiField', () => {
  test('rend la grille de suggestions et sélectionne au clic', () => {
    const Harness = harness({ ...EMPTY_FORM });
    render(<Harness>{(p) => <MarkerEmojiField id="x" {...p} markerEmojis={['🌳', '🌲']} />}</Harness>);
    const btn = screen.getByRole('button', { name: '🌳' });
    fireEvent.click(btn);
    expect(btn.className).toContain('sel');
  });

  test('htmlFor relie le label au champ via l’id fourni', () => {
    const Harness = harness({ ...EMPTY_FORM });
    const { container } = render(<Harness>{(p) => <MarkerEmojiField id="marker-edit-emoji-custom" {...p} markerEmojis={[]} />}</Harness>);
    expect(container.querySelector('label[for="marker-edit-emoji-custom"]')).toBeTruthy();
  });
});

describe('MarkerVisitImageBuilder', () => {
  test('bouton « + Bloc image » déclenche onAddImageBlock', () => {
    const onAdd = vi.fn();
    render(
      <MarkerVisitImageBuilder
        imageBlocks={[]}
        visitMediaOptions={[]}
        markerPhotoOptions={[]}
        onAddImageBlock={onAdd}
        onUpdateImageBlock={() => {}}
        onRemoveImageBlock={() => {}}
        onAssociatePhoto={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('+ Bloc image'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('rend un bloc image et « Suppr. » appelle onRemoveImageBlock avec l’id', () => {
    const onRemove = vi.fn();
    render(
      <MarkerVisitImageBuilder
        imageBlocks={[{ id: 'b1', type: 'image', media_ids: [], caption: 'Légende A' }]}
        visitMediaOptions={[{ id: 9, caption: '' }]}
        markerPhotoOptions={[]}
        onAddImageBlock={() => {}}
        onUpdateImageBlock={() => {}}
        onRemoveImageBlock={onRemove}
        onAssociatePhoto={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Légende A')).toBeTruthy();
    fireEvent.click(screen.getByText('Suppr.'));
    expect(onRemove).toHaveBeenCalledWith('b1');
  });
});
