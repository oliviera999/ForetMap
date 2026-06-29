import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotPackWysiwygEditor from '../../src/components/MascotPackWysiwygEditor.jsx';

function buildPack() {
  return {
    mascotPackVersion: 2,
    id: 'test-pack',
    label: 'Test',
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/test-pack/',
    frameWidth: 64,
    frameHeight: 64,
    fallbackSilhouette: 'gnome',
    stateFrames: {
      idle: { files: ['idle-0.png'], fps: 8 },
      cast_spell: { files: ['cast-0.png'], fps: 6 },
    },
    customStates: [{ key: 'cast_spell', label: 'Incantation' }],
  };
}

describe('MascotPackWysiwygEditor — aperçu forme unifiée states[]', () => {
  test('affiche la forme unifiée states[] du pack (lecture seule)', () => {
    const { container } = render(
      <MascotPackWysiwygEditor pack={buildPack()} onPackChange={vi.fn()} hidePreview />,
    );
    expect(screen.getByText(/Forme unifiée/)).toBeTruthy();
    const pre = container.querySelector('.mascot-pack-wysiwyg__unified-json');
    expect(pre).toBeTruthy();
    const json = JSON.parse(pre.textContent);
    expect(Array.isArray(json.states)).toBe(true);
    // Forme canonique convertie : pas de stateFrames/customStates dans l'aperçu unifié.
    expect(json.stateFrames).toBeUndefined();
    expect(json.customStates).toBeUndefined();
    const cast = json.states.find((s) => s.key === 'cast_spell');
    expect(cast.label).toBe('Incantation');
    expect(cast.files).toEqual(['cast-0.png']);
  });

  test('le bouton Copier ne casse pas sans presse-papiers disponible', () => {
    const { container } = render(
      <MascotPackWysiwygEditor pack={buildPack()} onPackChange={vi.fn()} hidePreview />,
    );
    const scope = container.querySelector('.mascot-pack-wysiwyg__unified');
    const copyBtn = [...scope.querySelectorAll('button')].find((b) => b.textContent === 'Copier');
    expect(copyBtn).toBeTruthy();
    expect(() => fireEvent.click(copyBtn)).not.toThrow();
  });
});
