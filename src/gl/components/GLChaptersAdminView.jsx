import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

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

const EMPTY_MARKER_FORM = {
  label: '',
  xPct: 50,
  yPct: 50,
  eventType: '',
  description: '',
  orderIndex: 0,
};

export function GLChaptersAdminView() {
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [chapterForm, setChapterForm] = useState(EMPTY_CHAPTER_FORM);
  const [markerForm, setMarkerForm] = useState(EMPTY_MARKER_FORM);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

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

  async function submitMarker(event) {
    event.preventDefault();
    if (!selectedId) {
      setError('Sélectionnez un chapitre avant d\'ajouter un repère');
      return;
    }
    setError('');
    setInfo('');
    try {
      await apiGL(`/api/gl/chapters/admin/${selectedId}/markers`, 'POST', {
        label: markerForm.label,
        xPct: Number(markerForm.xPct),
        yPct: Number(markerForm.yPct),
        eventType: markerForm.eventType,
        description: markerForm.description,
        orderIndex: Number(markerForm.orderIndex) || 0,
      });
      setMarkerForm(EMPTY_MARKER_FORM);
      setInfo('Repère ajouté');
      await loadDetail(chapterForm.slug);
    } catch (err) {
      setError(err.message || 'Ajout du repère impossible');
    }
  }

  async function deleteMarker(markerId) {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce repère ?')) return;
    try {
      await apiGL(`/api/gl/chapters/admin/markers/${markerId}`, 'DELETE');
      setInfo('Repère supprimé');
      await loadDetail(chapterForm.slug);
    } catch (err) {
      setError(err.message || 'Suppression du repère impossible');
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
              <ul className="gl-markers-list">
                {markers.map((marker) => (
                  <li key={marker.id} data-marker-id={marker.id}>
                    <span>
                      <strong>{marker.label}</strong> — x:{Number(marker.x_pct).toFixed(1)}%, y:{Number(marker.y_pct).toFixed(1)}%
                      {marker.event_type ? ` (${marker.event_type})` : ''}
                    </span>
                    <button type="button" onClick={() => deleteMarker(marker.id)} className="gl-danger">
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
              <form className="gl-form" onSubmit={submitMarker}>
                <label>
                  Label
                  <input
                    value={markerForm.label}
                    onChange={(event) => setMarkerForm({ ...markerForm, label: event.target.value })}
                    required
                  />
                </label>
                <label>
                  x (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={markerForm.xPct}
                    onChange={(event) => setMarkerForm({ ...markerForm, xPct: event.target.value })}
                  />
                </label>
                <label>
                  y (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={markerForm.yPct}
                    onChange={(event) => setMarkerForm({ ...markerForm, yPct: event.target.value })}
                  />
                </label>
                <label>
                  Type d'événement
                  <input
                    value={markerForm.eventType}
                    onChange={(event) => setMarkerForm({ ...markerForm, eventType: event.target.value })}
                    placeholder="quiz, story, start..."
                  />
                </label>
                <label>
                  Description
                  <input
                    value={markerForm.description}
                    onChange={(event) => setMarkerForm({ ...markerForm, description: event.target.value })}
                  />
                </label>
                <label>
                  Ordre
                  <input
                    type="number"
                    value={markerForm.orderIndex}
                    onChange={(event) => setMarkerForm({ ...markerForm, orderIndex: event.target.value })}
                  />
                </label>
                <div className="gl-inline-actions">
                  <button type="submit">Ajouter le repère</button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
