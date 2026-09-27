import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';
import { EMPTY_PLANT_FORM } from '../../../src/utils/plantFormValues.js';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('../../../src/shared/platform/image', () => ({
  compressImageWithPreset: vi.fn(async () => 'data:image/jpeg;base64,XXX'),
}));
vi.mock('../../../src/shared/platform/overlayHistory', () => ({
  armNativeFilePickerGuard: vi.fn(),
  disarmNativeFilePickerGuard: vi.fn(),
}));
// Panneaux déjà testés isolément : neutralisés pour cibler le formulaire seul.
vi.mock('../../../src/components/biodiv/PlantnetIdentifyPanel.jsx', () => ({
  PlantnetIdentifyPanel: () => <div data-testid="plantnet-panel" />,
}));
vi.mock('../../../src/components/biodiv/PlantPrefillPanel.jsx', () => ({
  PlantPrefillPanel: () => <div data-testid="prefill-panel" />,
}));

import { PlantEditForm } from '../../../src/components/biodiv/PlantEditForm.jsx';

function setup(overrides = {}) {
  const props = {
    title: 'Modifier — Pommier',
    form: { ...EMPTY_PLANT_FORM },
    setForm: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    saving: false,
    plantId: 42,
    onToast: vi.fn(),
    ...overrides,
  };
  render(<PlantEditForm {...props} />);
  return props;
}

/** Emplacement photo (`fieldset`) dont la légende est `label`. */
function photoKindGroup(fieldLabel) {
  return screen.getByText(fieldLabel, { selector: 'legend' }).closest('fieldset');
}

/** Input file caché du bouton (`Galerie` ou `Appareil photo`, icônes lucide) de l'emplacement `label`. */
function photoFileInput(buttonText, fieldLabel) {
  const btn = Array.from(photoKindGroup(fieldLabel).querySelectorAll('label.btn')).find((l) =>
    l.textContent.includes(buttonText),
  );
  return btn.querySelector('input[type=file]');
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

// Formulaire complet (≈ 300 champs et boutons) : les requêtes par rôle y coûtent 2 à 3 s
// seules, davantage quand toute la suite tourne en parallèle — délai relevé en conséquence.
describe('PlantEditForm', { timeout: 20000 }, () => {
  test('rend le titre, les champs principaux, les panneaux et les actions', () => {
    setup();
    expect(screen.getByText('Modifier — Pommier')).toBeInTheDocument();
    expect(screen.getByText('Nom *')).toBeInTheDocument();
    expect(screen.getByText('Nom scientifique')).toBeInTheDocument();
    expect(screen.getByTestId('plantnet-panel')).toBeInTheDocument();
    expect(screen.getByTestId('prefill-panel')).toBeInTheDocument();
    expect(screen.getByText('Photo espèce', { selector: 'legend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
    expect(screen.getByText('Annuler')).toBeInTheDocument();
  });

  test('saisie du nom et clic emoji → setForm (updater fonctionnel)', () => {
    // L'updater lit e.target.value : on l'applique pendant l'événement (input contrôlé).
    let applied = null;
    const setForm = vi.fn((updater) => {
      applied = updater({ ...EMPTY_PLANT_FORM });
    });
    setup({ setForm });
    fireEvent.change(screen.getByPlaceholderText('Ex: Aubergine'), {
      target: { value: 'Pommier' },
    });
    expect(setForm).toHaveBeenCalled();
    expect(applied).toMatchObject({ name: 'Pommier' });

    const emojiBtn = document.querySelector('.emoji-row .emoji-btn');
    fireEvent.click(emojiBtn);
    expect(applied.emoji).toBe(emojiBtn.textContent);
  });

  test('chaque libellé nomme son champ (audit du 25/09/2026, § 1.4.7)', () => {
    setup({
      form: {
        ...EMPTY_PLANT_FORM,
        map_ids: ['m1'],
        photos: [{ kind: 'photo_species', url: 'https://x.fr/a.jpg', credit: '', licence: '' }],
      },
      maps: [{ id: 'm1', label: 'Forêt' }],
    });
    // Champs simples et listes : association `htmlFor`/`id`.
    expect(screen.getByLabelText('Nom *')).toHaveAttribute('placeholder', 'Ex: Aubergine');
    expect(screen.getByLabelText('Emoji')).toHaveAttribute('placeholder', 'ou colle un emoji');
    expect(screen.getByLabelText('Nom scientifique').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Milieu').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Niveau de danger').tagName).toBe('SELECT');
    // Remarques : une seule zone de texte (migration 305).
    expect(screen.getByLabelText('Remarques').tagName).toBe('TEXTAREA');
    expect(screen.queryByLabelText('Remarque 3')).not.toBeInTheDocument();
    // Photos : une ligne par photo, lien + auteur + licence, chacun nommé avec sa position.
    expect(screen.getByLabelText('Lien de l’image — Photo espèce, photo 1').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Auteur (crédit) — Photo espèce, photo 1').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Licence — Photo espèce, photo 1').tagName).toBe('INPUT');
    // Éditeur riche : `role="textbox"` nommé par `aria-labelledby`.
    for (const name of [
      "Description d'identification",
      'Quel danger, et quoi faire',
      "Rôle dans l'écosystème",
      'Sources',
      'Notes de site — Forêt',
    ]) {
      expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
    }
    // Groupes de cases : nommés par leur libellé.
    for (const name of ['Présente sur ces cartes', 'Voies d’exposition', 'Risques identifiés']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }

    // Balayage : aucun `<label>` orphelin, aucun champ visible sans nom.
    const form = document.querySelector('.plant-edit-form');
    const orphans = [...form.querySelectorAll('label')].filter((label) => {
      if (label.querySelector('input, select, textarea')) return false;
      const target = label.htmlFor && document.getElementById(label.htmlFor);
      return !target;
    });
    expect(orphans.map((l) => l.textContent)).toEqual([]);
    const unnamed = [...form.querySelectorAll('input, select, textarea, [role="textbox"]')]
      .filter((control) => control.type !== 'file' && control.type !== 'hidden')
      .filter(
        (control) =>
          !(control.labels && control.labels.length) &&
          !control.getAttribute('aria-label') &&
          !control.getAttribute('aria-labelledby'),
      );
    expect(unnamed.map((c) => c.outerHTML.slice(0, 80))).toEqual([]);
  });

  test('boutons Enregistrer/Annuler câblés ; Enregistrer désactivé pendant saving', () => {
    const { onSave, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Annuler'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('appareil photo sur « Photo (générale) » → POST photo-upload en prepend + toast', async () => {
    api.mockResolvedValueOnce({ url: '/uploads/p.jpg' });
    let applied = null;
    const setForm = vi.fn((updater) => {
      applied = updater({
        ...EMPTY_PLANT_FORM,
        photos: [{ kind: 'photo', url: 'https://x.fr/old.jpg', credit: 'Anne', licence: 'CC0' }],
      });
    });
    const { onToast } = setup({ setForm });
    const input = photoFileInput('Appareil photo', 'Photo (générale)');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/42/photo-upload', 'POST', {
        field: 'photo',
        imageData: 'data:image/jpeg;base64,XXX',
        position: 'prepend',
      });
    });
    expect(onToast).toHaveBeenCalledWith(
      'Photo importée ✓ — pense à indiquer son auteur et sa licence.',
    );
    expect(setForm).toHaveBeenCalled();
    // La photo téléversée passe en tête de la liste « photo », sans attribution.
    expect(applied.photos.map((p) => [p.kind, p.url, p.credit])).toEqual([
      ['photo', '/uploads/p.jpg', ''],
      ['photo', 'https://x.fr/old.jpg', 'Anne'],
    ]);
  });

  test('photos : saisie de l’auteur, ajout d’un lien et retrait → liste mise à jour', () => {
    let applied = null;
    const photos = [
      { kind: 'photo_leaf', url: 'https://x.fr/l.jpg', credit: '', licence: '' },
      { kind: 'photo_fruit', url: 'https://x.fr/f.jpg', credit: 'Bob', licence: 'CC0' },
    ];
    const setForm = vi.fn((updater) => {
      applied = updater({ ...EMPTY_PLANT_FORM, photos });
    });
    setup({ setForm, form: { ...EMPTY_PLANT_FORM, photos } });
    fireEvent.change(screen.getByLabelText('Auteur (crédit) — Photo feuille, photo 1'), {
      target: { value: 'Anne' },
    });
    expect(applied.photos[0]).toMatchObject({ kind: 'photo_leaf', credit: 'Anne' });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un lien — Photo fleur' }));
    expect(applied.photos).toHaveLength(3);
    expect(applied.photos[2]).toMatchObject({ kind: 'photo_flower', url: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer — Photo fruit, photo 1' }));
    expect(applied.photos.map((p) => p.kind)).toEqual(['photo_leaf']);
  });

  test('sosies : ajout d’une ligne, choix de la fiche et note → liste mise à jour', () => {
    let applied = null;
    const base = { ...EMPTY_PLANT_FORM, lookalikes: [{ plant_id: '', note: '' }] };
    const setForm = vi.fn((updater) => {
      applied = updater(base);
    });
    setup({ setForm, form: base });
    fireEvent.change(screen.getByLabelText('Ce qui permet de les distinguer — sosie 1'), {
      target: { value: 'Latex amer' },
    });
    expect(applied.lookalikes[0]).toMatchObject({ note: 'Latex amer' });
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un sosie' }));
    expect(applied.lookalikes).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer — sosie 1' }));
    expect(applied.lookalikes).toEqual([]);
  });

  test('upload sans plantId ni onEnsurePlantId → toast de garde, aucun appel serveur', async () => {
    const { onToast } = setup({ plantId: null });
    const input = photoFileInput('Appareil photo', 'Photo espèce');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith("Crée d'abord la fiche, puis ajoute les photos.");
    });
    expect(api).not.toHaveBeenCalled();
  });

  test('galerie multi-fichiers → répartition sur les champs suivants + toast pluriel', async () => {
    const { onToast } = setup();
    const input = photoFileInput('Galerie', 'Photo espèce');
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('2 photos importées ✓'));
    expect(api).toHaveBeenNthCalledWith(
      1,
      '/api/plants/42/photo-upload',
      'POST',
      expect.objectContaining({ field: 'photo_species', position: 'append' }),
    );
    expect(api).toHaveBeenNthCalledWith(
      2,
      '/api/plants/42/photo-upload',
      'POST',
      expect.objectContaining({ field: 'photo_leaf', position: 'append' }),
    );
  });
});
