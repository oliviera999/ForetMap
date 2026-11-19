import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit ForetMap du 19/11/2026, lot 8, C7 : le téléversement d'une photo d'espèce incrémente
// la révision de la fiche ; le formulaire doit passer par la session d'édition du parent et
// en adopter la révision, sinon son enregistrement suivant est pris pour un conflit.

const apiMock = vi.fn();
vi.mock('../src/services/api', () => ({ api: (...args) => apiMock(...args) }));

const { uploadPlantPhotoRequest } = await import('../src/components/biodiv/plantPhotoUpload.js');
const { createEditRevisionSession, withExpectedRevision } =
  await import('../src/utils/editRevision.js');

describe('uploadPlantPhotoRequest', () => {
  beforeEach(() => apiMock.mockReset());

  it('passe par le parent quand il fournit onUploadPhoto', async () => {
    const onUploadPhoto = vi.fn(async () => ({ url: '/uploads/x.jpg', edit_revision: 4 }));
    const body = { field: 'photo', imageData: 'data:', position: 'prepend' };
    const res = await uploadPlantPhotoRequest(7, body, onUploadPhoto);
    expect(onUploadPhoto).toHaveBeenCalledWith(7, body);
    expect(apiMock).not.toHaveBeenCalled();
    expect(res.edit_revision).toBe(4);
  });

  it('appelle directement la route sans parent (création de fiche)', async () => {
    apiMock.mockResolvedValue({ url: '/uploads/y.jpg' });
    await uploadPlantPhotoRequest(9, { field: 'photo_leaf', imageData: 'data:' });
    expect(apiMock).toHaveBeenCalledWith('/api/plants/9/photo-upload', 'POST', {
      field: 'photo_leaf',
      imageData: 'data:',
    });
  });

  it('la révision adoptée après envoi est celle du prochain enregistrement', async () => {
    const session = createEditRevisionSession(3);
    // Ce que fait le parent (`foretmap-views.jsx`) : envoi en file, révision adoptée.
    const onUploadPhoto = (plantId, body) =>
      session.enqueue(async () => {
        const saved = { url: '/uploads/z.jpg', edit_revision: 4 };
        session.noteRevision(saved.edit_revision);
        return saved;
      });
    await uploadPlantPhotoRequest(1, { field: 'photo', imageData: 'data:' }, onUploadPhoto);
    const sent = [];
    await session.save(async (expected) => {
      sent.push(withExpectedRevision({ name: 'x' }, expected));
      return { edit_revision: 5 };
    });
    expect(sent[0].expected_revision).toBe(4);
  });
});
