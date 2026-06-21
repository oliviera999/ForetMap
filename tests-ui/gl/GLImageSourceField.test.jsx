/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLImageSourceField } from '../../src/gl/components/GLImageSourceField.jsx';

describe('GLImageSourceField', () => {
  it('affiche URL, galerie et appareil photo', () => {
    render(
      <GLImageSourceField
        label="Image de carte"
        url="/maps/test.svg"
        onUrlChange={vi.fn()}
        onPickFile={vi.fn()}
      />,
    );
    expect(screen.getByText('Image de carte')).toBeTruthy();
    expect(screen.getByDisplayValue('/maps/test.svg')).toBeTruthy();
    expect(screen.getByText('📁 Galerie / fichier')).toBeTruthy();
    expect(screen.getByText('📸 Appareil photo')).toBeTruthy();
  });

  it('accepte une URL relative sans bloquer la validation du formulaire', () => {
    render(
      <form data-testid="form">
        <GLImageSourceField
          url="/uploads/gl_chapters_maps/test.jpg"
          onUrlChange={vi.fn()}
          onPickFile={vi.fn()}
        />
      </form>,
    );
    const input = screen.getByDisplayValue('/uploads/gl_chapters_maps/test.jpg');
    expect(input.getAttribute('type')).toBe('text');
    expect(input.validity.valid).toBe(true);
  });

  it('appelle onPickFile quand un fichier est choisi', () => {
    const onPickFile = vi.fn();
    const { container } = render(
      <GLImageSourceField url="" onUrlChange={vi.fn()} onPickFile={onPickFile} />,
    );
    const input = container.querySelector('input[type="file"]:not([capture])');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPickFile).toHaveBeenCalledWith(file);
  });
});
