import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
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
import { brandToCssVars, mergeBrandWithChapterTheme } from '../../utils/glBrandTheme.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLChaptersImportExportPanel } from './admin/GLChaptersImportExportPanel.jsx';
import { GLChapterScenesAdminPanel } from './admin/GLChapterScenesAdminPanel.jsx';
import {
  EMPTY_CHAPTER_FORM,
  allSpellCodesFrom,
  chapterDetailToForm,
  chapterFormToPayload,
  groupSpellsByCategory,
  moveBiomeSlug,
} from '../utils/glChapterAdminForm.js';

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
  const [spellCatalog, setSpellCatalog] = useState([]);
  const [platformBrand, setPlatformBrand] = useState(null);
  const [glModules, setGlModules] = useState(null);
  const previewMapGestures = useGlPctMapGestures();

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
    try {
      const data = await apiGL(`/api/gl/chapters/${encodeURIComponent(slug)}`);
      setDetail(data);
      setChapterForm(chapterDetailToForm(data));
      setSelectedId(Number(data.chapter.id));
      clearPendingMapImage();
    } catch (err) {
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
    clearPendingMapImage();
  }

  useEffect(() => () => {
    if (pendingMapPreviewUrl) URL.revokeObjectURL(pendingMapPreviewUrl);
  }, [pendingMapPreviewUrl]);

  async function submitChapter(event) {
    event.preventDefault();
    setError('');
    setInfo('');
    const payload = chapterFormToPayload(chapterForm);
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
      const imageData = await compressImageWithPreset(file, 'glChapter');
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
        : chapterForm.spellCodes.filter((item) => item !== c)
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
    [chapterForm.mapImageFrame]
  );
  const themePreviewStyle = useMemo(() => {
    const merged = mergeBrandWithChapterTheme(platformBrand, chapterForm.theme);
    return brandToCssVars(merged);
  }, [platformBrand, chapterForm.theme]);

  async function handleCharteImportApplied() {
    const slugToReload = chapterForm.slug
      || chapters.find((c) => Number(c.id) === Number(selectedId))?.slug;
    await loadChapters();
    if (slugToReload) {
      await loadDetail(slugToReload);
    }
  }

  return (
    <section className="gl-panel">
      <h2>Chapitres</h2>
      {error ? <p className="gl-error">{error}</p> : null}
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
                          <GLButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setChapterForm({
                              ...chapterForm,
                              biomeSlugs: moveBiomeSlug(chapterForm.biomeSlugs, slug, -1),
                            })}
                          >
                            ↑
                          </GLButton>
                          <GLButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setChapterForm({
                              ...chapterForm,
                              biomeSlugs: moveBiomeSlug(chapterForm.biomeSlugs, slug, 1),
                            })}
                          >
                            ↓
                          </GLButton>
                          <GLButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setChapterForm({
                              ...chapterForm,
                              biomeSlugs: chapterForm.biomeSlugs.filter((s) => s !== slug),
                            })}
                          >
                            Retirer
                          </GLButton>
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
            <fieldset className="gl-fieldset">
              <legend>Sorts du chapitre (grimoire)</legend>
              <p className="gl-hint">
                Cochez les sorts disponibles pour ce chapitre en partie (onglet Sortilèges).
              </p>
              <div className="gl-inline-actions gl-inline-actions--wrap">
                <GLButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => selectAllSpells(allSpellCodes)}
                  disabled={allSpellCodes.length === 0}
                >
                  Tout cocher
                </GLButton>
                <GLButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setSpellCodes([])}
                  disabled={chapterForm.spellCodes.length === 0}
                >
                  Tout décocher
                </GLButton>
              </div>
              {chapterForm.spellCodes.length > 0 ? (
                <p className="gl-hint">
                  {chapterForm.spellCodes.length}
                  {' '}
                  sort(s) sélectionné(s).
                </p>
              ) : (
                <p className="gl-hint">Aucun sort sélectionné.</p>
              )}
              {spellsByCategory.length === 0 ? (
                <p className="gl-hint">
                  Catalogue vide — importez des sorts dans Contenus → Sortilèges.
                </p>
              ) : (
                spellsByCategory.map((group) => {
                  const groupCodes = group.spells.map((s) => s.spell_code);
                  const allInGroup = groupCodes.every((c) => chapterForm.spellCodes.includes(c));
                  return (
                    <div key={group.slug} className="gl-chapter-spells-group">
                      <div className="gl-inline-actions gl-inline-actions--wrap">
                        <strong>{group.nom}</strong>
                        <GLButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => (
                            allInGroup
                              ? deselectAllSpells(groupCodes)
                              : selectAllSpells(groupCodes)
                          )}
                        >
                          {allInGroup ? 'Tout décocher' : 'Tout cocher'}
                          {' '}
                          (
                          {group.spells.length}
                          )
                        </GLButton>
                      </div>
                      <ul className="gl-chapter-spells-options">
                        {group.spells.map((spell) => {
                          const code = spell.spell_code;
                          const checked = chapterForm.spellCodes.includes(code);
                          return (
                            <li key={code}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => toggleSpellCode(code, event.target.checked)}
                                />
                                <span aria-hidden="true">{spell.emoji || '✨'}</span>
                                {' '}
                                {spell.nom}
                                {' '}
                                <span className="gl-hint">({code})</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
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
            <label>
              Plateau narratif (1–5)
              <select
                value={chapterForm.plateauNumber}
                onChange={(event) => setChapterForm({ ...chapterForm, plateauNumber: event.target.value })}
              >
                <option value="">— Non défini —</option>
                <option value="1">P1 — Tropiques africains</option>
                <option value="2">P2 — Sahara &amp; Méditerranée</option>
                <option value="3">P3 — Forêts &amp; landes atlantiques</option>
                <option value="4">P4 — Taïga &amp; steppes d&apos;Eurasie</option>
                <option value="5">P5 — Toundra arctique</option>
              </select>
            </label>

            <h3>Thème du chapitre</h3>
            <p className="gl-hint">
              Laissez une couleur vide pour hériter de la charte plateforme. Seules les couleurs renseignées
              remplacent la charte par défaut pendant une partie.
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
              <span className="gl-hint">
                Astuce : <code>![légende](scene:N)</code> intercale la N-ième scène de récit du chapitre
                (médiathèque <code>GL_recit_0N-chapN_*</code>) dans le texte ; les autres scènes restent en
                galerie de fin.
              </span>
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
            <label>
              Sortilèges (markdown)
              <GLRichTextEditor
                value={chapterForm.sortilegesMarkdown}
                onChange={(event) => setChapterForm({ ...chapterForm, sortilegesMarkdown: event.target.value })}
                imageLegend="Images du grimoire"
              />
            </label>
            <div className="gl-inline-actions">
              <GLButton type="submit">{selectedId ? 'Enregistrer' : 'Créer'}</GLButton>
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
                mapImageUrl={chapterForm.mapImageUrl}
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

              <h3>Scènes de récit (médiathèque)</h3>
              <GLChapterScenesAdminPanel
                plateauNumber={chapterForm.plateauNumber === '' ? null : Number(chapterForm.plateauNumber)}
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
