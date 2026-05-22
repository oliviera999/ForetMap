import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { compressImage } from '../../utils/image.js';
import { GLChapterMapEditor } from './GLChapterMapEditor.jsx';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';

const EMPTY_CHAPTER_FORM = {
  slug: '',
  title: '',
  biome: '',
  mapImageUrl: '',
  storyMarkdown: '',
  biotopeMarkdown: '',
  biocenoseMarkdown: '',
  orderIndex: 0,
};

export function GLChaptersAdminView() {
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [chapterForm, setChapterForm] = useState(EMPTY_CHAPTER_FORM);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [uploadingMapImage, setUploadingMapImage] = useState(false);
  const previewMapGestures = useGlPctMapGestures();

  async function loadChapters() {
    try {
      const list = await apiGL('/api/gl/chapters');
      const rows = Array.isArray(list) ? list : [];
      setChapters(rows);
      setError('');
      if (selectedId && !rows.some((r) => Number(r.id) === Number(selectedId))) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      setError(err.message || 'Chargement des chapitres impossible');
    }
  }

  async function loadDetail(slug) {
    if (!slug) return;
    try {
      const data = await apiGL(`/api/gl/chapters/${encodeURIComponent(slug)}`);
      setDetail(data);
      setChapterForm({
        slug: data.chapter.slug,
        title: data.chapter.title || '',
        biome: data.chapter.biome || '',
        mapImageUrl: data.chapter.map_image_url || '',
        storyMarkdown: data.chapter.story_markdown || '',
        biotopeMarkdown: data.chapter.biotope_markdown || '',
        biocenoseMarkdown: data.chapter.biocenose_markdown || '',
        orderIndex: Number(data.chapter.order_index || 0),
      });
      setSelectedId(Number(data.chapter.id));
    } catch (err) {
      setError(err.message || 'Détail introuvable');
    }
  }

  useEffect(() => {
    loadChapters();
  }, []);

  function resetChapterForm() {
    setChapterForm(EMPTY_CHAPTER_FORM);
    setSelectedId(null);
    setDetail(null);
  }

  async function submitChapter(event) {
    event.preventDefault();
    setError('');
    setInfo('');
    const payload = { ...chapterForm, orderIndex: Number(chapterForm.orderIndex) || 0 };
    try {
      if (selectedId) {
        const data = await apiGL(`/api/gl/chapters/admin/${selectedId}`, 'PUT', payload);
        setDetail(data);
        setInfo('Chapitre mis à jour');
      } else {
        const data = await apiGL('/api/gl/chapters/admin', 'POST', payload);
        setDetail(data);
        setSelectedId(Number(data?.chapter?.id || null));
        setInfo('Chapitre créé');
      }
      await loadChapters();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    }
  }

  async function deleteChapter() {
    if (!selectedId) return;
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce chapitre ?')) return;
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/chapters/admin/${selectedId}`, 'DELETE');
      setInfo('Chapitre supprimé');
      resetChapterForm();
      await loadChapters();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  async function fetchMediaLibrary() {
    const data = await apiGL('/api/gl/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function uploadMediaLibrary(mediaData) {
    await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
    setInfo('Média ajouté à la bibliothèque');
    setError('');
  }

  async function removeMediaLibrary(relativePath) {
    await apiGL('/api/gl/admin/media-library', 'DELETE', { relative_path: relativePath });
    setInfo('Média supprimé de la bibliothèque');
    setError('');
  }

  async function uploadChapterMapImage(file) {
    if (!selectedId || !file) return;
    setUploadingMapImage(true);
    setError('');
    setInfo('');
    try {
      const imageData = await compressImage(file, 2400, 0.9);
      const data = await apiGL(`/api/gl/chapters/admin/${selectedId}/map-image`, 'POST', { image_data: imageData });
      setDetail(data);
      setChapterForm((prev) => ({ ...prev, mapImageUrl: data?.chapter?.map_image_url || prev.mapImageUrl }));
      setInfo('Image de carte importée');
    } catch (err) {
      setError(err.message || 'Upload image impossible');
    } finally {
      setUploadingMapImage(false);
    }
  }

  const markers = useMemo(() => (Array.isArray(detail?.markers) ? detail.markers : []), [detail]);

  return (
    <section className="gl-panel">
      <h2>Chapitres</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-info">{info}</p> : null}

      <div className="gl-chapters-admin-grid">
        <aside>
          <ul className="gl-chapters-admin-list">
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  className={Number(selectedId) === Number(chapter.id) ? 'is-active' : ''}
                  onClick={() => loadDetail(chapter.slug)}
                  data-chapter-id={chapter.id}
                  data-chapter-slug={chapter.slug}
                >
                  <strong>{chapter.title || chapter.slug}</strong>
                  <span className="gl-hint">{chapter.slug}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={resetChapterForm}>
            + Nouveau chapitre
          </button>
        </aside>

        <div>
          <form className="gl-form" onSubmit={submitChapter}>
            <label>
              Slug
              <input
                value={chapterForm.slug}
                onChange={(event) => setChapterForm({ ...chapterForm, slug: event.target.value })}
                disabled={Boolean(selectedId)}
                required
              />
            </label>
            <label>
              Titre
              <input
                value={chapterForm.title}
                onChange={(event) => setChapterForm({ ...chapterForm, title: event.target.value })}
                required
              />
            </label>
            <label>
              Biome
              <input
                value={chapterForm.biome}
                onChange={(event) => setChapterForm({ ...chapterForm, biome: event.target.value })}
              />
            </label>
            <label>
              Image carte (URL)
              <input
                value={chapterForm.mapImageUrl}
                onChange={(event) => setChapterForm({ ...chapterForm, mapImageUrl: event.target.value })}
              />
            </label>
            {selectedId ? (
              <div className="gl-inline-actions" style={{ marginTop: -4 }}>
                <label className="gl-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: uploadingMapImage ? 'wait' : 'pointer' }}>
                  {uploadingMapImage ? 'Envoi…' : '📁 Galerie'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={uploadingMapImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      uploadChapterMapImage(file);
                    }}
                  />
                </label>
                <label className="gl-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: uploadingMapImage ? 'wait' : 'pointer' }}>
                  {uploadingMapImage ? 'Envoi…' : '📸 Appareil photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    disabled={uploadingMapImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      uploadChapterMapImage(file);
                    }}
                  />
                </label>
              </div>
            ) : null}
            <MediaLibraryMenu
              title="Bibliothèque globale (images, audio, vidéo)"
              fetchItems={fetchMediaLibrary}
              uploadDataUrl={uploadMediaLibrary}
              removeItem={removeMediaLibrary}
              onPickUrl={(url) => setChapterForm((prev) => ({ ...prev, mapImageUrl: url }))}
            />
            {chapterForm.mapImageUrl ? (
              <div className="gl-map-url-preview">
                <p className="gl-hint">Aperçu de la carte</p>
                <GLPctMapCanvas
                  imageUrl={chapterForm.mapImageUrl}
                  imageAlt="Aperçu carte chapitre"
                  mapGestures={previewMapGestures}
                  className="gl-board gl-board--mini"
                >
                  <GLBoardMarkers markers={markers} />
                </GLPctMapCanvas>
              </div>
            ) : null}
            <label>
              Ordre
              <input
                type="number"
                value={chapterForm.orderIndex}
                onChange={(event) => setChapterForm({ ...chapterForm, orderIndex: event.target.value })}
              />
            </label>
            <label>
              Histoire (markdown)
              <textarea
                rows={6}
                value={chapterForm.storyMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, storyMarkdown: event.target.value })}
              />
            </label>
            <label>
              Biotope (markdown)
              <textarea
                rows={4}
                value={chapterForm.biotopeMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, biotopeMarkdown: event.target.value })}
              />
            </label>
            <label>
              Biocénose (markdown)
              <textarea
                rows={4}
                value={chapterForm.biocenoseMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, biocenoseMarkdown: event.target.value })}
              />
            </label>
            <div className="gl-inline-actions">
              <button type="submit">{selectedId ? 'Enregistrer' : 'Créer'}</button>
              {selectedId ? (
                <button type="button" className="gl-danger" onClick={deleteChapter}>
                  Supprimer
                </button>
              ) : null}
            </div>
          </form>

          {selectedId ? (
            <>
              <h3>Repères du chapitre</h3>
              <GLChapterMapEditor
                chapterId={selectedId}
                chapterSlug={chapterForm.slug}
                mapImageUrl={chapterForm.mapImageUrl}
                markers={markers}
                onReload={loadDetail}
                onInfo={(message) => {
                  setInfo(message);
                  setError('');
                }}
                onError={(message) => {
                  setError(message);
                  setInfo('');
                }}
              />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
