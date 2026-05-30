import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { compressImage, isLikelyImageFile } from '../../utils/image.js';
import { GLChapterMapEditor } from './GLChapterMapEditor.jsx';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';
import { GLImageSourceField } from './GLImageSourceField.jsx';
import { GLImageFrameEditor } from './GLImageFrameEditor.jsx';
import { glImageFrameToStyle, normalizeGlImageFrame } from '../../utils/glImageFrame.js';
import { GLRichTextEditor } from './ui/GLRichTextEditor.jsx';
import { GLBrandColorEditor } from './GLBrandColorEditor.jsx';
import { normalizeBrand } from '../hooks/useGLBrandTheme.js';
import { brandToCssVars, mergeBrandWithChapterTheme, normalizeChapterTheme } from '../../utils/glBrandTheme.js';

const EMPTY_CHAPTER_THEME = { colors: {} };

const EMPTY_CHAPTER_FORM = {
  slug: '',
  title: '',
  biome: '',
  biomeSlugs: [],
  mapImageUrl: '',
  storyMarkdown: '',
  biotopeMarkdown: '',
  biocenoseMarkdown: '',
  orderIndex: 0,
  mapImageFrame: normalizeGlImageFrame(null, 'chapter-map'),
  theme: { ...EMPTY_CHAPTER_THEME },
};

function moveBiomeSlug(slugs, slug, direction) {
  const list = [...slugs];
  const index = list.indexOf(slug);
  if (index < 0) return list;
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  [list[index], list[target]] = [list[target], list[index]];
  return list;
}

export function GLChaptersAdminView() {
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [chapterForm, setChapterForm] = useState(EMPTY_CHAPTER_FORM);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [uploadingMapImage, setUploadingMapImage] = useState(false);
  const [pendingMapImageFile, setPendingMapImageFile] = useState(null);
  const [pendingMapPreviewUrl, setPendingMapPreviewUrl] = useState('');
  const [frameEditorOpen, setFrameEditorOpen] = useState(false);
  const [biomes, setBiomes] = useState([]);
  const [platformBrand, setPlatformBrand] = useState(null);
  const previewMapGestures = useGlPctMapGestures();

  async function loadPlatformBrand() {
    try {
      const config = await apiGL('/api/gl/auth/config');
      setPlatformBrand(normalizeBrand(config?.brand));
    } catch (_) {
      setPlatformBrand(normalizeBrand(null));
    }
  }

  async function loadBiomes() {
    try {
      const list = await apiGL('/api/gl/biomes');
      setBiomes(Array.isArray(list) ? list : []);
    } catch (_) {
      setBiomes([]);
    }
  }

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
        biomeSlugs: Array.isArray(data.chapter.biomes)
          ? data.chapter.biomes.map((b) => b.slug)
          : [],
        mapImageUrl: data.chapter.map_image_url || '',
        mapImageFrame: normalizeGlImageFrame(data.chapter.map_image_frame, 'chapter-map'),
        storyMarkdown: data.chapter.story_markdown || '',
        biotopeMarkdown: data.chapter.biotope_markdown || '',
        biocenoseMarkdown: data.chapter.biocenose_markdown || '',
        orderIndex: Number(data.chapter.order_index || 0),
        theme: normalizeChapterTheme(data.chapter.theme),
      });
      setSelectedId(Number(data.chapter.id));
      clearPendingMapImage();
    } catch (err) {
      setError(err.message || 'Détail introuvable');
    }
  }

  useEffect(() => {
    loadChapters();
    loadBiomes();
    loadPlatformBrand();
  }, []);

  function clearPendingMapImage() {
    setPendingMapImageFile(null);
    setPendingMapPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }

  function resetChapterForm() {
    setChapterForm(EMPTY_CHAPTER_FORM);
    setSelectedId(null);
    setDetail(null);
    clearPendingMapImage();
  }

  useEffect(() => () => {
    if (pendingMapPreviewUrl) URL.revokeObjectURL(pendingMapPreviewUrl);
  }, [pendingMapPreviewUrl]);

  async function submitChapter(event) {
    event.preventDefault();
    setError('');
    setInfo('');
    const payload = {
      ...chapterForm,
      mapImageFrame: normalizeGlImageFrame(chapterForm.mapImageFrame, 'chapter-map'),
      theme: normalizeChapterTheme(chapterForm.theme),
      orderIndex: Number(chapterForm.orderIndex) || 0,
    };
    try {
      let chapterId = selectedId;
      if (selectedId) {
        const data = await apiGL(`/api/gl/chapters/admin/${selectedId}`, 'PUT', payload);
        setDetail(data);
        setInfo('Chapitre mis à jour');
      } else {
        const data = await apiGL('/api/gl/chapters/admin', 'POST', payload);
        setDetail(data);
        chapterId = Number(data?.chapter?.id || null);
        setSelectedId(chapterId);
        setInfo('Chapitre créé');
      }
      if (pendingMapImageFile && chapterId) {
        await uploadChapterMapImage(pendingMapImageFile, chapterId);
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

  function queuePendingMapImage(file) {
    if (!file || !isLikelyImageFile(file)) {
      setError('Format d’image non reconnu (JPEG, PNG ou WebP).');
      return;
    }
    clearPendingMapImage();
    setPendingMapImageFile(file);
    setPendingMapPreviewUrl(URL.createObjectURL(file));
    setError('');
    setInfo(
      selectedId
        ? 'Image sélectionnée — envoi en cours…'
        : 'Image sélectionnée : elle sera envoyée lors de l’enregistrement du chapitre.'
    );
  }

  async function uploadChapterMapImage(file, chapterId = selectedId) {
    if (!file) return;
    const targetId = Number(chapterId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      queuePendingMapImage(file);
      return;
    }
    setUploadingMapImage(true);
    setError('');
    setInfo('');
    try {
      const imageData = await compressImage(file, 2400, 0.9);
      const data = await apiGL(`/api/gl/chapters/admin/${targetId}/map-image`, 'POST', { image_data: imageData });
      setDetail(data);
      setChapterForm((prev) => ({
        ...prev,
        mapImageUrl: data?.chapter?.map_image_url || prev.mapImageUrl,
        mapImageFrame: normalizeGlImageFrame(data?.chapter?.map_image_frame || prev.mapImageFrame, 'chapter-map'),
      }));
      clearPendingMapImage();
      setInfo('Image de carte importée');
    } catch (err) {
      setError(err.message || 'Upload image impossible');
    } finally {
      setUploadingMapImage(false);
    }
  }

  function handleMapImageFile(file) {
    if (!file) return;
    if (selectedId) {
      uploadChapterMapImage(file, selectedId);
    } else {
      queuePendingMapImage(file);
    }
  }

  const previewMapImageUrl = chapterForm.mapImageUrl || pendingMapPreviewUrl || '';
  const mapImagePickHint = !selectedId && pendingMapImageFile
    ? 'L’image sera importée sur le serveur à l’enregistrement du chapitre.'
    : (!selectedId ? 'Vous pouvez choisir une photo avant l’enregistrement ; l’envoi se fera à la création du chapitre.' : '');

  const markers = useMemo(() => (Array.isArray(detail?.markers) ? detail.markers : []), [detail]);
  const mapPreviewStyle = useMemo(
    () => glImageFrameToStyle(normalizeGlImageFrame(chapterForm.mapImageFrame, 'chapter-map')),
    [chapterForm.mapImageFrame]
  );
  const themePreviewStyle = useMemo(() => {
    const merged = mergeBrandWithChapterTheme(platformBrand, chapterForm.theme);
    return brandToCssVars(merged);
  }, [platformBrand, chapterForm.theme]);

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
                  {Array.isArray(chapter.biomes) && chapter.biomes.length > 0 ? (
                    <span className="gl-hint">
                      {chapter.biomes.length}
                      {' '}
                      biome(s)
                    </span>
                  ) : null}
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
              Biome (libellé libre, narratif)
              <input
                value={chapterForm.biome}
                onChange={(event) => setChapterForm({ ...chapterForm, biome: event.target.value })}
              />
              <span className="gl-hint">
                Texte affiché dans l’histoire ; indépendant du catalogue espèces ci-dessous.
              </span>
            </label>
            <fieldset className="gl-chapter-biomes-fieldset">
              <legend>Biomes (catalogue espèces)</legend>
              <p className="gl-hint">
                Sélection multiple : alimente la biocénose, le glossaire et les tirages QCM du chapitre.
              </p>
              {chapterForm.biomeSlugs.length > 0 ? (
                <ol className="gl-chapter-biomes-selected">
                  {chapterForm.biomeSlugs.map((slug) => {
                    const biome = biomes.find((b) => b.slug === slug);
                    return (
                      <li key={slug}>
                        <span>
                          {biome?.nom || slug}
                          {biome?.species_count != null ? ` (${biome.species_count} esp.)` : ''}
                        </span>
                        <span className="gl-inline-actions">
                          <button
                            type="button"
                            className="gl-btn-secondary"
                            onClick={() => setChapterForm({
                              ...chapterForm,
                              biomeSlugs: moveBiomeSlug(chapterForm.biomeSlugs, slug, -1),
                            })}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="gl-btn-secondary"
                            onClick={() => setChapterForm({
                              ...chapterForm,
                              biomeSlugs: moveBiomeSlug(chapterForm.biomeSlugs, slug, 1),
                            })}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="gl-btn-secondary"
                            onClick={() => setChapterForm({
                              ...chapterForm,
                              biomeSlugs: chapterForm.biomeSlugs.filter((s) => s !== slug),
                            })}
                          >
                            Retirer
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="gl-hint">Aucun biome catalogue sélectionné.</p>
              )}
              <ul className="gl-chapter-biomes-options">
                {biomes.map((biome) => {
                  const checked = chapterForm.biomeSlugs.includes(biome.slug);
                  return (
                    <li key={biome.slug}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...chapterForm.biomeSlugs, biome.slug]
                              : chapterForm.biomeSlugs.filter((s) => s !== biome.slug);
                            setChapterForm({ ...chapterForm, biomeSlugs: next });
                          }}
                        />
                        {biome.nom}
                        {' '}
                        (
                        {biome.species_count || 0}
                        {' '}
                        esp.)
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <GLImageSourceField
              label="Image de carte"
              url={chapterForm.mapImageUrl}
              onUrlChange={(value) => setChapterForm({ ...chapterForm, mapImageUrl: value })}
              onPickFile={handleMapImageFile}
              uploading={uploadingMapImage}
              filePickHint={mapImagePickHint}
            />
            <div className="gl-inline-actions">
              <button type="button" className="gl-btn-secondary" onClick={() => setFrameEditorOpen(true)}>
                Ajuster le cadre carte
              </button>
            </div>
            <MediaLibraryMenu
              title="Bibliothèque globale (images, audio, vidéo)"
              fetchItems={fetchMediaLibrary}
              uploadDataUrl={uploadMediaLibrary}
              removeItem={removeMediaLibrary}
              onPickUrl={(url) => setChapterForm((prev) => ({ ...prev, mapImageUrl: url }))}
            />
            {previewMapImageUrl ? (
              <div className="gl-map-url-preview">
                <p className="gl-hint">
                  Aperçu de la carte
                  {pendingMapPreviewUrl && !chapterForm.mapImageUrl ? ' (fichier local, en attente d’envoi)' : ''}
                </p>
                <GLPctMapCanvas
                  imageUrl={previewMapImageUrl}
                  imageAlt="Aperçu carte chapitre"
                  mapGestures={previewMapGestures}
                  className="gl-board gl-board--mini"
                  imageStyle={mapPreviewStyle}
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

            <h3>Thème du chapitre</h3>
            <p className="gl-hint">
              Laissez une couleur vide pour hériter de la charte plateforme. Seules les couleurs renseignées
              remplacent la charte par défaut pendant une partie ou sur la carte du royaume.
            </p>
            <GLBrandColorEditor
              sparse
              value={chapterForm.theme?.colors || {}}
              inheritedColors={platformBrand?.colors}
              onChange={(updater) => {
                setChapterForm((prev) => {
                  const prevColors = prev.theme?.colors || {};
                  const nextColors = typeof updater === 'function' ? updater(prevColors) : updater;
                  return {
                    ...prev,
                    theme: { colors: nextColors },
                  };
                });
              }}
            />
            <div className="gl-theme-preview gl-app" style={themePreviewStyle} aria-hidden>
              <div className="gl-theme-preview-topbar">Barre haute</div>
              <div className="gl-theme-preview-body">
                <span className="gl-theme-preview-chip gl-theme-preview-chip--primary">Primaire</span>
                <span className="gl-theme-preview-chip gl-theme-preview-chip--secondary">Secondaire</span>
                <span className="gl-theme-preview-text">Texte et liens du chapitre</span>
              </div>
            </div>

            <label>
              Histoire (markdown)
              <GLRichTextEditor
                value={chapterForm.storyMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, storyMarkdown: event.target.value })}
                imageLegend="Images de l'histoire"
              />
            </label>
            <label>
              Biotope (markdown)
              <GLRichTextEditor
                value={chapterForm.biotopeMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, biotopeMarkdown: event.target.value })}
                imageLegend="Images du biotope"
              />
            </label>
            <label>
              Biocénose (markdown)
              <GLRichTextEditor
                value={chapterForm.biocenoseMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, biocenoseMarkdown: event.target.value })}
                imageLegend="Images de la biocénose"
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
                chapterBiomes={detail?.chapter?.biomes || []}
                mapImageUrl={chapterForm.mapImageUrl}
                mapImageFrame={chapterForm.mapImageFrame}
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

      <GLImageFrameEditor
        open={frameEditorOpen}
        title="Cadre image - carte chapitre"
        context="chapter-map"
        imageUrl={previewMapImageUrl}
        initialFrame={chapterForm.mapImageFrame}
        onApply={({ frame }) => {
          setChapterForm((prev) => ({ ...prev, mapImageFrame: normalizeGlImageFrame(frame, 'chapter-map') }));
          setFrameEditorOpen(false);
        }}
        onClose={() => setFrameEditorOpen(false)}
      />
    </section>
  );
}
