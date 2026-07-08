import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { compressImageWithPreset, isLikelyImageFile } from '../../utils/image.js';
import { GLChapterMapStudio } from './GLChapterMapStudio.jsx';
import { isModuleEnabled } from '../constants/modules.js';
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
import { brandToCssVars, mergeBrandWithChapterTheme } from '../utils/glBrandTheme.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLChaptersImportExportPanel } from './admin/GLChaptersImportExportPanel.jsx';
import { GLChapterScenesAdminPanel } from './admin/GLChapterScenesAdminPanel.jsx';
import { GLFeuilletZonePlateauPanel } from './GLFeuilletZonePlateauPanel.jsx';
import { GLChapterSpellsFieldset } from './admin/GLChapterSpellsFieldset.jsx';
import { GLChapterBiomesFieldset } from './admin/GLChapterBiomesFieldset.jsx';
import {
  EMPTY_CHAPTER_FORM,
  allSpellCodesFrom,
  chapterDetailToForm,
  chapterFormToPayload,
  groupSpellsByCategory,
} from '../utils/glChapterAdminForm.js';
import { useGlChapterEditorMarkdownResolver } from '../hooks/useGlChapterEditorMarkdownResolver.js';
import { resolveGlBoardImageUrl } from '../utils/glLegacyMediaUrl.js';
import { chapterIllustration, plateauBoardImg, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';

export function GLChaptersAdminView() {
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [chapterForm, setChapterForm] = useState(EMPTY_CHAPTER_FORM);
  const [chapterFormRevision, setChapterFormRevision] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [uploadingMapImage, setUploadingMapImage] = useState(false);
  const [pendingMapImageFile, setPendingMapImageFile] = useState(null);
  const [pendingMapPreviewUrl, setPendingMapPreviewUrl] = useState('');
  const [frameEditorOpen, setFrameEditorOpen] = useState(false);
  const [biomes, setBiomes] = useState([]);
  const [spellCatalog, setSpellCatalog] = useState([]);
  const [platformBrand, setPlatformBrand] = useState(null);
  const [glModules, setGlModules] = useState(null);
  const previewMapGestures = useGlPctMapGestures();
  // Numéro de séquence des rechargements de détail : seule la réponse du
  // rechargement le plus récent est appliquée. Empêche qu'une réponse arrivée
  // dans le désordre (après plusieurs déplacements de repères enchaînés) écrase
  // l'état frais et fasse « revenir » des repères à leur ancienne position.
  const detailLoadSeqRef = useRef(0);
  const assetsReady = useGlAssetsReady();
  const resolveChapterMarkdown = useGlChapterEditorMarkdownResolver(chapterForm.plateauNumber);

  async function loadPlatformBrand() {
    try {
      const config = await apiGL('/api/gl/auth/config');
      setPlatformBrand(normalizeBrand(config?.brand));
      setGlModules(config?.modules ?? null);
    } catch (_) {
      setPlatformBrand(normalizeBrand(null));
      setGlModules(null);
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
    const seq = (detailLoadSeqRef.current += 1);
    try {
      const data = await apiGL(`/api/gl/chapters/${encodeURIComponent(slug)}`);
      // Réponse périmée : un rechargement plus récent a été lancé entre-temps.
      if (seq !== detailLoadSeqRef.current) return;
      setDetail(data);
      setChapterForm(chapterDetailToForm(data));
      setSelectedId(Number(data.chapter.id));
      setChapterFormRevision((value) => value + 1);
      clearPendingMapImage();
    } catch (err) {
      if (seq !== detailLoadSeqRef.current) return;
      setError(err.message || 'Détail introuvable');
    }
  }

  async function loadSpellCatalog() {
    try {
      const data = await apiGL('/api/gl/admin/spells/all');
      setSpellCatalog(Array.isArray(data?.items) ? data.items : []);
    } catch (_) {
      setSpellCatalog([]);
    }
  }

  useEffect(() => {
    loadChapters();
    loadBiomes();
    loadSpellCatalog();
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
    setChapterFormRevision((value) => value + 1);
    clearPendingMapImage();
  }

  useEffect(
    () => () => {
      if (pendingMapPreviewUrl) URL.revokeObjectURL(pendingMapPreviewUrl);
    },
    [pendingMapPreviewUrl],
  );

  const persistChapter = useCallback(async () => {
    setError('');
    setInfo('');
    const payload = chapterFormToPayload(chapterForm);
    let chapterId = selectedId;
    if (selectedId) {
      const data = await apiGL(`/api/gl/chapters/admin/${selectedId}`, 'PUT', payload);
      setDetail(data);
      setInfo('Chapitre mis à jour');
      if (data?.chapter) {
        setChapterForm(chapterDetailToForm(data));
        setChapterFormRevision((value) => value + 1);
      }
    } else {
      const data = await apiGL('/api/gl/chapters/admin', 'POST', payload);
      setDetail(data);
      chapterId = Number(data?.chapter?.id || null);
      setSelectedId(chapterId);
      setInfo('Chapitre créé');
      if (data?.chapter) {
        setChapterForm(chapterDetailToForm(data));
        setChapterFormRevision((value) => value + 1);
      }
    }
    if (pendingMapImageFile && chapterId) {
      await uploadChapterMapImage(pendingMapImageFile, chapterId);
    }
    await loadChapters();
    return chapterForm;
  }, [chapterForm, selectedId, pendingMapImageFile, loadChapters, uploadChapterMapImage]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: chapterForm,
    resetKey: `${selectedId ?? 'new'}:${chapterFormRevision}`,
    enabled: String(chapterForm.slug || '').trim() && String(chapterForm.title || '').trim(),
    onSave: persistChapter,
  });

  async function submitChapter(event) {
    event.preventDefault();
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
        : 'Image sélectionnée : elle sera envoyée lors de l’enregistrement du chapitre.',
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
      const imageData = await compressImageWithPreset(file, 'glChapter');
      const data = await apiGL(`/api/gl/chapters/admin/${targetId}/map-image`, 'POST', {
        image_data: imageData,
      });
      setDetail(data);
      setChapterForm((prev) => ({
        ...prev,
        mapImageUrl: data?.chapter?.map_image_url || prev.mapImageUrl,
        mapImageFrame: normalizeGlImageFrame(
          data?.chapter?.map_image_frame || prev.mapImageFrame,
          'chapter-map',
        ),
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
  const plateauNumber = Number(chapterForm.plateauNumber);
  const hasPlateau = Number.isInteger(plateauNumber) && plateauNumber >= 1 && plateauNumber <= 5;
  const resolvedMapImageUrl = useMemo(() => {
    const conventionBoard = assetsReady && hasPlateau ? plateauBoardImg(plateauNumber) : null;
    const conventionChapter = assetsReady && hasPlateau ? chapterIllustration(plateauNumber) : null;
    return resolveGlBoardImageUrl({
      mapImageUrl: previewMapImageUrl || null,
      conventionBoard,
      conventionChapter,
      placeholderUrl: GL_ASSET_PLACEHOLDER_URL,
    });
  }, [previewMapImageUrl, assetsReady, hasPlateau, plateauNumber]);

  const showMapPreview = Boolean(previewMapImageUrl || (assetsReady && hasPlateau));

  const resolveStoryMarkdown = useMemo(
    () => (markdown) => resolveChapterMarkdown(markdown, { withSceneRefs: true }),
    [resolveChapterMarkdown],
  );

  const resolvePlainMarkdown = useMemo(
    () => (markdown) => resolveChapterMarkdown(markdown, { withSceneRefs: false }),
    [resolveChapterMarkdown],
  );
  const mapImagePickHint =
    !selectedId && pendingMapImageFile
      ? 'L’image sera importée sur le serveur à l’enregistrement du chapitre.'
      : !selectedId
        ? 'Vous pouvez choisir une photo avant l’enregistrement ; l’envoi se fera à la création du chapitre.'
        : '';

  const markers = useMemo(() => (Array.isArray(detail?.markers) ? detail.markers : []), [detail]);

  const spellsByCategory = useMemo(() => groupSpellsByCategory(spellCatalog), [spellCatalog]);

  const allSpellCodes = useMemo(() => allSpellCodesFrom(spellCatalog), [spellCatalog]);

  function setSpellCodes(next) {
    setChapterForm((prev) => ({ ...prev, spellCodes: next }));
  }

  function toggleSpellCode(code, checked) {
    const c = String(code || '').trim();
    if (!c) return;
    setSpellCodes(
      checked
        ? [...new Set([...chapterForm.spellCodes, c])]
        : chapterForm.spellCodes.filter((item) => item !== c),
    );
  }

  function selectAllSpells(codes) {
    setSpellCodes([...new Set([...chapterForm.spellCodes, ...codes])]);
  }

  function deselectAllSpells(codes) {
    const remove = new Set(codes);
    setSpellCodes(chapterForm.spellCodes.filter((c) => !remove.has(c)));
  }
  const mapPreviewStyle = useMemo(
    () => glImageFrameToStyle(normalizeGlImageFrame(chapterForm.mapImageFrame, 'chapter-map')),
    [chapterForm.mapImageFrame],
  );
  const themePreviewStyle = useMemo(() => {
    const merged = mergeBrandWithChapterTheme(platformBrand, chapterForm.theme);
    return brandToCssVars(merged);
  }, [platformBrand, chapterForm.theme]);

  async function handleCharteImportApplied() {
    const slugToReload =
      chapterForm.slug || chapters.find((c) => Number(c.id) === Number(selectedId))?.slug;
    await loadChapters();
    if (slugToReload) {
      await loadDetail(slugToReload);
    }
  }

  return (
    <section className="gl-panel">
      <h2>Chapitres</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      {saveError ? <p className="gl-error">{saveError}</p> : null}
      <AutoSaveStatus status={saveStatus} className="gl-hint" />
      {info ? <p className="gl-info">{info}</p> : null}

      <details className="plant-more" style={{ marginBottom: 16 }}>
        <summary>Import / export chapitres (XLSX)</summary>
        <div style={{ marginTop: 12 }}>
          <GLChaptersImportExportPanel onImportApplied={handleCharteImportApplied} />
        </div>
      </details>

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
                    <span className="gl-hint">{chapter.biomes.length} biome(s)</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <GLButton type="button" variant="secondary" onClick={resetChapterForm}>
            + Nouveau chapitre
          </GLButton>
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
            <GLChapterBiomesFieldset
              biomes={biomes}
              selectedSlugs={chapterForm.biomeSlugs}
              onChange={(nextSlugs) => setChapterForm({ ...chapterForm, biomeSlugs: nextSlugs })}
            />
            <GLChapterSpellsFieldset
              spellsByCategory={spellsByCategory}
              allSpellCodes={allSpellCodes}
              selectedCodes={chapterForm.spellCodes}
              onToggleSpell={toggleSpellCode}
              onSelectAll={selectAllSpells}
              onDeselectAll={deselectAllSpells}
              onClearAll={() => setSpellCodes([])}
            />
            <GLImageSourceField
              label="Image de carte"
              url={chapterForm.mapImageUrl}
              onUrlChange={(value) => setChapterForm({ ...chapterForm, mapImageUrl: value })}
              onPickFile={handleMapImageFile}
              uploading={uploadingMapImage}
              filePickHint={mapImagePickHint}
            />
            <div className="gl-inline-actions">
              <GLButton type="button" variant="secondary" onClick={() => setFrameEditorOpen(true)}>
                Ajuster le cadre carte
              </GLButton>
            </div>
            <MediaLibraryMenu
              title="Bibliothèque globale (images, audio, vidéo)"
              fetchItems={fetchMediaLibrary}
              uploadDataUrl={uploadMediaLibrary}
              removeItem={removeMediaLibrary}
              onPickUrl={(url) => setChapterForm((prev) => ({ ...prev, mapImageUrl: url }))}
            />
            {showMapPreview && resolvedMapImageUrl ? (
              <div className="gl-map-url-preview">
                <p className="gl-hint">
                  Aperçu de la carte
                  {pendingMapPreviewUrl && !chapterForm.mapImageUrl
                    ? ' (fichier local, en attente d’envoi)'
                    : ''}
                </p>
                <GLPctMapCanvas
                  imageUrl={resolvedMapImageUrl}
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
                onChange={(event) =>
                  setChapterForm({ ...chapterForm, orderIndex: event.target.value })
                }
              />
            </label>
            <label>
              Plateau narratif (1–5)
              <select
                value={chapterForm.plateauNumber}
                onChange={(event) =>
                  setChapterForm({ ...chapterForm, plateauNumber: event.target.value })
                }
              >
                <option value="">— Non défini —</option>
                <option value="1">P1 — Tropiques africains</option>
                <option value="2">P2 — Sahara &amp; Méditerranée</option>
                <option value="3">P3 — Forêts &amp; landes atlantiques</option>
                <option value="4">P4 — Taïga &amp; steppes d&apos;Eurasie</option>
                <option value="5">P5 — Toundra arctique</option>
              </select>
            </label>

            <fieldset className="gl-fieldset">
              <legend>Affichage carte en partie</legend>
              <p className="gl-hint">
                Surcharge optionnelle des défauts plateforme (Réglages → Affichage carte plateau).
                Laissez « Hériter » pour appliquer le défaut global.
              </p>
              <label>
                Repères sur la carte
                <select
                  value={chapterForm.mapMarkersVisible}
                  onChange={(event) =>
                    setChapterForm({ ...chapterForm, mapMarkersVisible: event.target.value })
                  }
                >
                  <option value="">Hériter du défaut plateforme</option>
                  <option value="true">Visibles</option>
                  <option value="false">Masqués</option>
                </select>
              </label>
              <label>
                Zones feuillets sur la carte
                <select
                  value={chapterForm.mapZonesVisible}
                  onChange={(event) =>
                    setChapterForm({ ...chapterForm, mapZonesVisible: event.target.value })
                  }
                >
                  <option value="">Hériter du défaut plateforme</option>
                  <option value="true">Visibles</option>
                  <option value="false">Masquées</option>
                </select>
              </label>
            </fieldset>

            <h3>Thème du chapitre</h3>
            <p className="gl-hint">
              Laissez une couleur vide pour hériter de la charte plateforme. Seules les couleurs
              renseignées remplacent la charte par défaut pendant une partie.
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
                <span className="gl-theme-preview-chip gl-theme-preview-chip--primary">
                  Primaire
                </span>
                <span className="gl-theme-preview-chip gl-theme-preview-chip--secondary">
                  Secondaire
                </span>
                <span className="gl-theme-preview-text">Texte et liens du chapitre</span>
              </div>
            </div>

            <label>
              Histoire (markdown)
              <GLRichTextEditor
                value={chapterForm.storyMarkdown}
                onChange={(event) =>
                  setChapterForm({ ...chapterForm, storyMarkdown: event.target.value })
                }
                imageLegend="Images de l'histoire"
                resolveDisplayMarkdown={resolveStoryMarkdown}
              />
              <span className="gl-hint">
                Astuce : <code>![légende](scene:N)</code> intercale la N-ième scène de récit du
                chapitre (médiathèque <code>GL_recit_0N-chapN_*</code>) dans le texte ; les autres
                scènes restent en galerie de fin.
              </span>
            </label>
            <label>
              Biotope (markdown — section de l’onglet Écosystèmes)
              <GLRichTextEditor
                value={chapterForm.biotopeMarkdown}
                onChange={(event) =>
                  setChapterForm({ ...chapterForm, biotopeMarkdown: event.target.value })
                }
                imageLegend="Images du biotope"
                resolveDisplayMarkdown={resolvePlainMarkdown}
              />
            </label>
            <label>
              Biocénose (markdown — section de l’onglet Écosystèmes)
              <GLRichTextEditor
                value={chapterForm.biocenoseMarkdown}
                onChange={(event) =>
                  setChapterForm({ ...chapterForm, biocenoseMarkdown: event.target.value })
                }
                imageLegend="Images de la biocénose"
                resolveDisplayMarkdown={resolvePlainMarkdown}
              />
            </label>
            <label>
              Sortilèges (markdown)
              <GLRichTextEditor
                value={chapterForm.sortilegesMarkdown}
                onChange={(event) =>
                  setChapterForm({ ...chapterForm, sortilegesMarkdown: event.target.value })
                }
                imageLegend="Images du grimoire"
                resolveDisplayMarkdown={resolvePlainMarkdown}
              />
            </label>
            <AutoSaveStatus status={saveStatus} className="gl-hint" />
            <div className="gl-inline-actions">
              {selectedId ? (
                <GLButton type="button" variant="danger" onClick={deleteChapter}>
                  Supprimer
                </GLButton>
              ) : null}
            </div>
          </form>

          {selectedId ? (
            <>
              <h3>Carte du chapitre — repères et zones</h3>
              <p className="gl-hint">
                Repères interactifs et zones polygonales sur la même image de carte.
                {isModuleEnabled(glModules, 'zoneMusicEnabled')
                  ? ' La musique d’ambiance par zone s’applique sur l’onglet Cartes en partie.'
                  : ''}
              </p>
              <GLChapterMapStudio
                chapterId={selectedId}
                chapterSlug={chapterForm.slug}
                chapterTitle={chapterForm.title}
                chapterBiomes={detail?.chapter?.biomes || []}
                mapImageUrl={resolvedMapImageUrl}
                mapImageFrame={chapterForm.mapImageFrame}
                markers={markers}
                zoneMusicEnabled={isModuleEnabled(glModules, 'zoneMusicEnabled')}
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

              {chapterForm.plateauNumber !== '' &&
              Number(chapterForm.plateauNumber) >= 1 &&
              Number(chapterForm.plateauNumber) <= 5 ? (
                <>
                  <h3>Zones feuillets — plateau {chapterForm.plateauNumber}</h3>
                  <p className="gl-hint">
                    Calque de découverte des feuillets sur le visuel du plateau. Sélectionnez une
                    zone puis cliquez sur la carte pour la déplacer ; exportez le JSON vers{' '}
                    <code>src/gl/data/zones_feuillets.json</code>.
                  </p>
                  <GLFeuilletZonePlateauPanel
                    plateauNumber={Number(chapterForm.plateauNumber)}
                    mapImageUrl={chapterForm.mapImageUrl}
                    mapImageFrame={chapterForm.mapImageFrame}
                  />
                </>
              ) : null}

              <h3>Scènes de récit (médiathèque)</h3>
              <GLChapterScenesAdminPanel
                plateauNumber={
                  chapterForm.plateauNumber === '' ? null : Number(chapterForm.plateauNumber)
                }
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
        imageUrl={resolvedMapImageUrl}
        initialFrame={chapterForm.mapImageFrame}
        onApply={({ frame }) => {
          setChapterForm((prev) => ({
            ...prev,
            mapImageFrame: normalizeGlImageFrame(frame, 'chapter-map'),
          }));
          setFrameEditorOpen(false);
        }}
        onClose={() => setFrameEditorOpen(false)}
      />
    </section>
  );
}
