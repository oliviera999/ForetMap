import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const compressImageWithPreset = vi.fn();
vi.mock('../../src/shared/platform/image', async (importOriginal) => ({
  ...(await importOriginal()),
  compressImageWithPreset: (...args) => compressImageWithPreset(...args),
}));

import { AttachmentImagesPicker } from '../../src/shared/components/AttachmentImagesPicker.jsx';

function pick(files) {
  const input = screen.getByLabelText(/galerie ou fichiers/);
  fireEvent.change(input, { target: { files } });
}

// Audit photos PH-M6 : les pièces jointes partaient brutes (≈ 15 Mo par photo d'appareil).
describe('AttachmentImagesPicker', () => {
  beforeEach(() => compressImageWithPreset.mockReset());

  it('compresse chaque photo avec le préréglage « attachment » avant de la retenir', async () => {
    compressImageWithPreset.mockResolvedValue('data:image/jpeg;base64,AAAA');
    const onChange = vi.fn();
    render(<AttachmentImagesPicker value={[]} onChange={onChange} />);
    pick([new File(['x'], 'photo.png', { type: 'image/png' })]);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['data:image/jpeg;base64,AAAA']));
    expect(compressImageWithPreset).toHaveBeenCalledWith(expect.any(File), 'attachment');
  });

  it('HEIC illisible : message explicite au lieu d’un rejet muet', async () => {
    // Décodage impossible : le canvas ne rend pas d'image exploitable.
    compressImageWithPreset.mockResolvedValue('data:,');
    const onChange = vi.fn();
    const onNotify = vi.fn();
    render(<AttachmentImagesPicker value={[]} onChange={onChange} onNotify={onNotify} />);
    pick([new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' })]);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onNotify.mock.calls[0][0]).toMatch(/HEIC/);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('fichier non image : signalé, jamais envoyé à la compression', async () => {
    const onNotify = vi.fn();
    render(<AttachmentImagesPicker value={[]} onChange={vi.fn()} onNotify={onNotify} />);
    pick([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
    expect(compressImageWithPreset).not.toHaveBeenCalled();
  });
});
