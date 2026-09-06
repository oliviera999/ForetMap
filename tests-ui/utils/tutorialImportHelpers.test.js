// @vitest-environment node
import { describe, test, expect } from 'vitest';

import {
  tutorialImportMatchReasonLabel,
  tutorialImportStatusLabel,
  firstImportErrorMessage,
  emptyImportExplanation,
} from '../../src/utils/tutorialImportHelpers.js';

/**
 * Libellés et messages de la fenêtre « Importer /tutos/ ». Le bouton d'import ne doit
 * jamais rester inerte sans explication : chaque cas d'inaction a ici son message.
 */
describe('tutorialImportHelpers', () => {
  test('chaque critère de rapprochement a un libellé lisible', () => {
    expect(tutorialImportMatchReasonLabel('source_file_path')).toMatch(/chemin/);
    expect(tutorialImportMatchReasonLabel('content')).toMatch(/contenu/);
    expect(tutorialImportMatchReasonLabel('slug')).toMatch(/identifiant/);
    expect(tutorialImportMatchReasonLabel('title')).toMatch(/titre/);
    expect(tutorialImportMatchReasonLabel('filename_stem')).toMatch(/nom de fichier/);
    expect(tutorialImportMatchReasonLabel('inconnu')).toBe('déjà en base');
  });

  test('les statuts du rapport sont traduits', () => {
    expect(tutorialImportStatusLabel('pending')).toBe('À importer');
    expect(tutorialImportStatusLabel('already_imported')).toBe('Déjà en base');
    expect(tutorialImportStatusLabel('imported')).toBe('Importée');
    expect(tutorialImportStatusLabel('error')).toBe('Erreur');
  });

  test('un import en échec cite le fichier et l’erreur du serveur', () => {
    const report = {
      items: [
        { filename: 'a.html', status: 'imported' },
        { filename: 'b.html', status: 'error', error: 'Insertion impossible' },
        { filename: 'c.html', status: 'error', error: 'Lecture impossible' },
      ],
    };
    const message = firstImportErrorMessage(report, 2);
    expect(message).toContain('b.html');
    expect(message).toContain('Insertion impossible');
    expect(message).toContain('1 autre(s)');
  });

  test('un échec sans détail reste explicite', () => {
    expect(firstImportErrorMessage({ items: [] }, 3)).toContain('3 fiche(s)');
    expect(firstImportErrorMessage(null, 0)).toMatch(/Import impossible/);
  });

  test('l’absence de fiche à importer est expliquée selon le contenu du dossier', () => {
    expect(emptyImportExplanation({ totals: { on_disk: 0, errors: 0 } })).toMatch(
      /aucun fichier \.html/,
    );
    expect(emptyImportExplanation({ totals: { on_disk: 2, errors: 2 } })).toMatch(
      /Aucune fiche lisible/,
    );
    expect(emptyImportExplanation({ totals: { on_disk: 3, errors: 0 } })).toMatch(
      /correspondent déjà à un tutoriel en base/,
    );
  });
});
