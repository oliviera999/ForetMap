import { describe, test, expect } from 'vitest';
import {
  tutorialPreviewPayload,
  tutorialPreviewCanEmbed,
} from '../src/components/TutorialPreviewModal.jsx';

/**
 * Table de vérité de l'aiguillage d'aperçu (Lot 3 de l'audit glossaire, constat A2) :
 * tout contenu local doit passer par `/api/tutorials/:id/view`, seul chemin qui pose les
 * auto-liens de glossaire — sauf un fichier local non HTML, que `/view` ne sait pas rendre.
 */
describe('tutorialPreviewPayload — aiguillage de preview_url', () => {
  test('type html : contenu en base → /view', () => {
    const p = tutorialPreviewPayload({ id: 3, type: 'html', html_content: '<p>x</p>' });
    expect(p.preview_url).toBe('/api/tutorials/3/view');
  });

  test('type link : site externe inchangé', () => {
    const p = tutorialPreviewPayload({
      id: 4,
      type: 'link',
      source_url: ' https://example.org/fiche ',
    });
    expect(p.preview_url).toBe('https://example.org/fiche');
  });

  test('type inconnu + fichier .html local → /view (et non le statique /tutos/)', () => {
    const p = tutorialPreviewPayload({
      id: 5,
      type: 'fiche',
      source_file_path: '/tutos/fiche-sol-punk.html',
    });
    expect(p.preview_url).toBe('/api/tutorials/5/view');
  });

  test('type inconnu + fichier .htm local → /view', () => {
    const p = tutorialPreviewPayload({ id: 6, type: 'file', source_file_path: '/tutos/vieux.HTM' });
    expect(p.preview_url).toBe('/api/tutorials/6/view');
  });

  test('type inconnu + fichier .pdf → chemin statique conservé', () => {
    const p = tutorialPreviewPayload({
      id: 7,
      type: 'pdf',
      source_file_path: '/tutos/guide-jardin.pdf',
    });
    expect(p.preview_url).toBe('/tutos/guide-jardin.pdf');
  });

  test('type inconnu sans fichier → /view', () => {
    const p = tutorialPreviewPayload({ id: 8, type: 'autre', source_file_path: null });
    expect(p.preview_url).toBe('/api/tutorials/8/view');
  });

  test('id manquant ou objet nul → null', () => {
    expect(tutorialPreviewPayload(null)).toBeNull();
    expect(tutorialPreviewPayload({ type: 'html' })).toBeNull();
    expect(tutorialPreviewPayload({ id: null, type: 'html' })).toBeNull();
  });

  test('type html avec un fichier non HTML : le fichier reste servi tel quel', () => {
    const p = tutorialPreviewPayload({ id: 9, type: 'html', source_file_path: '/tutos/plan.pdf' });
    expect(p.preview_url).toBe('/tutos/plan.pdf');
  });

  test('chemin sans extension ou avec query : /view tente le rendu', () => {
    expect(
      tutorialPreviewPayload({ id: 10, type: 'fiche', source_file_path: '/tutos/fiche' })
        .preview_url,
    ).toBe('/api/tutorials/10/view');
    expect(
      tutorialPreviewPayload({ id: 11, type: 'fiche', source_file_path: '/tutos/fiche.html?v=2' })
        .preview_url,
    ).toBe('/api/tutorials/11/view');
  });

  test('les autres champs du tutoriel sont préservés', () => {
    const t = { id: 12, type: 'fiche', title: 'Sol vivant', source_file_path: '/tutos/sol.html' };
    expect(tutorialPreviewPayload(t)).toMatchObject({
      ...t,
      preview_url: '/api/tutorials/12/view',
    });
  });
});

describe('tutorialPreviewCanEmbed — cohérence avec l’aiguillage', () => {
  test('tout contenu local est affichable', () => {
    expect(
      tutorialPreviewCanEmbed({ id: 5, type: 'fiche', source_file_path: '/tutos/a.html' }),
    ).toBe(true);
    expect(tutorialPreviewCanEmbed({ id: 7, type: 'pdf', source_file_path: '/tutos/a.pdf' })).toBe(
      true,
    );
    expect(tutorialPreviewCanEmbed({ id: 8, type: 'html' })).toBe(true);
  });

  test('lien externe sans URL : rien à afficher', () => {
    expect(tutorialPreviewCanEmbed({ id: 4, type: 'link', source_url: '  ' })).toBe(false);
    expect(tutorialPreviewCanEmbed({ id: 4, type: 'link', source_url: 'https://x.test' })).toBe(
      true,
    );
  });

  test('tutoriel invalide : non affichable', () => {
    expect(tutorialPreviewCanEmbed(null)).toBe(false);
    expect(tutorialPreviewCanEmbed({ type: 'html' })).toBe(false);
  });
});
