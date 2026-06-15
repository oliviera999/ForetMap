import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const armNativeFilePickerGuard = vi.fn();
const disarmNativeFilePickerGuard = vi.fn();
vi.mock('../../src/utils/overlayHistory', () => ({
  armNativeFilePickerGuard: (...args) => armNativeFilePickerGuard(...args),
  disarmNativeFilePickerGuard: (...args) => disarmNativeFilePickerGuard(...args),
}));

import { ObservationPhotoField } from '../../src/components/ObservationPhotoField.jsx';

function renderField(overrides = {}) {
  const galleryFileRef = React.createRef();
  const cameraFileRef = React.createRef();
  const props = {
    preview: null,
    galleryFileRef,
    cameraFileRef,
    onFile: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  return { ...render(<ObservationPhotoField {...props} />), props };
}

describe('ObservationPhotoField', () => {
  beforeEach(() => {
    armNativeFilePickerGuard.mockClear();
    disarmNativeFilePickerGuard.mockClear();
  });

  test('sans aperçu → rend la zone d’upload avec les deux boutons', () => {
    const { container } = renderField();
    expect(container.querySelector('.img-upload-area--split')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📁 Choisir une photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📸 Prendre une photo' })).toBeTruthy();
    expect(container.querySelector('.img-preview-wrap')).toBeNull();
  });

  test('clic « Choisir une photo » arme le garde et clique l’input galerie', () => {
    const { props } = renderField();
    const clickSpy = vi.spyOn(props.galleryFileRef.current, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '📁 Choisir une photo' }));
    expect(armNativeFilePickerGuard).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('changement de fichier désarme le garde et remonte l’événement', () => {
    const { container, props } = renderField();
    const input = container.querySelector('input[type="file"]:not([capture])');
    fireEvent.change(input, { target: { files: [] } });
    expect(disarmNativeFilePickerGuard).toHaveBeenCalledTimes(1);
    expect(props.onFile).toHaveBeenCalledTimes(1);
  });

  test('avec aperçu → rend l’image et le bouton de suppression', () => {
    const { container, props } = renderField({ preview: 'data:image/png;base64,xxx' });
    expect(container.querySelector('.img-preview-wrap')).toBeTruthy();
    expect(screen.getByAltText('preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(props.onRemove).toHaveBeenCalledTimes(1);
  });
});
