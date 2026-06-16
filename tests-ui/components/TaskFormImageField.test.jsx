import React, { createRef } from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskFormImageField } from '../../src/components/tasks/TaskFormImageField.jsx';

const armGuard = vi.fn();
vi.mock('../../src/utils/overlayHistory', () => ({
  armNativeFilePickerGuard: (...args) => armGuard(...args),
}));

function renderField(props = {}) {
  const galleryInputRef = createRef();
  const cameraInputRef = createRef();
  const onFile = vi.fn();
  const onClear = vi.fn();
  render(
    <TaskFormImageField
      preview={null}
      busy={false}
      galleryInputRef={galleryInputRef}
      cameraInputRef={cameraInputRef}
      onFile={onFile}
      onClear={onClear}
      {...props}
    />,
  );
  return { galleryInputRef, cameraInputRef, onFile, onClear };
}

describe('TaskFormImageField', () => {
  beforeEach(() => armGuard.mockClear());

  test('zone d’upload : deux boutons galerie / appareil photo', () => {
    renderField();
    expect(screen.getByRole('button', { name: '📁 Choisir une photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📸 Prendre une photo' })).toBeTruthy();
  });

  test('clic galerie : arme le guard et déclenche l’input', () => {
    const { galleryInputRef } = renderField();
    const click = vi.spyOn(galleryInputRef.current, 'click');
    fireEvent.click(screen.getByRole('button', { name: '📁 Choisir une photo' }));
    expect(armGuard).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
  });

  test('busy : boutons désactivés et libellé « Traitement… »', () => {
    renderField({ busy: true });
    expect(screen.getByText('Traitement…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📁 Choisir une photo' }).disabled).toBe(true);
  });

  test('changement d’input : appelle onFile', () => {
    const { onFile } = renderField();
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [] } });
    expect(onFile).toHaveBeenCalled();
  });

  test('aperçu présent : image + bouton retirer (onClear)', () => {
    const { onClear } = renderField({ preview: 'data:img' });
    expect(screen.getByAltText('Aperçu photo tâche')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la photo' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
