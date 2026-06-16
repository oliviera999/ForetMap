import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TutorialEditorPanel } from '../../../src/components/tutorials/TutorialEditorPanel.jsx';
import { createInitialTutorialForm } from '../../../src/utils/tutorialListHelpers.js';

const MAPS = [
  { id: 'foret', label: 'Forêt' },
  { id: 'jardin', label: 'Jardin' },
];
const ZONES = [
  { id: 'z1', name: 'Mare', map_id: 'foret' },
  { id: 'z2', name: 'Potager', map_id: 'jardin' },
  { id: 'z3', name: 'Spéciale', map_id: 'foret', special: true },
];
const MARKERS = [{ id: 'm1', label: 'Ruche', emoji: '🐝', map_id: 'foret' }];

function renderPanel(formOverrides = {}, propsOverrides = {}) {
  const form = { ...createInitialTutorialForm(), ...formOverrides };
  const handlers = {
    // Évalue l'updater dès l'appel (avant que React ne resynchronise l'input contrôlé).
    setForm: vi.fn((updater) => (typeof updater === 'function' ? updater(form) : updater)),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onToast: vi.fn(),
  };
  render(
    <TutorialEditorPanel
      form={form}
      saving={false}
      maps={MAPS}
      zones={ZONES}
      markers={MARKERS}
      {...handlers}
      {...propsOverrides}
    />,
  );
  return { form, handlers };
}

/** Résultat du dernier appel à setForm (updater déjà appliqué à `form` au moment de l'appel). */
function lastFormUpdate(setForm) {
  return setForm.mock.results.at(-1).value;
}

/** Contrôle (input/select/textarea) du bloc `.field` dont le label affiche `labelText`. */
function fieldControl(labelText, selector = 'input') {
  return screen.getByText(labelText).parentElement.querySelector(selector);
}

describe('TutorialEditorPanel', () => {
  test('titre selon création / édition', () => {
    renderPanel();
    expect(screen.getByText('Nouveau tutoriel')).toBeTruthy();
  });

  test('mode édition : titre « Modifier » + case « Tutoriel actif » visible', () => {
    renderPanel({ id: 7, is_active: true });
    expect(screen.getByText('Modifier le tutoriel')).toBeTruthy();
    expect(screen.getByLabelText('Tutoriel actif')).toBeTruthy();
  });

  test('saisie du titre : setForm met à jour le champ title', () => {
    const { form, handlers } = renderPanel();
    fireEvent.change(fieldControl('Titre *'), { target: { value: 'Greffe' } });
    expect(lastFormUpdate(handlers.setForm).title).toBe('Greffe');
  });

  test('sans filtre carte : zones non spéciales + repères listés ; cocher une zone l’ajoute', () => {
    const { form, handlers } = renderPanel();
    expect(screen.getByText('Mare')).toBeTruthy();
    expect(screen.getByText('Potager')).toBeTruthy();
    expect(screen.queryByText(/Spéciale/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Mare'));
    expect(lastFormUpdate(handlers.setForm).zone_ids).toEqual(['z1']);
  });

  test('changement de carte : map_id mis à jour et lieux hors carte décochés', () => {
    const { form, handlers } = renderPanel({ zone_ids: ['z1', 'z2'], marker_ids: ['m1'] });
    fireEvent.change(fieldControl('Carte (filtre zones / repères)', 'select'), {
      target: { value: 'jardin' },
    });
    const next = lastFormUpdate(handlers.setForm);
    expect(next.map_id).toBe('jardin');
    expect(next.zone_ids).toEqual(['z2']);
    expect(next.marker_ids).toEqual([]);
  });

  test('filtre carte jardin : aucun repère, message vide absent, zone de la carte seule listée', () => {
    renderPanel({ map_id: 'jardin' });
    expect(screen.getByText('Potager')).toBeTruthy();
    expect(screen.queryByText('Mare')).toBeNull();
    expect(screen.queryByText(/Ruche/)).toBeNull();
  });

  test('type html : champs HTML ; type link : champ URL', () => {
    renderPanel();
    expect(fieldControl('Contenu HTML', 'textarea')).toBeTruthy();
    expect(screen.queryByText('URL')).toBeNull();
  });

  test('type link : champ URL affiché, contenu HTML masqué', () => {
    renderPanel({ type: 'link' });
    expect(fieldControl('URL')).toBeTruthy();
    expect(screen.queryByText('Contenu HTML')).toBeNull();
  });

  test('boutons : Enregistrer → onSave, Annuler → onCancel, désactivé pendant la sauvegarde', () => {
    const { handlers } = renderPanel({}, { saving: true });
    const saveBtn = screen.getByRole('button', { name: 'Sauvegarde...' });
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(handlers.onCancel).toHaveBeenCalled();
  });

  test('Enregistrer appelle onSave quand saving=false', () => {
    const { handlers } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '💾 Enregistrer' }));
    expect(handlers.onSave).toHaveBeenCalled();
  });
});
