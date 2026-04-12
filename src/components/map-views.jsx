import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { ZONE_COLORS } from '../constants/garden';
import {
  MARKER_EMOJIS,
  MAP_MARKER_EMOJI_MAX_CHARS,
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  parseEmojiListSetting,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
  clampEmojiInput,
} from '../constants/emojis';
import { stageBadge, TaskDifficultyAndRiskChips } from '../utils/badges';
import { compressImage } from '../utils/image';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../utils/overlayHistory';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { Tooltip } from './Tooltip';
import { ContextComments } from './context-comments';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';
import { lockBodyScroll } from '../utils/body-scroll-lock';
import { resolveMapOverlayTypography } from '../utils/mapOverlayTypography';
import { isStudentAssignedToTask } from '../utils/task-assignments';
import { parseLivingBeings, orderedLivingBeingsForForm, nextLivingBeingsFromMultiSelect } from '../utils/livingBeings';
import { wheelZoomScaleFactor } from '../utils/mapWheelZoom';
import { TutorialPreviewModal, tutorialPreviewPayload, tutorialPreviewCanEmbed } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

function Lightbox({ src, caption, onClose }) {
  const el = useMemo(() => document.createElement('div'), []);
  const dialogRef = useDialogA11y(onClose);
  useEffect(() => {
    const releaseBodyScroll = lockBodyScroll();
    document.body.appendChild(el);
    return () => {
      try {
        if (document.body.contains(el)) document.body.removeChild(el);
      } finally {
        releaseBodyScroll();
      }
    };
  }, [el]);

  const content = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.93)', zIndex: 99999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 20 }}
      onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu image"
        tabIndex={-1}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
      <img src={src} onClick={e => e.stopPropagation()}
        style={{ maxWidth: '95vw', maxHeight: '85vh', borderRadius: 10,
          objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,.5)',
          animation: 'popIn .25s var(--spring,cubic-bezier(.34,1.56,.64,1))' }}
        alt={caption || ''} />
      {caption && (
        <p style={{ color: 'rgba(255,255,255,.8)', marginTop: 12, fontSize: '.9rem',
          maxWidth: '80vw', textAlign: 'center' }}>{caption}</p>
      )}
      <button
        style={{ position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(4px)',
          border: 'none', color: 'white', borderRadius: '50%',
          width: 40, height: 40, fontSize: '1.1rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label="Fermer l'aperçu"
        onClick={onClose}>✕</button>
      </div>
    </div>
  );

  return createPortal(content, el);
}

/** Emoji catalogue plantes pour un nom d’être vivant (fiches Info zone/repère). */
function livingBeingEmoji(plants, name) {
  const p = (plants || []).find((x) => x.name === name);
  return p?.emoji || '🌱';
}

function livingBeingCatalogText(value) {
  const t = String(value ?? '').trim();
  return t.length ? t : null;
}

const CATALOG_PANEL_LABEL_STYLE = {
  fontSize: '.72rem',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  marginBottom: 4,
  marginTop: 10,
};

/**
 * Bloc « Remarques » (3 champs catalogue) — même présentation partout (mission, zone, fiche biodiversité).
 */
function CatalogRemarksSection({ plant }) {
  if (!plant) return null;
  const remark1 = livingBeingCatalogText(plant.remark_1);
  const remark2 = livingBeingCatalogText(plant.remark_2);
  const remark3 = livingBeingCatalogText(plant.remark_3);
  const remarkLines = [remark1, remark2, remark3];
  const hasAnyRemark = remarkLines.some(Boolean);
  if (!hasAnyRemark) return null;
  return (
    <div>
      <div style={CATALOG_PANEL_LABEL_STYLE}>Remarques</div>
      {remarkLines.map((text, idx) => (
        <p
          key={`remark-${idx}`}
          style={{
            fontSize: '.83rem',
            color: text ? '#555' : '#94a3b8',
            lineHeight: 1.5,
            margin: idx === 0 ? '0 0 4px' : '4px 0 0',
            whiteSpace: 'pre-wrap',
            fontStyle: text ? 'normal' : 'italic',
          }}
        >
          {text || '—'}
        </p>
      ))}
    </div>
  );
}

/** Liste d’êtres vivants cliquable + extrait catalogue (description, rôle, utilité, remarques). */
function LivingBeingsCatalogPanel({ plants, names, showHeading = true }) {
  const list = names || [];
  const listKey = useMemo(() => list.join('\u0001'), [list]);
  const [selectedName, setSelectedName] = useState(() => list[0] || null);

  useEffect(() => {
    if (!list.length) {
      setSelectedName(null);
      return;
    }
    setSelectedName((prev) => (prev && list.includes(prev) ? prev : list[0]));
  }, [listKey]);

  if (!list.length) return null;

  const selectedPlant = selectedName ? (plants || []).find((p) => p.name === selectedName) : null;
  const desc = selectedPlant ? livingBeingCatalogText(selectedPlant.description) : null;
  const role = selectedPlant ? livingBeingCatalogText(selectedPlant.ecosystem_role) : null;
  const utility = selectedPlant ? livingBeingCatalogText(selectedPlant.human_utility) : null;
  const labelStyle = {
    ...CATALOG_PANEL_LABEL_STYLE,
  };

  return (
    <div style={{
      background: 'var(--parchment)',
      borderRadius: 10,
      padding: '10px 14px',
      marginBottom: 12,
      border: '1px solid rgba(0,0,0,.06)',
    }}>
      {showHeading && (
        <div style={{
          fontSize: '.78rem',
          fontWeight: 700,
          color: '#64748b',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          Êtres vivants
        </div>
      )}
      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
        Touche ou clique un nom pour afficher la fiche du catalogue (description, rôle, utilité, remarques).
      </p>
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        role="group"
        aria-label="Sélection d’un être vivant pour la fiche catalogue"
      >
        {list.map((name) => {
          const isSel = selectedName === name;
          return (
            <button
              type="button"
              key={name}
              className="task-chip living-being-catalog-chip"
              aria-pressed={isSel}
              onClick={() => setSelectedName(name)}
              style={{
                fontWeight: 500,
                border: isSel
                  ? '2px solid var(--forest)'
                  : '1px solid rgba(0,0,0,.12)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: isSel ? 'rgba(26, 71, 49, 0.08)' : undefined,
              }}
            >
              {livingBeingEmoji(plants, name)} {name}
            </button>
          );
        })}
      </div>
      {selectedName && (
        <div
          style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,.08)' }}
          role="region"
          aria-live="polite"
          aria-label={`Fiche catalogue : ${selectedName}`}
        >
          {!selectedPlant ? (
            <p style={{ fontSize: '.83rem', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
              Aucune fiche catalogue ne correspond à « {selectedName} ». Un professeur peut mettre à jour la base biodiversité.
            </p>
          ) : (
            <>
              <div>
                <div style={{ ...labelStyle, marginTop: 0 }}>Description</div>
                <p style={{
                  fontSize: '.83rem',
                  color: desc ? '#555' : '#94a3b8',
                  lineHeight: 1.5,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontStyle: desc ? 'normal' : 'italic',
                }}>
                  {desc || 'Non renseigné'}
                </p>
              </div>
              <div>
                <div style={labelStyle}>Rôle dans l&apos;écosystème</div>
                <p style={{
                  fontSize: '.83rem',
                  color: role ? '#555' : '#94a3b8',
                  lineHeight: 1.5,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontStyle: role ? 'normal' : 'italic',
                }}>
                  {role || 'Non renseigné'}
                </p>
              </div>
              <div>
                <div style={labelStyle}>Utilité pour l&apos;être humain</div>
                <p style={{
                  fontSize: '.83rem',
                  color: utility ? '#555' : '#94a3b8',
                  lineHeight: 1.5,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontStyle: utility ? 'normal' : 'italic',
                }}>
                  {utility || 'Non renseigné'}
                </p>
              </div>
              <CatalogRemarksSection plant={selectedPlant} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Boutons espèces : ouvre la même fiche que l’onglet « Biodiversité » (via callback parent). */
function BiodiversitySpeciesOpenLinks({ plants, names, showHeading = true, sectionTitle = null, onOpenPlant }) {
  const raw = names || [];
  const list = [];
  const seen = new Set();
  for (const n of raw) {
    const s = String(n || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    list.push(s);
  }
  if (!list.length) return null;
  const canOpen = typeof onOpenPlant === 'function';

  return (
    <div style={{
      background: 'var(--parchment)',
      borderRadius: 10,
      padding: '10px 14px',
      marginBottom: 12,
      border: '1px solid rgba(0,0,0,.06)',
    }}>
      {showHeading && (
        <div style={{
          fontSize: '.78rem',
          fontWeight: 700,
          color: '#64748b',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          {sectionTitle || 'Êtres vivants'}
        </div>
      )}
      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
        Affiche la fiche catalogue dans une fenêtre (comme pour les tutoriels).
      </p>
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        role="group"
        aria-label="Espèces liées — ouvrir le catalogue biodiversité"
      >
        {list.map((name) => {
          const plant = (plants || []).find((p) => String(p?.name || '').trim() === name);
          const disabled = !canOpen || !plant?.id;
          return (
            <button
              type="button"
              key={name}
              className="task-chip living-being-catalog-chip"
              disabled={disabled}
              title={!plant ? 'Pas de fiche catalogue pour ce nom — un prof peut compléter la biodiversité.' : undefined}
              aria-label={plant ? `Ouvrir la fiche biodiversité : ${name}` : `Aucune fiche pour : ${name}`}
              onClick={() => plant && canOpen && onOpenPlant(plant.id)}
              style={{
                fontWeight: 500,
                border: plant && canOpen ? '1px solid rgba(0,0,0,.12)' : '1px solid rgba(0,0,0,.08)',
                cursor: plant && canOpen ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                opacity: plant && canOpen ? 1 : 0.65,
              }}
            >
              {livingBeingEmoji(plants, name)} {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FORETMAP_PHOTO_DRAG_MIME = 'application/x-foretmap-zone-marker-photo-id';

function reorderZoneMarkerPhotosByDrop(list, draggedId, dropTargetId) {
  const ids = list.map((p) => p.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(dropTargetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

function PhotoGallery({ zoneId, markerId, isTeacher }) {
  const [photos, setPhotos] = useState([]);
  const [big, setBig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reorderingPhotos, setReorderingPhotos] = useState(false);
  const [caption, setCaption] = useState('');
  const galleryFileRef = useRef(null);
  const cameraFileRef = useRef(null);

  const listBase = zoneId ? `/api/zones/${zoneId}/photos` : `/api/map/markers/${markerId}/photos`;
  const emptyLabel = zoneId ? 'zone' : 'repère';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api(listBase);
      setPhotos(list);
    } catch (e) {
      console.error('[ForetMap] chargement photos lieu', e);
    } finally {
      setLoading(false);
    }
  }, [listBase]);

  useEffect(() => { load(); }, [load]);

  const upload = async e => {
    disarmNativeFilePickerGuard();
    const files = Array.from(e.target.files || []).filter((f) => f?.size);
    e.target.value = '';
    if (!files.length) return;
    const captionTrim = caption.trim();
    setUploading(true);
    try {
      for (const file of files) {
        const img = await compressImage(file);
        await api(listBase, 'POST', { image_data: img, caption: captionTrim });
      }
      setCaption('');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const del = async id => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await api(`${listBase}/${id}`, 'DELETE');
      await load();
    } catch (err) {
      alert(err.message || 'Suppression impossible');
    }
  };

  const persistPhotoReorder = async (nextOrdered) => {
    if (!isTeacher || nextOrdered.length < 2) return;
    setReorderingPhotos(true);
    try {
      await api(`${listBase}/reorder`, 'PUT', { photo_ids: nextOrdered.map((x) => x.id) });
      await load();
    } catch (err) {
      alert(err.message || 'Impossible de réordonner les photos');
      await load();
    } finally {
      setReorderingPhotos(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      {big && <Lightbox src={big.src} caption={big.caption} onClose={() => setBig(null)} />}

      {loading
        ? <p style={{ color: '#aaa', fontSize: '.85rem', textAlign: 'center', padding: '16px 0' }}>Chargement...</p>
        : photos.length === 0
          ? <p style={{ color: '#bbb', fontSize: '.85rem', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
              {`Aucune photo pour ce ${emptyLabel}.`}
            </p>
          : (
            <>
              {isTeacher && photos.length > 1 && (
                <p style={{ color: '#64748b', fontSize: '.76rem', margin: '0 0 8px', lineHeight: 1.45 }}>
                  Glisser-déposer une vignette pour changer l’ordre. La première sert de photo d’accroche sur la visite guidée.
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: 8, marginBottom: 12,
                opacity: reorderingPhotos ? 0.65 : 1, pointerEvents: reorderingPhotos ? 'none' : undefined }}>
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className={isTeacher && photos.length > 1 ? 'photo-reorder-tile' : undefined}
                    draggable={!!(isTeacher && photos.length > 1 && p.image_url)}
                    onDragStart={(e) => {
                      if (!isTeacher || photos.length < 2 || !p.image_url) return;
                      e.dataTransfer.setData(FORETMAP_PHOTO_DRAG_MIME, String(p.id));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (!isTeacher || photos.length < 2) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      if (!isTeacher || photos.length < 2) return;
                      e.preventDefault();
                      const raw = e.dataTransfer.getData(FORETMAP_PHOTO_DRAG_MIME);
                      const dragId = Number(raw);
                      if (!Number.isFinite(dragId) || dragId === p.id) return;
                      const next = reorderZoneMarkerPhotosByDrop(photos, dragId, p.id);
                      void persistPhotoReorder(next);
                    }}
                    style={{ position: 'relative', borderRadius: 8, overflow: 'hidden',
                      aspectRatio: '1', background: '#e8f5e9' }}
                  >
                    {p.image_url
                      ? <img src={p.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                          onClick={() => setBig({ src: p.image_url, caption: p.caption })} alt={p.caption || ''} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '1.5rem', animation: 'sway 1.5s infinite' }}>🌿</div>
                    }
                    {p.image_url && p.caption && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.55)',
                        color: 'white', fontSize: '.62rem', padding: '3px 5px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption}</div>
                    )}
                    {isTeacher && p.image_url && (
                      <button type="button" onMouseDown={(ev) => ev.stopPropagation()} onClick={() => del(p.id)}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.55)',
                          border: 'none', color: 'white', borderRadius: '50%', width: 22, height: 22,
                          fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
      }

      {isTeacher && (
        <div>
          <input value={caption} onChange={e => setCaption(e.target.value)}
            placeholder="Légende (optionnel)" style={{ fontSize: '16px', width: '100%', marginBottom: 6,
              padding: '8px 12px', border: '1.5px solid var(--mint)', borderRadius: 8, background: 'var(--cream)' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: '1 1 140px' }}
              disabled={uploading}
              onClick={() => {
                if (galleryFileRef.current) galleryFileRef.current.value = '';
                armNativeFilePickerGuard();
                galleryFileRef.current?.click();
              }}
            >
              {uploading ? 'Envoi...' : '📁 Galerie'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: '1 1 140px' }}
              disabled={uploading}
              onClick={() => {
                if (cameraFileRef.current) cameraFileRef.current.value = '';
                armNativeFilePickerGuard();
                cameraFileRef.current?.click();
              }}
            >
              {uploading ? 'Envoi...' : '📸 Appareil photo'}
            </button>
          </div>
          <input ref={galleryFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
          <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={upload} />
        </div>
      )}
    </div>
  );
}

function ZoneOrMarkerEmojiField({ id, value, onChange, maxLen, gridLabel = 'Ou choisir dans la liste :' }) {
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLen}
        placeholder="Colle ou tape un emoji…"
        value={value}
        onChange={(e) => onChange(clampEmojiInput(e.target.value, maxLen))}
        style={{ fontSize: '1.2rem', width: '100%', maxWidth: 140 }}
      />
      <div style={{ fontSize: '.78rem', color: '#777', margin: '8px 0 6px' }}>{gridLabel}</div>
    </>
  );
}

/** IDs zones/repères liés à une tâche (API multi + champs legacy). */
function taskLocationIds(t) {
  if (!t) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set([...(t.zone_ids || []), ...(t.zone_id ? [t.zone_id] : [])])];
  const markerIds = [...new Set([...(t.marker_ids || []), ...(t.marker_id ? [t.marker_id] : [])])];
  return { zoneIds, markerIds };
}

/** IDs zones/repères liés à un tutoriel (API). */
function tutorialLocationIds(tu) {
  if (!tu) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set((tu.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const markerIds = [...new Set((tu.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  return { zoneIds, markerIds };
}

/** Tutoriel sans lieu ou entièrement sur la carte `mapId` (évite mélange de cartes). */
function tutorialLinkedToSameMap(tu, mapId) {
  if (!mapId) return true;
  const zl = tu.zones_linked || [];
  const ml = tu.markers_linked || [];
  if (zl.length === 0 && ml.length === 0) return true;
  return [...zl, ...ml].every((x) => x.map_id === mapId);
}

function taskOpenSlots(task) {
  const required = Number(task?.required_students || 1);
  const assigned = Array.isArray(task?.assignments) ? task.assignments.length : 0;
  return Math.max(0, required - assigned);
}

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function taskEffectiveStatus(task) {
  const baseStatus = task?.status || 'available';
  if (baseStatus === 'done' || baseStatus === 'validated' || baseStatus === 'proposed') return baseStatus;
  const startDate = normalizeDateOnly(task?.start_date);
  const blockedByStartDate = !!startDate && startDate > currentLocalDateOnly();
  if (baseStatus === 'on_hold' || task?.project_status === 'on_hold' || task?.is_before_start_date || blockedByStartDate) {
    return 'on_hold';
  }
  return baseStatus;
}

function canStudentAssignTask(task, student) {
  if (!task || !student) return false;
  const effectiveStatus = taskEffectiveStatus(task);
  if (effectiveStatus === 'validated' || effectiveStatus === 'done' || effectiveStatus === 'on_hold') return false;
  if (isStudentAssignedToTask(task, student)) return false;
  return taskOpenSlots(task) > 0;
}

function taskEnrollmentMeta(task, student) {
  const isMine = isStudentAssignedToTask(task, student);
  const slots = taskOpenSlots(task);
  const effectiveStatus = taskEffectiveStatus(task);
  const isClosed = effectiveStatus === 'validated' || effectiveStatus === 'done';
  if (isMine) {
    return { tone: '#0f766e', bg: '#f0fdfa', border: '#99f6e4', dot: '●', label: 'Déjà prise par toi' };
  }
  if (effectiveStatus === 'on_hold') {
    return { tone: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '●', label: 'En attente' };
  }
  if (isClosed) {
    return { tone: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '●', label: effectiveStatus === 'done' ? 'Terminée (en attente)' : 'Validée' };
  }
  if (slots <= 0) {
    return { tone: '#991b1b', bg: '#fef2f2', border: '#fecaca', dot: '●', label: 'Complet' };
  }
  return { tone: '#166534', bg: '#f0fdf4', border: '#86efac', dot: '●', label: `${slots} place${slots > 1 ? 's' : ''} disponible${slots > 1 ? 's' : ''}` };
}

function TaskEnrollmentLegend() {
  const items = [
    { key: 'mine', color: '#0f766e', label: 'Déjà prise' },
    { key: 'open', color: '#166534', label: 'Disponible' },
    { key: 'full', color: '#991b1b', label: 'Complet' },
    { key: 'closed', color: '#92400e', label: 'Fermée' },
  ];
  return (
    <div style={{ marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <span key={item.key} style={{ fontSize: '.78rem', color: '#555', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: item.color, fontSize: '.9rem', lineHeight: 1 }}>●</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

const TASK_VISUAL_PRIORITY = { done: 1, progress: 2, todo: 3 };
const TASK_VISUAL_LABEL = {
  todo: 'Tâche à faire',
  progress: 'Tâche en cours',
  done: 'Tâche terminée',
};

function taskVisualStatus(status) {
  if (status === 'on_hold') return null;
  if (status === 'available') return 'todo';
  if (status === 'in_progress') return 'progress';
  if (status === 'done' || status === 'validated') return 'done';
  return null;
}

function mergeTaskVisualStatus(current, next) {
  if (!current) return next;
  if (!next) return current;
  return (TASK_VISUAL_PRIORITY[next] || 0) > (TASK_VISUAL_PRIORITY[current] || 0) ? next : current;
}

function isTaskDetachedFromLocation(task) {
  if (!task) return false;
  return task.status === 'done' || task.status === 'validated';
}

/** Tutoriels référencés par une tâche (`tutorials_linked` ou `tutorial_ids` + catalogue). */
function taskLinkedTutorialRefs(task, tutorialsCatalog = []) {
  if (!task) return [];
  const linked = task.tutorials_linked;
  if (Array.isArray(linked) && linked.length) return linked;
  const ids = task.tutorial_ids;
  if (!Array.isArray(ids) || !ids.length) return [];
  const out = [];
  for (const raw of ids) {
    const tu = tutorialsCatalog.find((x) => Number(x.id) === Number(raw));
    if (tu) out.push(tu);
  }
  return out;
}

function dedupeTutorialsById(list) {
  const seen = new Set();
  const out = [];
  for (const tu of list || []) {
    if (!tu || tu.id == null) continue;
    const k = String(tu.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tu);
  }
  return out;
}

/** Tutoriels référencés par des tâches sur ce lieu (dédoublonnés). */
function tutorialsFromTasksAtLocation(kind, locationId, tasks, tutorialsCatalog) {
  const locZone = kind === 'zone';
  const refs = [];
  for (const t of tasks || []) {
    if (isTaskDetachedFromLocation(t)) continue;
    const { zoneIds, markerIds } = taskLocationIds(t);
    const at = locZone
      ? zoneIds.some((id) => String(id) === String(locationId))
      : markerIds.some((id) => String(id) === String(locationId));
    if (!at) continue;
    refs.push(...taskLinkedTutorialRefs(t, tutorialsCatalog));
  }
  return dedupeTutorialsById(refs);
}

/** Noms d’êtres vivants portés par les tâches à ce lieu (ordre d’apparition, sans doublon). */
function livingBeingNamesFromTasksAtLocation(kind, locationId, tasks) {
  const locZone = kind === 'zone';
  const names = [];
  const seen = new Set();
  for (const t of tasks || []) {
    if (isTaskDetachedFromLocation(t)) continue;
    const { zoneIds, markerIds } = taskLocationIds(t);
    const at = locZone
      ? zoneIds.some((id) => String(id) === String(locationId))
      : markerIds.some((id) => String(id) === String(locationId));
    if (!at) continue;
    const list = Array.isArray(t.living_beings_list) ? t.living_beings_list : [];
    for (const raw of list) {
      const s = String(raw || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      names.push(s);
    }
  }
  return names;
}

function ZoneInfoModal({ zone, plants, tasks, tutorials = [], isTeacher, student, canSelfAssignTasks = true, canEnrollOnTasks, markerEmojis = MARKER_EMOJIS, emojiParsingList = MARKER_EMOJIS, contextCommentsEnabled = true, canParticipateContextComments = true, onClose, onUpdate, onDelete, onDuplicate, onEditPoints, onLinkTask, onUnlinkTask, onAssignTasks, onLinkTutorial, onUnlinkTutorial, onNavigateToTasksForLocation = null, onOpenTutorialPreview = null, onOpenPlantCatalogPreview = null }) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const [tab, setTab] = useState('tasks');
  const [zoneName, setZoneName] = useState(stripLeadingMarkerEmoji(zone.name || '', emojiParsingList));
  const [zoneEmoji, setZoneEmoji] = useState(
    () => detectLeadingMarkerEmoji(zone.name || '', emojiParsingList) || markerEmojis[0] || '📍',
  );
  const [livingBeings, setLivingBeings] = useState(
    () => orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant),
  );
  const [stage, setStage] = useState(zone.stage || 'empty');
  const [desc, setDesc] = useState(zone.description || '');
  const [visitSubtitle, setVisitSubtitle] = useState(zone.visit_subtitle || '');
  const [visitShortDesc, setVisitShortDesc] = useState(zone.visit_short_description || '');
  const [visitDetailsTitle, setVisitDetailsTitle] = useState(zone.visit_details_title || 'Détails');
  const [visitDetailsText, setVisitDetailsText] = useState(zone.visit_details_text || '');
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkTutorialId, setLinkTutorialId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [toast, setToast] = useState(null);

  const displayStage = zone.special ? 'special' : zone.stage;
  const zoneLivingNames = orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant);
  const plantObj = plants.find((p) => p.name === zoneLivingNames[0]);
  const zoneTitleDisplay = zone.special
    ? (zone.name || '')
    : (stripLeadingMarkerEmoji(zone.name || '', emojiParsingList) || zone.name || '');
  const taskMapId = (t) => t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
  const linkedTasks = (tasks || []).filter((t) => (
    taskLocationIds(t).zoneIds.some((id) => String(id) === String(zone.id)) && !isTaskDetachedFromLocation(t)
  ));
  const studentAssignableTasks = linkedTasks.filter((t) => canStudentAssignTask(t, student));
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    if (isTaskDetachedFromLocation(t)) return false;
    const mapId = taskMapId(t);
    return mapId === zone.map_id || mapId == null;
  });
  const showTasksTab = isTeacher || (!!student && linkedTasks.length > 0);
  const linkedTutorialsDirect = (tutorials || []).filter((tu) => (
    tutorialLocationIds(tu).zoneIds.some((id) => String(id) === String(zone.id))
  ));
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation('zone', zone.id, tasks, tutorials);
  const linkedTutorialsAll = dedupeTutorialsById([...linkedTutorialsDirect, ...tutorialsFromTasksHere]);
  const tutorialsOnlyViaTasks = tutorialsFromTasksHere.filter(
    (tu) => !linkedTutorialsDirect.some((d) => String(d.id) === String(tu.id)),
  );
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const showTutorialsTab = isTeacher || linkedTutorialsVisible.length > 0;
  const livingBeingsFromTasksHere = livingBeingNamesFromTasksAtLocation('zone', zone.id, tasks);
  const livingBeingsOnlyOnTasks = livingBeingsFromTasksHere.filter((n) => !zoneLivingNames.includes(n));
  const assignableTutorials = (tutorials || []).filter((tu) => (
    tu.is_active !== false
    && !tutorialLocationIds(tu).zoneIds.some((id) => String(id) === String(zone.id))
    && tutorialLinkedToSameMap(tu, zone.map_id)
  ));

  useEffect(() => {
    if (!showTasksTab && tab === 'tasks') {
      setTab('info');
    }
  }, [showTasksTab, tab]);

  useEffect(() => {
    if (!showTutorialsTab && tab === 'tutorials') {
      setTab('info');
    }
  }, [showTutorialsTab, tab]);

  useEffect(() => {
    setZoneName(stripLeadingMarkerEmoji(zone.name || '', emojiParsingList));
    setZoneEmoji(detectLeadingMarkerEmoji(zone.name || '', emojiParsingList) || markerEmojis[0] || '📍');
    setLivingBeings(orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant));
    setStage(zone.stage || 'empty');
    setDesc(zone.description || '');
    setVisitSubtitle(zone.visit_subtitle || '');
    setVisitShortDesc(zone.visit_short_description || '');
    setVisitDetailsTitle(zone.visit_details_title || 'Détails');
    setVisitDetailsText(zone.visit_details_text || '');
  }, [zone.id, zone.name, zone.living_beings, zone.living_beings_list, zone.current_plant, zone.stage, zone.description, zone.visit_subtitle, zone.visit_short_description, zone.visit_details_title, zone.visit_details_text, emojiParsingList, markerEmojis]);

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => studentAssignableTasks.some((t) => t.id === id)));
  }, [studentAssignableTasks]);

  const save = async () => {
    const cleanName = stripLeadingMarkerEmoji(zoneName, emojiParsingList);
    if (!cleanName) {
      setToast('Nom requis');
      return;
    }
    const prefixEmoji = clampEmojiInput(
      (zoneEmoji || '').trim() || markerEmojis[0] || '📍',
      ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
    );
    setSaving(true);
    try {
      await onUpdate(zone.id, {
        name: `${prefixEmoji} ${cleanName}`.trim(),
        current_plant: '',
        living_beings: livingBeings,
        stage,
        description: desc,
        visit_subtitle: visitSubtitle,
        visit_short_description: visitShortDesc,
        visit_details_title: visitDetailsTitle,
        visit_details_text: visitDetailsText,
      });
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (e) { setToast('Erreur'); }
    setSaving(false);
  };

  const TABS = [
    ...(showTasksTab ? [{ id: 'tasks', label: '✅ Tâches' }] : []),
    ...(showTutorialsTab ? [{ id: 'tutorials', label: '📘 Tutoriels' }] : []),
    { id: 'info', label: 'ℹ️ Info' },
    { id: 'photos', label: '📷 Photos' },
    ...(isTeacher && !zone.special ? [{ id: 'edit', label: '✏️ Modifier' }] : []),
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        style={{ paddingTop: 16 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Zone ${zoneTitleDisplay}`}
        tabIndex={-1}
      >
        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        <button className="modal-close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{zone.name}</h3>
            <div style={{ marginTop: 3 }}>{stageBadge(displayStage)}</div>
          </div>
          {isTeacher && !zone.special && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {onDuplicate && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={duplicating}
                  title="Créer une copie sur la même carte (contour légèrement décalé)"
                  onClick={async () => {
                    setDuplicating(true);
                    try {
                      await onDuplicate(zone);
                    } catch (_) {
                      setToast('Duplication impossible');
                    }
                    setDuplicating(false);
                  }}>
                  {duplicating ? '…' : '📋 Copie'}
                </button>
              )}
              <button type="button" className="btn btn-danger btn-sm"
                onClick={() => { if (confirm(`Supprimer "${zone.name}" ?`)) { onDelete(zone.id); onClose(); } }}>
                🗑️
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, marginBottom: 14, gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', fontSize: '.8rem', fontWeight: tab === t.id ? 700 : 400,
                background: tab === t.id ? 'var(--forest)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--soil)', transition: 'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {onNavigateToTasksForLocation && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={() => {
                onNavigateToTasksForLocation({ kind: 'zone', id: String(zone.id) });
                onClose();
              }}>
              ✅ Ouvrir l’onglet Tâches filtré sur cette zone
            </button>
            <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
              Affiche les tâches et tutoriels rattachés à ce lieu dans la liste des tâches.
            </p>
          </div>
        )}

        {tab === 'info' && (
          <div className="fade-in">
            {!zone.special && (() => {
              const names = orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant);
              if (names.length === 0) return null;
              return onOpenPlantCatalogPreview ? (
                <BiodiversitySpeciesOpenLinks plants={plants} names={names} onOpenPlant={onOpenPlantCatalogPreview} />
              ) : (
                <LivingBeingsCatalogPanel plants={plants} names={names} />
              );
            })()}
            {!zone.special && livingBeingsOnlyOnTasks.length > 0 && (
              <div style={{ marginTop: zoneLivingNames.length ? 14 : 0 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '.88rem', color: 'var(--forest)' }}>Également dans les missions</h4>
                {onOpenPlantCatalogPreview ? (
                  <BiodiversitySpeciesOpenLinks
                    plants={plants}
                    names={livingBeingsOnlyOnTasks}
                    showHeading={false}
                    sectionTitle="Également dans les missions"
                    onOpenPlant={onOpenPlantCatalogPreview}
                  />
                ) : (
                  <LivingBeingsCatalogPanel plants={plants} names={livingBeingsOnlyOnTasks} showHeading={false} />
                )}
              </div>
            )}
            {zone.description && (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                border: '1px solid var(--mint)', fontSize: '.88rem', color: '#333', lineHeight: 1.6 }}>
                {zone.description}
              </div>
            )}
            {(zone.visit_subtitle || zone.visit_short_description || zone.visit_details_text) && (
              <div style={{ marginBottom: 12 }}>
                {zone.visit_subtitle && <p className="visit-subtitle" style={{ margin: '0 0 8px' }}>{zone.visit_subtitle}</p>}
                {zone.visit_short_description && (
                  <p style={{ margin: '0 0 8px', fontSize: '.88rem', color: '#333', lineHeight: 1.55 }}>{zone.visit_short_description}</p>
                )}
                {zone.visit_details_text && (
                  <details className="visit-details" style={{ marginTop: 8 }}>
                    <summary>{zone.visit_details_title || 'Détails'}</summary>
                    <p style={{ margin: '8px 0 0', fontSize: '.86rem', lineHeight: 1.55 }}>{zone.visit_details_text}</p>
                  </details>
                )}
              </div>
            )}
            {zone.history?.length > 0 && (
              <div className="history-list">
                <h4>Historique cultures</h4>
                {zone.history.map((h, i) => (
                  <div key={i} className="history-item">
                    <span>{h.plant}</span><span style={{ color: '#aaa', fontSize: '.76rem' }}>{h.harvested_at}</span>
                  </div>
                ))}
              </div>
            )}
            {!zone.special
              && orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant).length === 0
              && livingBeingsOnlyOnTasks.length === 0
              && !zone.description && zone.history?.length === 0
              && !zone.visit_subtitle && !zone.visit_short_description && !zone.visit_details_text && (
              <p style={{ color: '#bbb', fontSize: '.85rem', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                Zone vide — aucune information pour l'instant.
              </p>
            )}
            {contextCommentsEnabled && (
              <ContextComments
                contextType="zone"
                contextId={zone.id}
                title="Commentaires de la zone"
                placeholder="Ajouter une observation sur cette zone..."
                canParticipateContextComments={canParticipateContextComments}
              />
            )}
          </div>
        )}

        {tab === 'photos' && (
          <div className="fade-in">
            <PhotoGallery zoneId={zone.id} isTeacher={isTeacher} />
          </div>
        )}

        {tab === 'edit' && isTeacher && !zone.special && (
          <div className="fade-in">
            <div className="field"><label>Nom de la zone *</label>
              <input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Ex: Potager Est" />
            </div>
            <div className="field"><label>Êtres vivants</label>
              <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                Maintenez Ctrl (Windows) ou Cmd (Mac) pour en choisir plusieurs. L’ordre de la liste est conservé pour l’affichage.
                Retirer un être vivant de la liste peut l’enregistrer dans l’historique des cultures.
              </p>
              <select
                multiple
                size={Math.min(10, Math.max(4, plants.length + 1))}
                value={livingBeings}
                onChange={(e) => {
                  const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  const next = nextLivingBeingsFromMultiSelect(livingBeings, picked, plants);
                  setLivingBeings(next);
                  if (next.length === 0) setStage('empty');
                  else if (stage === 'empty') setStage('growing');
                }}>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            {livingBeings.length > 0 && (
              <LivingBeingsCatalogPanel plants={plants} names={livingBeings} showHeading={false} />
            )}
            <div className="field"><label>État</label>
              <select value={stage} onChange={e => setStage(e.target.value)}>
                <option value="empty">Vide</option>
                <option value="growing">En croissance</option>
                <option value="ready">Prêt à récolter</option>
              </select>
            </div>
            <div className="field"><label>Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                placeholder="Observations, conseils, notes sur cette zone..." />
            </div>
            <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
              Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc dépliable).
            </p>
            <div className="field"><label>Sous-titre (visite)</label>
              <input value={visitSubtitle} onChange={(e) => setVisitSubtitle(e.target.value)} placeholder="Optionnel" />
            </div>
            <div className="field"><label>Description courte (visite)</label>
              <textarea value={visitShortDesc} onChange={(e) => setVisitShortDesc(e.target.value)} rows={2} placeholder="Texte d’accroche sous le titre" />
            </div>
            <div className="field"><label>Titre du bloc dépliable (visite)</label>
              <input value={visitDetailsTitle} onChange={(e) => setVisitDetailsTitle(e.target.value)} placeholder="Détails" />
            </div>
            <div className="field"><label>Détails dépliables (visite)</label>
              <textarea value={visitDetailsText} onChange={(e) => setVisitDetailsText(e.target.value)} rows={4} placeholder="Contenu du panneau repliable" />
            </div>
            <div className="field"><label htmlFor="zone-edit-emoji-custom">Emoji de zone</label>
              <ZoneOrMarkerEmojiField
                id="zone-edit-emoji-custom"
                value={zoneEmoji}
                onChange={setZoneEmoji}
                maxLen={ZONE_NAME_PREFIX_EMOJI_MAX_CHARS}
              />
              <div style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                maxHeight: 180,
                overflowY: 'auto',
                paddingRight: 2,
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
              }}>
                {markerEmojis.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    className={`emoji-btn ${zoneEmoji === emoji ? 'sel' : ''}`}
                    onClick={() => setZoneEmoji(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? '...' : '💾 Sauvegarder'}
            </button>
            {onEditPoints && (
              <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }}
                onClick={() => { onEditPoints(zone); onClose(); }}>
                🔷 Modifier le contour de la zone
              </button>
            )}
          </div>
        )}
        {tab === 'tasks' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à cette zone.</p>
              ) : linkedTasks.map((t) => (
                <div key={t.id} className="history-item" style={{ alignItems: 'center' }}>
                  <span>{t.title}</span>
                  <button className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await onUnlinkTask?.(t);
                      setToast('Tâche dissociée');
                    }}>
                    Délier
                  </button>
                </div>
              ))}
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>Lier une tâche existante</label>
              <select value={linkTaskId} onChange={e => setLinkTaskId(e.target.value)}>
                <option value="">— Choisir une tâche —</option>
                {assignableTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-full" disabled={!linkTaskId}
              onClick={async () => {
                await onLinkTask?.(linkTaskId);
                setLinkTaskId('');
                setToast('Tâche liée à la zone ✓');
              }}>
              🔗 Lier la tâche
            </button>
          </div>
        )}
        {tab === 'tasks' && !isTeacher && (
          <div className="fade-in">
            {linkedTasks.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à cette zone.</p>
            ) : (
              <>
                <TaskEnrollmentLegend />
                <p style={{ color: '#666', fontSize: '.84rem', marginBottom: 10 }}>
                  {canSelfAssignTasks
                    ? 'Sélectionne une ou plusieurs tâches puis inscris-toi directement.'
                    : 'Profil visiteur : consultation en lecture seule.'}
                </p>
                {canSelfAssignTasks && Number(student?.taskEnrollment?.maxActiveAssignments) > 0 && (
                  <p style={{ fontSize: '.78rem', color: student?.taskEnrollment?.atLimit ? '#92400e' : '#166534', marginBottom: 10, lineHeight: 1.45 }}>
                    {student.taskEnrollment?.atLimit
                      ? `Limite atteinte (${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} tâches actives). Retire-toi d’une tâche ou attends une validation.`
                      : `Tâches actives : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} (non validées, toutes cartes).`}
                  </p>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  {linkedTasks.map((t) => {
                    const canAssign = canStudentAssignTask(t, student);
                    const isMine = isStudentAssignedToTask(t, student);
                    const meta = taskEnrollmentMeta(t, student);
                    const checked = selectedTaskIds.includes(t.id);
                    return (
                      <label key={t.id} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        background: checked ? '#f0fdf4' : 'var(--parchment)',
                        cursor: canAssign ? 'pointer' : 'default',
                        opacity: canAssign || isMine ? 1 : 0.72,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEnroll || !canAssign || assigning}
                          onChange={() => {
                            if (!canEnroll || !canAssign) return;
                            setSelectedTaskIds((prev) => (
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            ));
                          }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--forest)', fontSize: '.9rem' }}>{t.title}</div>
                          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span className="task-chip" style={{ color: meta.tone, borderColor: meta.border, background: meta.bg }}>
                              <span style={{ marginRight: 4, opacity: .8 }}>{meta.dot}</span>{meta.label}
                            </span>
                            <TaskDifficultyAndRiskChips task={t} />
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 12 }}
                  disabled={!canEnroll || assigning || selectedTaskIds.length === 0}
                  onClick={async () => {
                    if (!onAssignTasks || selectedTaskIds.length === 0) return;
                    setAssigning(true);
                    const result = await onAssignTasks(selectedTaskIds);
                    if (result.failedCount > 0) {
                      const ok = result.assignedCount > 0 ? `${result.assignedCount} tâche(s) prise(s). ` : '';
                      setToast(`${ok}${result.failedCount} échec(s) : ${result.firstError || 'erreur inconnue'}`);
                    } else {
                      setToast(`${result.assignedCount} tâche(s) prise(s) en charge ✓`);
                    }
                    setSelectedTaskIds([]);
                    setAssigning(false);
                  }}>
                  {assigning ? 'Inscription...' : `✋ M'inscrire à ${selectedTaskIds.length || '...'} tâche(s)`}
                </button>
              </>
            )}
          </div>
        )}
        {tab === 'tutorials' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTutorialsDirect.length === 0 && tutorialsOnlyViaTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à cette zone.</p>
              ) : (
                <>
                  {linkedTutorialsDirect.length === 0 ? null : linkedTutorialsDirect.map((tu) => (
                    <div key={tu.id} className="history-item" style={{ alignItems: 'center' }}>
                      <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          await onUnlinkTutorial?.(tu);
                          setToast('Tutoriel dissocié');
                        }}>
                        Délier
                      </button>
                    </div>
                  ))}
                  {tutorialsOnlyViaTasks.length > 0 && (
                    <div style={{ marginTop: linkedTutorialsDirect.length ? 16 : 0 }}>
                      <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                        Rattachés aux missions sur ce lieu (pour les retirer, modifie la tâche concernée).
                      </p>
                      {tutorialsOnlyViaTasks.map((tu) => (
                        <div key={`task-tu-${tu.id}`} className="history-item" style={{ alignItems: 'center' }}>
                          <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>Lier un tutoriel à cette zone</label>
              <select value={linkTutorialId} onChange={(e) => setLinkTutorialId(e.target.value)}>
                <option value="">— Choisir un tutoriel —</option>
                {assignableTutorials.map((tu) => (
                  <option key={tu.id} value={String(tu.id)}>{tu.title}</option>
                ))}
              </select>
              <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
                Tu peux lier plusieurs tutoriels en répétant l’opération pour chaque fiche.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={!linkTutorialId}
              onClick={async () => {
                await onLinkTutorial?.(linkTutorialId);
                setLinkTutorialId('');
                setToast('Tutoriel lié à la zone ✓');
              }}>
              🔗 Lier le tutoriel
            </button>
          </div>
        )}
        {tab === 'tutorials' && !isTeacher && (
          <div className="fade-in">
            {linkedTutorialsVisible.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à cette zone.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {linkedTutorialsVisible.map((tu) => {
                  const otherZones = (tu.zones_linked || []).filter((z) => z.id !== zone.id);
                  const markers = tu.markers_linked || [];
                  return (
                    <div
                      key={tu.id}
                      style={{
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        background: 'var(--parchment)',
                      }}>
                      <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{tu.title}</div>
                      {tu.summary && (
                        <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#555', lineHeight: 1.45 }}>{tu.summary}</p>
                      )}
                      {otherZones.length > 0 && (
                        <p style={{ margin: '10px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Autres zones</strong> : {otherZones.map((z) => z.name).join(', ')}
                        </p>
                      )}
                      {markers.length > 0 && (
                        <p style={{ margin: '6px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Repères</strong> : {markers.map((m) => m.label).join(', ')}
                        </p>
                      )}
                      {tutorialPreviewCanEmbed(tu) && onOpenTutorialPreview ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 10 }}
                          onClick={() => onOpenTutorialPreview(tutorialPreviewPayload(tu))}
                        >
                          📖 Consulter
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoneDrawModal({ points_pct, onClose, onSave, plants, markerEmojis = MARKER_EMOJIS, emojiParsingList = MARKER_EMOJIS }) {
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const [form, setForm] = useState({
    name: '',
    zone_emoji: markerEmojis[0] || '📍',
    living_beings: [],
    stage: 'empty',
    description: '',
    color: ZONE_COLORS[0],
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    const cleanName = stripLeadingMarkerEmoji(form.name, emojiParsingList);
    if (!cleanName) return;
    const prefixEmoji = clampEmojiInput(
      (form.zone_emoji || '').trim() || markerEmojis[0] || '📍',
      ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
    );
    setSaving(true);
    try {
      const { zone_emoji, living_beings, ...rest } = form;
      const living = living_beings || [];
      await onSave({
        ...rest,
        name: `${prefixEmoji} ${cleanName}`.trim(),
        points: points_pct,
        current_plant: '',
        living_beings: living,
      });
      onClose();
    }
    catch (e) { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Nouvelle zone"
        tabIndex={-1}
      >
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>🖊️ Nouvelle zone</h3>
        <p style={{ fontSize: '.83rem', color: '#888', marginBottom: 14 }}>{points_pct.length} points tracés</p>
        <div className="field"><label>Nom *</label>
          <input value={form.name} onChange={set('name')} placeholder="Ex: Potager Est" autoFocus />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Êtres vivants</label>
            <p style={{ fontSize: '.74rem', color: '#64748b', margin: '0 0 6px', lineHeight: 1.4 }}>
              Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
            </p>
            <select
              multiple
              size={Math.min(8, Math.max(4, plants.length + 1))}
              value={form.living_beings}
              onChange={(e) => {
                const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setForm((f) => {
                  const next = nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants);
                  let stage = f.stage;
                  if (next.length === 0) stage = 'empty';
                  else if (f.stage === 'empty') stage = 'growing';
                  return { ...f, living_beings: next, stage };
                });
              }}>
              {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
            </select>
          </div>
          <div className="field"><label>État</label>
            <select value={form.stage} onChange={set('stage')}>
              <option value="empty">Vide</option>
              <option value="growing">En croissance</option>
              <option value="ready">Prêt à récolter</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2}
            placeholder="Notes, observations sur cette zone..." />
        </div>
        <div className="field"><label>Couleur</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ZONE_COLORS.map(c => (
              <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, cursor: 'pointer',
                  border: form.color === c ? '3px solid #1a4731' : '2px solid #ddd',
                  transition: 'transform .1s', transform: form.color === c ? 'scale(1.15)' : 'none' }} />
            ))}
          </div>
        </div>
        <div className="field"><label htmlFor="zone-draw-emoji-custom">Emoji de zone</label>
          <ZoneOrMarkerEmojiField
            id="zone-draw-emoji-custom"
            value={form.zone_emoji}
            onChange={(v) => setForm((f) => ({ ...f, zone_emoji: v }))}
            maxLen={ZONE_NAME_PREFIX_EMOJI_MAX_CHARS}
          />
          <div style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            maxHeight: 180,
            overflowY: 'auto',
            paddingRight: 2,
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}>
            {markerEmojis.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={`emoji-btn ${form.zone_emoji === emoji ? 'sel' : ''}`}
                onClick={() => setForm((f) => ({ ...f, zone_emoji: emoji }))}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={save} disabled={saving} style={{ marginTop: 4 }}>
          {saving ? '...' : '✅ Créer la zone'}
        </button>
      </div>
    </div>
  );
}

function MarkerModal({
  marker,
  plants,
  tasks,
  tutorials = [],
  onClose,
  onSave,
  onUpdate,
  onDelete,
  onDuplicate,
  onLinkTask,
  onUnlinkTask,
  onLinkTutorial,
  onUnlinkTutorial,
  onAssignTasks,
  isTeacher,
  student,
  canSelfAssignTasks = true,
  canEnrollOnTasks,
  markerEmojis = MARKER_EMOJIS,
  onNavigateToTasksForLocation = null,
  onOpenTutorialPreview = null,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onRequestAdjustMarkerPosition = null,
  onOpenPlantCatalogPreview = null,
}) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const isNew = !marker.id;
  const [tab, setTab] = useState('tasks');
  const [form, setForm] = useState({
    label: marker.label || '',
    living_beings: orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name),
    note: marker.note || '',
    emoji: marker.emoji || '🌱',
    visit_subtitle: marker.visit_subtitle || '',
    visit_short_description: marker.visit_short_description || '',
    visit_details_title: marker.visit_details_title || 'Détails',
    visit_details_text: marker.visit_details_text || '',
  });
  const [saving, setSaving] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkTutorialId, setLinkTutorialId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const taskMapId = (t) => t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
  const linkedTasks = (tasks || []).filter((t) => (
    taskLocationIds(t).markerIds.some((id) => String(id) === String(marker.id)) && !isTaskDetachedFromLocation(t)
  ));
  const studentAssignableTasks = linkedTasks.filter((t) => canStudentAssignTask(t, student));
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    if (isTaskDetachedFromLocation(t)) return false;
    const mapId = taskMapId(t);
    return mapId === marker.map_id || mapId == null;
  });
  const linkedTutorialsDirect = (tutorials || []).filter((tu) => (
    tutorialLocationIds(tu).markerIds.some((id) => String(id) === String(marker.id))
  ));
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation('marker', marker.id, tasks, tutorials);
  const linkedTutorialsAll = dedupeTutorialsById([...linkedTutorialsDirect, ...tutorialsFromTasksHere]);
  const tutorialsOnlyViaTasks = tutorialsFromTasksHere.filter(
    (tu) => !linkedTutorialsDirect.some((d) => String(d.id) === String(tu.id)),
  );
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const markerLivingNamesOrdered = orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name);
  const livingBeingsFromTasksHere = livingBeingNamesFromTasksAtLocation('marker', marker.id, tasks);
  const livingBeingsOnlyOnTasks = livingBeingsFromTasksHere.filter((n) => !markerLivingNamesOrdered.includes(n));
  const assignableTutorials = (tutorials || []).filter((tu) => (
    tu.is_active !== false
    && !tutorialLocationIds(tu).markerIds.some((id) => String(id) === String(marker.id))
    && tutorialLinkedToSameMap(tu, marker.map_id)
  ));

  const showTasksTab = !isNew && (isTeacher || (!!student && linkedTasks.length > 0));
  const showTutorialsTab = !isNew && (isTeacher || linkedTutorialsVisible.length > 0);

  useEffect(() => {
    if (isNew) return;
    if (!showTasksTab && tab === 'tasks') setTab('info');
  }, [isNew, showTasksTab, tab]);

  useEffect(() => {
    if (isNew) return;
    if (!showTutorialsTab && tab === 'tutorials') setTab('info');
  }, [isNew, showTutorialsTab, tab]);

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => studentAssignableTasks.some((t) => t.id === id)));
  }, [studentAssignableTasks]);

  useEffect(() => {
    setForm({
      label: marker.label || '',
      living_beings: orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name),
      note: marker.note || '',
      emoji: marker.emoji || '🌱',
      visit_subtitle: marker.visit_subtitle || '',
      visit_short_description: marker.visit_short_description || '',
      visit_details_title: marker.visit_details_title || 'Détails',
      visit_details_text: marker.visit_details_text || '',
    });
  }, [
    marker.id,
    marker.label,
    marker.note,
    marker.emoji,
    marker.plant_name,
    marker.living_beings,
    marker.living_beings_list,
    marker.visit_subtitle,
    marker.visit_short_description,
    marker.visit_details_title,
    marker.visit_details_text,
  ]);

  const buildPayload = () => {
    const living = form.living_beings;
    const emojiVal = clampEmojiInput(
      (form.emoji || '').trim() || '🌱',
      MAP_MARKER_EMOJI_MAX_CHARS,
    );
    return {
      ...marker,
      ...form,
      emoji: emojiVal,
      living_beings: living,
      plant_name: '',
      visit_subtitle: form.visit_subtitle,
      visit_short_description: form.visit_short_description,
      visit_details_title: form.visit_details_title,
      visit_details_text: form.visit_details_text,
    };
  };

  const saveNew = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await onSave(buildPayload());
      onClose();
    } catch (e) {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form.label.trim()) return;
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(marker.id, buildPayload());
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (e) {
      setToast('Erreur');
    }
    setSaving(false);
  };

  const TABS_EXISTING = [
    ...(showTasksTab ? [{ id: 'tasks', label: '✅ Tâches' }] : []),
    ...(showTutorialsTab ? [{ id: 'tutorials', label: '📘 Tutoriels' }] : []),
    { id: 'info', label: 'ℹ️ Info' },
    { id: 'photos', label: '📷 Photos' },
    ...(isTeacher ? [{ id: 'edit', label: '✏️ Modifier' }] : []),
  ];

  if (isNew) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div
          ref={dialogRef}
          className="log-modal fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau repère"
          tabIndex={-1}
        >
          {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
          <button className="modal-close" onClick={onClose}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Nouveau repère</h3>
          </div>
          {isTeacher ? (
            <>
              <div className="field"><label>Nom du repère *</label>
                <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10" />
              </div>
              <div className="field"><label>Êtres vivants</label>
                <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                  Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
                </p>
                <select
                  multiple
                  size={Math.min(10, Math.max(4, plants.length + 1))}
                  value={form.living_beings}
                  onChange={(e) => {
                    const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                    setForm((f) => ({
                      ...f,
                      living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
                    }));
                  }}>
                  {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
                </select>
              </div>
              {form.living_beings.length > 0 && (
                <LivingBeingsCatalogPanel plants={plants} names={form.living_beings} showHeading={false} />
              )}
              <div className="field"><label>Description</label>
                <textarea value={form.note} onChange={set('note')} rows={3}
                  placeholder="Observations, entretien..." />
              </div>
              <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc dépliable).
              </p>
              <div className="field"><label>Sous-titre (visite)</label>
                <input value={form.visit_subtitle} onChange={set('visit_subtitle')} placeholder="Optionnel" />
              </div>
              <div className="field"><label>Description courte (visite)</label>
                <textarea value={form.visit_short_description} onChange={set('visit_short_description')} rows={2} placeholder="Texte d’accroche sous le titre" />
              </div>
              <div className="field"><label>Titre du bloc dépliable (visite)</label>
                <input value={form.visit_details_title} onChange={set('visit_details_title')} placeholder="Détails" />
              </div>
              <div className="field"><label>Détails dépliables (visite)</label>
                <textarea value={form.visit_details_text} onChange={set('visit_details_text')} rows={4} placeholder="Contenu du panneau repliable" />
              </div>
              <div className="field"><label htmlFor="marker-new-emoji-custom">Emoji du repère</label>
                <ZoneOrMarkerEmojiField
                  id="marker-new-emoji-custom"
                  value={form.emoji}
                  onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
                  maxLen={MAP_MARKER_EMOJI_MAX_CHARS}
                />
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', paddingRight: 2,
                  WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
                }}>
                  {markerEmojis.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, emoji }))}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={saveNew} disabled={saving}>
                {saving ? '...' : '📍 Placer'}
              </button>
            </>
          ) : (
            <p style={{ color: '#64748b', fontSize: '.9rem' }}>Création de repère réservée au professeur.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        style={{ paddingTop: 16 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Repère ${marker.label || ''}`}
        tabIndex={-1}
      >
        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        <button className="modal-close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{marker.label}</h3>
            <div style={{ marginTop: 3, fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>Repère</div>
          </div>
          {isTeacher && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {onDuplicate && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={duplicating}
                  title="Créer une copie sur la même carte (position légèrement décalée)"
                  onClick={async () => {
                    setDuplicating(true);
                    try {
                      await onDuplicate(marker);
                    } catch (_) {
                      setToast('Duplication impossible');
                    }
                    setDuplicating(false);
                  }}>
                  {duplicating ? '…' : '📋 Copie'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm(`Supprimer le repère « ${marker.label} » ?`)) {
                    onDelete(marker.id);
                    onClose();
                  }
                }}>
                🗑️
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, marginBottom: 14, gap: 2 }}>
          {TABS_EXISTING.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif',
                fontSize: '.8rem',
                fontWeight: tab === t.id ? 700 : 400,
                background: tab === t.id ? 'var(--forest)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--soil)',
                transition: 'all .15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {onNavigateToTasksForLocation && marker.id && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={() => {
                onNavigateToTasksForLocation({ kind: 'marker', id: String(marker.id) });
                onClose();
              }}>
              ✅ Ouvrir l’onglet Tâches filtré sur ce repère
            </button>
            <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
              Affiche les tâches et tutoriels rattachés à ce lieu dans la liste des tâches.
            </p>
          </div>
        )}

        {tab === 'tasks' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à ce repère.</p>
              ) : linkedTasks.map((t) => (
                <div key={t.id} className="history-item" style={{ alignItems: 'center' }}>
                  <span>{t.title}</span>
                  <button className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await onUnlinkTask?.(t);
                      setToast('Tâche dissociée');
                    }}>
                    Délier
                  </button>
                </div>
              ))}
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>Lier une tâche existante</label>
              <select value={linkTaskId} onChange={e => setLinkTaskId(e.target.value)}>
                <option value="">— Choisir une tâche —</option>
                {assignableTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-full" disabled={!linkTaskId}
              onClick={async () => {
                await onLinkTask?.(linkTaskId);
                setLinkTaskId('');
                setToast('Tâche liée au repère ✓');
              }}>
              🔗 Lier la tâche
            </button>
          </div>
        )}
        {tab === 'tasks' && !isTeacher && (
          <div className="fade-in">
            {linkedTasks.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à ce repère.</p>
            ) : (
              <>
                <TaskEnrollmentLegend />
                <p style={{ color: '#666', fontSize: '.84rem', marginBottom: 10 }}>
                  {canSelfAssignTasks
                    ? 'Sélectionne une ou plusieurs tâches puis inscris-toi directement.'
                    : 'Profil visiteur : consultation en lecture seule.'}
                </p>
                {canSelfAssignTasks && Number(student?.taskEnrollment?.maxActiveAssignments) > 0 && (
                  <p style={{ fontSize: '.78rem', color: student?.taskEnrollment?.atLimit ? '#92400e' : '#166534', marginBottom: 10, lineHeight: 1.45 }}>
                    {student.taskEnrollment?.atLimit
                      ? `Limite atteinte (${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} tâches actives). Retire-toi d’une tâche ou attends une validation.`
                      : `Tâches actives : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} (non validées, toutes cartes).`}
                  </p>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  {linkedTasks.map((t) => {
                    const canAssign = canStudentAssignTask(t, student);
                    const isMine = isStudentAssignedToTask(t, student);
                    const meta = taskEnrollmentMeta(t, student);
                    const checked = selectedTaskIds.includes(t.id);
                    return (
                      <label key={t.id} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        background: checked ? '#f0fdf4' : 'var(--parchment)',
                        cursor: canAssign ? 'pointer' : 'default',
                        opacity: canAssign || isMine ? 1 : 0.72,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEnroll || !canAssign || assigning}
                          onChange={() => {
                            if (!canEnroll || !canAssign) return;
                            setSelectedTaskIds((prev) => (
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            ));
                          }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--forest)', fontSize: '.9rem' }}>{t.title}</div>
                          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span className="task-chip" style={{ color: meta.tone, borderColor: meta.border, background: meta.bg }}>
                              <span style={{ marginRight: 4, opacity: .8 }}>{meta.dot}</span>{meta.label}
                            </span>
                            <TaskDifficultyAndRiskChips task={t} />
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 12 }}
                  disabled={!canEnroll || assigning || selectedTaskIds.length === 0}
                  onClick={async () => {
                    if (!onAssignTasks || selectedTaskIds.length === 0) return;
                    setAssigning(true);
                    const result = await onAssignTasks(selectedTaskIds);
                    if (result.failedCount > 0) {
                      const ok = result.assignedCount > 0 ? `${result.assignedCount} tâche(s) prise(s). ` : '';
                      setToast(`${ok}${result.failedCount} échec(s) : ${result.firstError || 'erreur inconnue'}`);
                    } else {
                      setToast(`${result.assignedCount} tâche(s) prise(s) en charge ✓`);
                    }
                    setSelectedTaskIds([]);
                    setAssigning(false);
                  }}>
                  {assigning ? 'Inscription...' : `✋ M'inscrire à ${selectedTaskIds.length || '...'} tâche(s)`}
                </button>
              </>
            )}
          </div>
        )}
        {tab === 'tutorials' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTutorialsDirect.length === 0 && tutorialsOnlyViaTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à ce repère.</p>
              ) : (
                <>
                  {linkedTutorialsDirect.length === 0 ? null : linkedTutorialsDirect.map((tu) => (
                    <div key={tu.id} className="history-item" style={{ alignItems: 'center' }}>
                      <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          await onUnlinkTutorial?.(tu);
                          setToast('Tutoriel dissocié');
                        }}>
                        Délier
                      </button>
                    </div>
                  ))}
                  {tutorialsOnlyViaTasks.length > 0 && (
                    <div style={{ marginTop: linkedTutorialsDirect.length ? 16 : 0 }}>
                      <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                        Rattachés aux missions sur ce lieu (pour les retirer, modifie la tâche concernée).
                      </p>
                      {tutorialsOnlyViaTasks.map((tu) => (
                        <div key={`task-tu-${tu.id}`} className="history-item" style={{ alignItems: 'center' }}>
                          <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>Lier un tutoriel à ce repère</label>
              <select value={linkTutorialId} onChange={(e) => setLinkTutorialId(e.target.value)}>
                <option value="">— Choisir un tutoriel —</option>
                {assignableTutorials.map((tu) => (
                  <option key={tu.id} value={String(tu.id)}>{tu.title}</option>
                ))}
              </select>
              <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
                Tu peux lier plusieurs tutoriels en répétant l’opération pour chaque fiche.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={!linkTutorialId}
              onClick={async () => {
                await onLinkTutorial?.(linkTutorialId);
                setLinkTutorialId('');
                setToast('Tutoriel lié au repère ✓');
              }}>
              🔗 Lier le tutoriel
            </button>
          </div>
        )}
        {tab === 'tutorials' && !isTeacher && (
          <div className="fade-in">
            {linkedTutorialsVisible.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à ce repère.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {linkedTutorialsVisible.map((tu) => {
                  const zones = tu.zones_linked || [];
                  const otherMarkers = (tu.markers_linked || []).filter((mk) => mk.id !== marker.id);
                  return (
                    <div
                      key={tu.id}
                      style={{
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        background: 'var(--parchment)',
                      }}>
                      <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{tu.title}</div>
                      {tu.summary && (
                        <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#555', lineHeight: 1.45 }}>{tu.summary}</p>
                      )}
                      {zones.length > 0 && (
                        <p style={{ margin: '10px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Zones</strong> : {zones.map((z) => z.name).join(', ')}
                        </p>
                      )}
                      {otherMarkers.length > 0 && (
                        <p style={{ margin: '6px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Autres repères</strong> : {otherMarkers.map((m) => m.label).join(', ')}
                        </p>
                      )}
                      {tutorialPreviewCanEmbed(tu) && onOpenTutorialPreview ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 10 }}
                          onClick={() => onOpenTutorialPreview(tutorialPreviewPayload(tu))}
                        >
                          📖 Consulter
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {tab === 'info' && (
          <div className="fade-in">
            {(() => {
              const names = orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name);
              if (names.length === 0) return null;
              return onOpenPlantCatalogPreview ? (
                <BiodiversitySpeciesOpenLinks plants={plants} names={names} onOpenPlant={onOpenPlantCatalogPreview} />
              ) : (
                <LivingBeingsCatalogPanel plants={plants} names={names} />
              );
            })()}
            {livingBeingsOnlyOnTasks.length > 0 && (
              <div style={{ marginTop: markerLivingNamesOrdered.length ? 14 : 0 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '.88rem', color: 'var(--forest)' }}>Également dans les missions</h4>
                {onOpenPlantCatalogPreview ? (
                  <BiodiversitySpeciesOpenLinks
                    plants={plants}
                    names={livingBeingsOnlyOnTasks}
                    showHeading={false}
                    sectionTitle="Également dans les missions"
                    onOpenPlant={onOpenPlantCatalogPreview}
                  />
                ) : (
                  <LivingBeingsCatalogPanel plants={plants} names={livingBeingsOnlyOnTasks} showHeading={false} />
                )}
              </div>
            )}
            {marker.note && (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                border: '1px solid var(--mint)', fontSize: '.88rem', color: '#333', lineHeight: 1.6 }}>
                {marker.note}
              </div>
            )}
            {(marker.visit_subtitle || marker.visit_short_description || marker.visit_details_text) && (
              <div style={{ marginBottom: 12 }}>
                {marker.visit_subtitle && <p className="visit-subtitle" style={{ margin: '0 0 8px' }}>{marker.visit_subtitle}</p>}
                {marker.visit_short_description && (
                  <p style={{ margin: '0 0 8px', fontSize: '.88rem', color: '#333', lineHeight: 1.55 }}>{marker.visit_short_description}</p>
                )}
                {marker.visit_details_text && (
                  <details className="visit-details" style={{ marginTop: 8 }}>
                    <summary>{marker.visit_details_title || 'Détails'}</summary>
                    <p style={{ margin: '8px 0 0', fontSize: '.86rem', lineHeight: 1.55 }}>{marker.visit_details_text}</p>
                  </details>
                )}
              </div>
            )}
            {orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name).length === 0
              && livingBeingsOnlyOnTasks.length === 0
              && !marker.note
              && !marker.visit_subtitle && !marker.visit_short_description && !marker.visit_details_text && (
              <p style={{ color: '#bbb', fontSize: '.85rem', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                Aucune information pour l’instant.
              </p>
            )}
            {contextCommentsEnabled && (
              <ContextComments
                contextType="marker"
                contextId={marker.id}
                title="Commentaires du repère"
                placeholder="Ajouter une observation sur ce repère..."
                canParticipateContextComments={canParticipateContextComments}
              />
            )}
          </div>
        )}
        {tab === 'photos' && (
          <div className="fade-in">
            <PhotoGallery markerId={marker.id} isTeacher={isTeacher} />
          </div>
        )}
        {tab === 'edit' && isTeacher && (
          <div className="fade-in">
            <div className="field"><label>Nom du repère *</label>
              <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10" />
            </div>
            <div className="field"><label>Êtres vivants</label>
              <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
              </p>
              <select
                multiple
                size={Math.min(10, Math.max(4, plants.length + 1))}
                value={form.living_beings}
                onChange={(e) => {
                  const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setForm((f) => ({
                    ...f,
                    living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
                  }));
                }}>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            {form.living_beings.length > 0 && (
              <LivingBeingsCatalogPanel plants={plants} names={form.living_beings} showHeading={false} />
            )}
            <div className="field"><label>Description</label>
              <textarea value={form.note} onChange={set('note')} rows={3}
                placeholder="Observations, entretien..." />
            </div>
            <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
              Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc dépliable).
            </p>
            <div className="field"><label>Sous-titre (visite)</label>
              <input value={form.visit_subtitle} onChange={set('visit_subtitle')} placeholder="Optionnel" />
            </div>
            <div className="field"><label>Description courte (visite)</label>
              <textarea value={form.visit_short_description} onChange={set('visit_short_description')} rows={2} placeholder="Texte d’accroche sous le titre" />
            </div>
            <div className="field"><label>Titre du bloc dépliable (visite)</label>
              <input value={form.visit_details_title} onChange={set('visit_details_title')} placeholder="Détails" />
            </div>
            <div className="field"><label>Détails dépliables (visite)</label>
              <textarea value={form.visit_details_text} onChange={set('visit_details_text')} rows={4} placeholder="Contenu du panneau repliable" />
            </div>
            <div className="field"><label htmlFor="marker-edit-emoji-custom">Emoji du repère</label>
              <ZoneOrMarkerEmojiField
                id="marker-edit-emoji-custom"
                value={form.emoji}
                onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
                maxLen={MAP_MARKER_EMOJI_MAX_CHARS}
              />
              <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', paddingRight: 2,
                WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
              }}>
                {markerEmojis.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, emoji }))}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={saveEdit} disabled={saving}>
              {saving ? '...' : '💾 Sauvegarder'}
            </button>
            {onRequestAdjustMarkerPosition && (
              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 8 }}
                onClick={() => {
                  onRequestAdjustMarkerPosition();
                  onClose();
                }}>
                📍 Ajuster la position sur la carte
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function clampEditZonePct(p) {
  return {
    xp: Math.min(100, Math.max(0, Number(p.xp) || 0)),
    yp: Math.min(100, Math.max(0, Number(p.yp) || 0)),
  };
}

function clampEditPts(pts) {
  return (pts || []).map(clampEditZonePct);
}

function cloneEditPts(pts) {
  return pts.map((p) => ({ xp: p.xp, yp: p.yp }));
}

function editPtsSnapshotEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].xp !== b[i].xp || a[i].yp !== b[i].yp) return false;
  }
  return true;
}

/** Décale le polygone (%) pour une copie visible à côté de l’original. */
function offsetDuplicateZonePoints(pts, dx = 2.5, dy = 2.5) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  return pts.map((p) => clampEditZonePct({
    xp: (Number(p.xp) || 0) + dx,
    yp: (Number(p.yp) || 0) + dy,
  }));
}

function useMapGestures({ mapImageSrc, activeMapId, mode, onRefresh, embedded = false, mapLayoutOuterRef = null }) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const imgRef = useRef(null);
  const tx = useRef({ x: 0, y: 0, s: 1 });
  const [committed, setCommitted] = useState({ x: 0, y: 0, s: 1 });
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const imgSizeRef = useRef({ w: 1, h: 1 });
  const moved = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const pinching = useRef(false);
  const zoomAnimRafRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const rafId = useRef(null);
  const commitRef = useRef(null);
  const draggingMarkerRef = useRef(null);
  const draggingMarkerEl = useRef(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(true);

  const applyTransform = () => {
    if (!worldRef.current) return;
    const { x, y, s } = tx.current;
    worldRef.current.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  };

  const commit = () => {
    const snap = { ...tx.current };
    setCommitted(snap);
    cancelAnimationFrame(commitRef.current);
    commitRef.current = requestAnimationFrame(applyTransform);
  };

  const scheduleApply = () => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      applyTransform();
      rafId.current = null;
    });
  };

  /** Ajuste la carte au conteneur sans forcer un re-render si rien n’a changé (évite le gel mobile quand la barre d’adresse redimensionne la vue en boucle). */
  const commitFitLayout = (x, y, s) => {
    tx.current = { x, y, s };
    applyTransform();
    setCommitted((prev) => {
      if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 && Math.abs(prev.s - s) < 1e-4) return prev;
      return { x, y, s };
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedMotionRef.current = !!mq.matches;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const cancelToolbarZoomAnim = () => {
    if (zoomAnimRafRef.current != null) {
      cancelAnimationFrame(zoomAnimRafRef.current);
      zoomAnimRafRef.current = null;
    }
  };

  /** Zoom boutons +/− : interpolation courte : même cible que l’ancien saut, sans effet « par paliers ». */
  const animateZoomTowardScale = (targetS, pivotLocalX, pivotLocalY) => {
    cancelToolbarZoomAnim();
    const start = { ...tx.current };
    const clampedTarget = Math.min(Math.max(targetS, 0.15), 6);
    if (!Number.isFinite(clampedTarget) || Math.abs(clampedTarget - start.s) < 1e-6) return;
    const duration = reducedMotionRef.current ? 0 : 200;
    const easeOutCubic = (u) => 1 - (1 - u) ** 3;
    if (duration <= 0) {
      const ns = clampedTarget;
      tx.current.x = pivotLocalX - (pivotLocalX - start.x) * (ns / start.s);
      tx.current.y = pivotLocalY - (pivotLocalY - start.y) * (ns / start.s);
      tx.current.s = ns;
      applyTransform();
      commit();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const u = easeOutCubic(t);
      const curS = start.s + (clampedTarget - start.s) * u;
      tx.current.x = pivotLocalX - (pivotLocalX - start.x) * (curS / start.s);
      tx.current.y = pivotLocalY - (pivotLocalY - start.y) * (curS / start.s);
      tx.current.s = curS;
      applyTransform();
      if (t < 1) {
        zoomAnimRafRef.current = requestAnimationFrame(step);
      } else {
        zoomAnimRafRef.current = null;
        commit();
      }
    };
    zoomAnimRafRef.current = requestAnimationFrame(step);
  };

  const enableMapInteraction = () => {
    setMapInteractionEnabled(true);
  };

  const toggleMapInteraction = () => {
    setMapInteractionEnabled((prev) => {
      const next = !prev;
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    setMapInteractionEnabled(true);
  }, [activeMapId]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    if (img.complete) onLoad(); else img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [mapImageSrc]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const syncToolbarWidth = (cw) => {
      const root = c.closest('.map-view-root');
      if (!root) return;
      if (cw > 0) root.style.setProperty('--fm-map-canvas-w', `${cw}px`);
      else root.style.removeProperty('--fm-map-canvas-w');
    };

    const measureAndFit = () => {
      if (imgSizeRef.current.w <= 1) {
        syncToolbarWidth(0);
        return;
      }
      const { w: iw, h: ih } = imgSizeRef.current;
      const outer = mapLayoutOuterRef?.current;

      if (!outer) {
        const cw = Math.max(1, c.clientWidth);
        const ch = Math.max(1, c.clientHeight);
        const s = Math.min(cw / iw, ch / ih, 1);
        const x = (cw - iw * s) / 2;
        const y = (ch - ih * s) / 2;
        commitFitLayout(x, y, s);
        syncToolbarWidth(cw);
        return;
      }

      const st = getComputedStyle(outer);
      const padL = parseFloat(st.paddingLeft) || 0;
      const padR = parseFloat(st.paddingRight) || 0;
      const padT = parseFloat(st.paddingTop) || 0;
      const padB = parseFloat(st.paddingBottom) || 0;
      const availW = Math.max(1, outer.clientWidth - padL - padR);

      let availH;
      if (embedded) {
        availH = Math.max(1, outer.clientHeight - padT - padB);
        /* Premiers layouts / flex+grid : clientHeight peut rester quasi nul ; reprendre la logique vue solo. */
        const EMBEDDED_H_FLOOR = 96;
        if (availH < EMBEDDED_H_FLOOR) {
          const vh = window.visualViewport?.height ?? window.innerHeight;
          const oRect = outer.getBoundingClientRect();
          const mainEl = outer.closest('.main, .teacher-main');
          const mRect = mainEl?.getBoundingClientRect();
          const bottomLimit = mRect ? Math.min(mRect.bottom, vh) : vh;
          const maxOuterBoxH = Math.max(0, bottomLimit - oRect.top - 2);
          const fromViewport = Math.max(1, Math.floor(maxOuterBoxH - padT - padB));
          availH = Math.max(availH, fromViewport);
        }
      } else {
        const vh = window.visualViewport?.height ?? window.innerHeight;
        const oRect = outer.getBoundingClientRect();
        const main = outer.closest('.main, .teacher-main');
        const mRect = main?.getBoundingClientRect();
        const bottomLimit = mRect ? Math.min(mRect.bottom, vh) : vh;
        const maxOuterBoxH = Math.max(0, bottomLimit - oRect.top - 2);
        availH = Math.max(1, Math.floor(maxOuterBoxH - padT - padB));
      }

      /* Cadre = toute la zone disponible ; le « contain » de l’image reste assuré par s, x, y sur le monde (zoom mobile / plans larges ex. N3). */
      const cw = Math.max(1, availW);
      const ch = Math.max(1, availH);

      c.style.width = `${cw}px`;
      c.style.height = `${ch}px`;

      const s = Math.min(cw / iw, ch / ih, 1);
      const x = (cw - iw * s) / 2;
      const y = (ch - ih * s) / 2;
      commitFitLayout(x, y, s);
      syncToolbarWidth(cw);
    };

    measureAndFit();
    let resizeDebounce = null;
    const schedule = () => {
      if (resizeDebounce != null) clearTimeout(resizeDebounce);
      resizeDebounce = window.setTimeout(() => {
        resizeDebounce = null;
        measureAndFit();
      }, 120);
    };

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(schedule)
      : null;
    if (ro) {
      ro.observe(c);
      const outerEl = mapLayoutOuterRef?.current;
      if (outerEl) ro.observe(outerEl);
    }

    window.addEventListener('resize', schedule);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', schedule);

    return () => {
      if (resizeDebounce != null) clearTimeout(resizeDebounce);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (vv) vv.removeEventListener('resize', schedule);
      c.style.width = '';
      c.style.height = '';
      const root = c.closest('.map-view-root');
      if (root) root.style.removeProperty('--fm-map-canvas-w');
    };
  }, [imgSize, embedded, mapLayoutOuterRef]);

  const toImagePct = (clientX, clientY) => {
    const c = containerRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const { x, y, s } = tx.current;
    const { w, h } = imgSizeRef.current;
    return { xp: ((clientX - r.left - x) / s / w) * 100, yp: ((clientY - r.top - y) / s / h) * 100 };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPD = (e) => {
      if (e.target.closest('.edit-pt') || e.target.closest('.map-bubble')) return;
      cancelToolbarZoomAnim();
      moved.current = false;
      if (mode !== 'view') return;
      const touchLike = e.pointerType === 'touch' || e.pointerType === 'pen';
      const interactionActive = mapInteractionEnabled || tx.current.s > 1.05;
      if (touchLike && isCoarsePointer && !interactionActive) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX - tx.current.x, y: e.clientY - tx.current.y };
    };

    const onPM = (e) => {
      if (isPanning.current) {
        if (!moved.current) {
          moved.current = true;
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        }
        tx.current.x = e.clientX - panStart.current.x;
        tx.current.y = e.clientY - panStart.current.y;
        scheduleApply();
        e.preventDefault();
        return;
      }
      if (draggingMarkerRef.current && draggingMarkerEl.current) {
        if (!moved.current) moved.current = true;
        const p = toImagePct(e.clientX, e.clientY);
        if (!p) return;
        const mel = draggingMarkerEl.current;
        mel.style.left = p.xp + '%';
        mel.style.top = p.yp + '%';
        mel._pct = p;
        e.preventDefault();
      }
    };

    const onPU = () => {
      if (isPanning.current) {
        isPanning.current = false;
        commit();
      }
      if (draggingMarkerRef.current) {
        const id = draggingMarkerRef.current;
        const mel = draggingMarkerEl.current;
        if (mel?._pct) {
          api(`/api/map/markers/${id}`, 'PUT', { x_pct: mel._pct.xp, y_pct: mel._pct.yp }).then(onRefresh);
          delete mel._pct;
        }
        draggingMarkerRef.current = null;
        draggingMarkerEl.current = null;
      }
      setTimeout(() => { moved.current = false; }, 0);
    };

    const onWH = (e) => {
      e.preventDefault();
      cancelToolbarZoomAnim();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const d = wheelZoomScaleFactor(e, { containerClientHeight: el.clientHeight });
      const ns = Math.min(Math.max(tx.current.s * d, 0.15), 6);
      tx.current.x = mx - (mx - tx.current.x) * (ns / tx.current.s);
      tx.current.y = my - (my - tx.current.y) * (ns / tx.current.s);
      tx.current.s = ns;
      scheduleApply();
      clearTimeout(onWH._t);
      onWH._t = setTimeout(commit, 80);
    };

    const touchRef2 = {};
    const onTS = (e) => {
      if (e.touches.length !== 2) return;
      cancelToolbarZoomAnim();
      isPanning.current = false;
      pinching.current = true;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const rect = el.getBoundingClientRect();
      touchRef2.dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      touchRef2.s = tx.current.s;
      touchRef2.ox = tx.current.x;
      touchRef2.oy = tx.current.y;
      touchRef2.mx = (t0.clientX + t1.clientX) / 2 - rect.left;
      touchRef2.my = (t0.clientY + t1.clientY) / 2 - rect.top;
      enableMapInteraction();
      e.preventDefault();
    };

    const onTM = (e) => {
      if (!pinching.current || e.touches.length !== 2) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const ns = Math.min(Math.max(touchRef2.s * (dist / touchRef2.dist), 0.15), 6);
      tx.current.x = touchRef2.mx - (touchRef2.mx - touchRef2.ox) * (ns / touchRef2.s);
      tx.current.y = touchRef2.my - (touchRef2.my - touchRef2.oy) * (ns / touchRef2.s);
      tx.current.s = ns;
      scheduleApply();
      e.preventDefault();
    };

    const onTE = (e) => {
      if (pinching.current && e.touches.length < 2) {
        pinching.current = false;
        commit();
      }
    };

    el.addEventListener('pointerdown', onPD, { passive: true });
    el.addEventListener('pointermove', onPM, { passive: false });
    el.addEventListener('pointerup', onPU, { passive: true });
    el.addEventListener('pointerleave', onPU, { passive: true });
    el.addEventListener('wheel', onWH, { passive: false });
    el.addEventListener('touchstart', onTS, { passive: false });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE, { passive: true });

    return () => {
      cancelToolbarZoomAnim();
      el.removeEventListener('pointerdown', onPD);
      el.removeEventListener('pointermove', onPM);
      el.removeEventListener('pointerup', onPU);
      el.removeEventListener('pointerleave', onPU);
      el.removeEventListener('wheel', onWH);
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchmove', onTM);
      el.removeEventListener('touchend', onTE);
    };
  }, [enableMapInteraction, isCoarsePointer, mapInteractionEnabled, mode, onRefresh]);

  const fitMap = () => {
    cancelToolbarZoomAnim();
    const c = containerRef.current;
    if (!c) return;
    const { w, h } = imgSizeRef.current;
    if (w <= 1 || h <= 1) return;
    const cw = Math.max(1, c.clientWidth);
    const ch = Math.max(1, c.clientHeight);
    const s = Math.min(cw / w, ch / h, 1);
    const x = (cw - w * s) / 2;
    const y = (ch - h * s) / 2;
    commitFitLayout(x, y, s);
  };

  const beginMarkerDrag = (id, target, pointerId) => {
    draggingMarkerRef.current = id;
    draggingMarkerEl.current = target;
    target.setPointerCapture(pointerId);
    enableMapInteraction();
  };

  const prefersPageScroll = isCoarsePointer && mode === 'view' && committed.s <= 1.05 && !mapInteractionEnabled;
  const touchAction = prefersPageScroll ? 'pan-y' : 'none';

  return {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    imgSize,
    imgSizeRef,
    moved,
    applyTransform,
    commit,
    fitMap,
    toImagePct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    setMapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
    animateZoomTowardScale,
  };
}

function MapView({ zones, markers, tasks = [], tutorials = [], plants, maps = [], activeMapId = 'foret', onMapChange, isTeacher, student, canSelfAssignTasks = true, canEnrollOnTasks, canParticipateContextComments = true, onZoneUpdate, onRefresh, embedded = false, publicSettings = null, onLocationTasksFocus = null, onNavigateToTasksForLocation = null, onOpenPlantCatalogPreview = null, onForceLogout }) {
  const canEnrollNewTasks = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const [mode, setMode] = useState('view');
  const [showLabels, setShowLabels] = useState(true);
  const [drawPoints, setDrawPoints] = useState([]);
  const [editZone, setEditZone] = useState(null);
  const [editPoints, setEditPoints] = useState([]);
  const [draggingPtIdx, setDraggingPtIdx] = useState(-1);
  const [editCanUndo, setEditCanUndo] = useState(false);
  const editZoneTranslateLastRef = useRef(null);
  const editPointsHistoryRef = useRef([]);
  const editPointsRef = useRef([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [toast, setToast] = useState(null);
  const [mapTutorialPreview, setMapTutorialPreview] = useState(null);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  const [markerPositionUnlocked, setMarkerPositionUnlocked] = useState(false);
  const configuredLocationEmojis = String(
    publicSettings?.ui?.map?.location_emojis
    || publicSettings?.map?.location_emojis
    || ''
  );
  const markerEmojis = useMemo(
    () => parseEmojiListSetting(configuredLocationEmojis, MARKER_EMOJIS),
    [configuredLocationEmojis]
  );
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const emojiParsingList = useMemo(
    () => [...new Set([...markerEmojis, ...MARKER_EMOJIS])],
    [markerEmojis]
  );
  const activeMap = maps.find((m) => m.id === activeMapId);
  const mapImageCandidates = useMemo(() => {
    const base = activeMapId === 'n3'
      ? ['/maps/plan%20n3.jpg', '/maps/map-n3.svg', '/map.png']
      : ['/map.png', '/maps/map-foret.svg'];
    const first = activeMap?.map_image_url ? [activeMap.map_image_url] : [];
    return [...new Set([...first, ...base])];
  }, [activeMap?.map_image_url, activeMapId]);
  const [mapImageIdx, setMapImageIdx] = useState(0);
  const mapImageSrc = mapImageCandidates[Math.min(mapImageIdx, mapImageCandidates.length - 1)];
  const mapFramePaddingPx = useMemo(() => {
    const custom = Number(activeMap?.frame_padding_px);
    if (Number.isFinite(custom) && custom >= 0) return Math.min(custom, 32);
    return activeMapId === 'n3' ? 14 : 8;
  }, [activeMap?.frame_padding_px, activeMapId]);
  const mapLayoutOuterRef = useRef(null);
  const {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    imgSize,
    moved,
    applyTransform,
    commit,
    fitMap,
    toImagePct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
    animateZoomTowardScale,
  } = useMapGestures({ mapImageSrc, activeMapId, mode, onRefresh, embedded, mapLayoutOuterRef });
  const { zoneTaskVisualById, markerTaskVisualById } = useMemo(() => {
    const zoneMap = new Map();
    const markerMap = new Map();
    for (const t of tasks || []) {
      if (isTaskDetachedFromLocation(t)) continue;
      const visual = taskVisualStatus(taskEffectiveStatus(t));
      if (!visual) continue;
      const { zoneIds, markerIds } = taskLocationIds(t);
      zoneIds.forEach((id) => {
        zoneMap.set(id, mergeTaskVisualStatus(zoneMap.get(id), visual));
      });
      markerIds.forEach((id) => {
        markerMap.set(id, mergeTaskVisualStatus(markerMap.get(id), visual));
      });
    }
    return { zoneTaskVisualById: zoneMap, markerTaskVisualById: markerMap };
  }, [tasks]);

  const { zoneTutorialCountById, markerTutorialCountById } = useMemo(() => {
    const zoneMap = new Map();
    const markerMap = new Map();
    const bumpZone = (zidRaw, delta = 1) => {
      const z = zones.find((zz) => String(zz.id) === String(zidRaw));
      if (!z || z.map_id !== activeMapId) return;
      const key = z.id;
      zoneMap.set(key, (zoneMap.get(key) || 0) + delta);
    };
    const bumpMarker = (midRaw, delta = 1) => {
      const mk = markers.find((mm) => String(mm.id) === String(midRaw));
      if (!mk || mk.map_id !== activeMapId) return;
      const key = mk.id;
      markerMap.set(key, (markerMap.get(key) || 0) + delta);
    };
    for (const tu of tutorials || []) {
      if (tu.is_active === false) continue;
      const { zoneIds, markerIds } = tutorialLocationIds(tu);
      for (const zid of zoneIds) bumpZone(zid, 1);
      for (const mid of markerIds) bumpMarker(mid, 1);
    }
    const pairSeen = new Set();
    for (const t of tasks || []) {
      if (isTaskDetachedFromLocation(t)) continue;
      const tuRefs = taskLinkedTutorialRefs(t, tutorials || []);
      if (!tuRefs.length) continue;
      const { zoneIds: tZones, markerIds: tMarkers } = taskLocationIds(t);
      for (const tu of tuRefs) {
        if (tu.is_active === false) continue;
        const direct = tutorialLocationIds(tu);
        const directZoneStr = new Set(direct.zoneIds.map((x) => String(x)));
        const directMarkerStr = new Set(direct.markerIds.map((x) => String(x)));
        const tid = String(tu.id);
        for (const zid of tZones) {
          if (directZoneStr.has(String(zid))) continue;
          const k = `z:${String(zid)}:tu:${tid}`;
          if (pairSeen.has(k)) continue;
          pairSeen.add(k);
          bumpZone(zid, 1);
        }
        for (const mid of tMarkers) {
          if (directMarkerStr.has(String(mid))) continue;
          const k = `m:${String(mid)}:tu:${tid}`;
          if (pairSeen.has(k)) continue;
          pairSeen.add(k);
          bumpMarker(mid, 1);
        }
      }
    }
    return { zoneTutorialCountById: zoneMap, markerTutorialCountById: markerMap };
  }, [tutorials, zones, markers, activeMapId, tasks]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setTutorialReadIds(new Set(ids));
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tutorials]);

  const hadZoneOrMarkerSelectionRef = useRef(false);
  useEffect(() => {
    if (!onLocationTasksFocus) return;
    const hasSelection = !!(selectedZone || selectedMarker);
    if (selectedZone) {
      onLocationTasksFocus({ kind: 'zone', id: String(selectedZone.id) });
    } else if (selectedMarker) {
      onLocationTasksFocus({ kind: 'marker', id: String(selectedMarker.id) });
    } else if (hadZoneOrMarkerSelectionRef.current) {
      onLocationTasksFocus(null);
    }
    hadZoneOrMarkerSelectionRef.current = hasSelection;
  }, [selectedZone, selectedMarker, onLocationTasksFocus]);

  useEffect(() => {
    setMapImageIdx(0);
  }, [mapImageCandidates]);

  useEffect(() => {
    setMode('view');
    setDrawPoints([]);
    setEditZone(null);
    setEditPoints([]);
    setSelectedZone(null);
    setSelectedMarker(null);
    setPendingZone(null);
    setPendingMarker(null);
    setMarkerPositionUnlocked(false);
    editZoneTranslateLastRef.current = null;
    editPointsHistoryRef.current = [];
    setEditCanUndo(false);
  }, [activeMapId]);

  useEffect(() => {
    if (mode !== 'edit-points') editZoneTranslateLastRef.current = null;
  }, [mode]);

  useEffect(() => {
    editPointsRef.current = editPoints;
  }, [editPoints]);

  const onMapClick = e => {
    if (moved.current) return;
    if (e.target.closest('.map-zone-hit') || e.target.closest('.map-bubble')) return;
    const p = toImagePct(e.clientX, e.clientY);
    if (!p) return;
    if (mode === 'draw-zone') setDrawPoints(pts => [...pts, p]);
    else if (mode === 'add-marker') { setPendingMarker(p); setMode('view'); }
  };

  const finishZone = () => { if (drawPoints.length >= 3) { setPendingZone(drawPoints); setDrawPoints([]); setMode('view'); } };
  const undoPoint = () => setDrawPoints(pts => pts.slice(0, -1));
  const cancelDraw = () => { setDrawPoints([]); setMode('view'); };

  const recordEditHistoryAfterGesture = useCallback(() => {
    if (mode !== 'edit-points') return;
    const cur = clampEditPts(cloneEditPts(editPointsRef.current));
    const h = editPointsHistoryRef.current;
    const last = h[h.length - 1];
    if (last && editPtsSnapshotEqual(last, cur)) return;
    h.push(cur);
    while (h.length > 30) h.shift();
    setEditCanUndo(h.length > 1);
  }, [mode]);

  const scheduleRecordEditHistory = useCallback(() => {
    window.setTimeout(() => { recordEditHistoryAfterGesture(); }, 0);
  }, [recordEditHistoryAfterGesture]);

  const undoEditPoints = useCallback(() => {
    const h = editPointsHistoryRef.current;
    if (h.length <= 1) return;
    h.pop();
    const prev = h[h.length - 1];
    setEditPoints(cloneEditPts(prev));
    setEditCanUndo(h.length > 1);
  }, []);

  useEffect(() => {
    if (mode !== 'edit-points') return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      undoEditPoints();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, undoEditPoints]);

  const discardEditPointsSession = useCallback(() => {
    setEditZone(null);
    setEditPoints([]);
    editPointsHistoryRef.current = [];
    setEditCanUndo(false);
    editZoneTranslateLastRef.current = null;
  }, []);

  const startEditPoints = (z) => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : []; } catch (e) { pts = []; }
    const clamped = clampEditPts(pts);
    editPointsHistoryRef.current = [cloneEditPts(clamped)];
    setEditCanUndo(false);
    setEditZone(z);
    setEditPoints(clamped);
    setMode('edit-points');
    setSelectedZone(null);
  };
  const saveEditPoints = async () => {
    if (!editZone) return;
    await api(`/api/zones/${editZone.id}`, 'PUT', { points: editPoints });
    await onRefresh();
    discardEditPointsSession();
    setMode('view');
    setToast('Contour sauvegardé ✓');
  };

  const saveMarker = async (d) => {
    const payload = { ...d, map_id: d.map_id || activeMapId };
    await api('/api/map/markers', 'POST', payload);
    await onRefresh();
  };

  const updateMarker = async (id, data) => {
    const payload = { ...data, map_id: data.map_id || activeMapId };
    await api(`/api/map/markers/${id}`, 'PUT', payload);
    await onRefresh();
    setSelectedMarker(null);
  };
  const linkTaskToZone = async (taskId, zoneId) => {
    const t = (tasks || []).find((x) => x.id === taskId);
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
    const zoneIds = [...new Set([...zi, zoneId])];
    await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const linkTaskToMarker = async (taskId, markerId) => {
    const t = (tasks || []).find((x) => x.id === taskId);
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
    const markerIds = [...new Set([...mi, markerId])];
    await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const unlinkTaskFromZone = async (task, zoneId) => {
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
    const zoneIds = zi.filter((id) => id !== zoneId);
    const payload = { zone_ids: zoneIds, marker_ids: mi };
    if (zoneIds.length === 0 && mi.length === 0) payload.map_id = activeMapId;
    await api(`/api/tasks/${task.id}`, 'PUT', payload);
    await onRefresh();
  };
  const unlinkTaskFromMarker = async (task, markerId) => {
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
    const markerIds = mi.filter((id) => id !== markerId);
    const payload = { zone_ids: zi, marker_ids: markerIds };
    if (zi.length === 0 && markerIds.length === 0) payload.map_id = activeMapId;
    await api(`/api/tasks/${task.id}`, 'PUT', payload);
    await onRefresh();
  };
  const linkTutorialToZone = async (tutorialId, zoneId) => {
    const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
    if (!tu) return;
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tu);
    const zoneIds = [...new Set([...(zi || []), zoneId])];
    await api(`/api/tutorials/${tutorialId}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const unlinkTutorialFromZone = async (tutorial, zoneId) => {
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tutorial);
    const zoneIds = zi.filter((id) => String(id) !== String(zoneId));
    await api(`/api/tutorials/${tutorial.id}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const linkTutorialToMarker = async (tutorialId, markerId) => {
    const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
    if (!tu) return;
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tu);
    const markerIds = [...new Set([...(mi || []), markerId])];
    await api(`/api/tutorials/${tutorialId}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const unlinkTutorialFromMarker = async (tutorial, markerId) => {
    const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tutorial);
    const markerIds = mi.filter((id) => String(id) !== String(markerId));
    await api(`/api/tutorials/${tutorial.id}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const deleteMarker = async id => { await api(`/api/map/markers/${id}`, 'DELETE'); await onRefresh(); };
  const deleteZone = async id => { await api(`/api/zones/${id}`, 'DELETE'); await onRefresh(); };
  const duplicateZone = async (z) => {
    let pts;
    try { pts = z.points ? JSON.parse(z.points) : []; } catch (e) { pts = []; }
    if (!pts || pts.length < 3) throw new Error('Contour invalide');
    const shifted = offsetDuplicateZonePoints(pts);
    if (!shifted) throw new Error('Contour invalide');
    const living = orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant);
    const created = await api('/api/zones', 'POST', {
      name: `${z.name || 'Zone'} (copie)`,
      points: shifted,
      color: z.color || '#86efac80',
      current_plant: '',
      living_beings: living,
      stage: z.stage || 'empty',
      map_id: z.map_id || activeMapId,
      description: z.description || '',
    });
    await onRefresh();
    setSelectedZone(created);
    setToast('Zone dupliquée ✓');
  };

  const duplicateMarker = async (m) => {
    const dx = 1.5;
    const dy = 1.5;
    const nx = Math.min(100, Math.max(0, Number(m.x_pct) + dx));
    const ny = Math.min(100, Math.max(0, Number(m.y_pct) + dy));
    const living = orderedLivingBeingsForForm(m.living_beings_list || m.living_beings, m.plant_name);
    const baseLabel = String(m.label || 'Repère').replace(/\s*\(copie\)\s*$/i, '').trim();
    const created = await api('/api/map/markers', 'POST', {
      map_id: m.map_id || activeMapId,
      x_pct: nx,
      y_pct: ny,
      label: `${baseLabel} (copie)`,
      plant_name: '',
      living_beings: living,
      note: m.note || '',
      emoji: m.emoji || '🌱',
      visit_subtitle: m.visit_subtitle,
      visit_short_description: m.visit_short_description,
      visit_details_title: m.visit_details_title,
      visit_details_text: m.visit_details_text,
    });
    await onRefresh();
    setSelectedMarker(created);
    setToast('Repère dupliqué ✓');
  };

  const assignTasksToStudent = async (taskIds) => {
    const ids = [...new Set((taskIds || []).filter(Boolean))];
    if (!canEnrollNewTasks || !ids.length || !student) {
      return { assignedCount: 0, failedCount: 0, firstError: null };
    }
    let assignedCount = 0;
    let failedCount = 0;
    let firstError = null;
    for (const taskId of ids) {
      try {
        await api(`/api/tasks/${taskId}/assign`, 'POST', {
          firstName: student.first_name,
          lastName: student.last_name,
          studentId: student.id,
        });
        assignedCount += 1;
      } catch (err) {
        failedCount += 1;
        if (!firstError) firstError = err?.message || 'Erreur serveur';
      }
    }
    await onRefresh();
    return { assignedCount, failedCount, firstError };
  };
  const toggleMarkerPositionLock = () => {
    setMarkerPositionUnlocked((prev) => {
      const next = !prev;
      setToast(next ? 'Déplacement des repères activé' : 'Déplacement des repères verrouillé');
      return next;
    });
  };

  const { s: cs } = committed;
  const { w: iw, h: ih } = imgSize;
  const inv = 1 / cs;
  const mapSettings =
    publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
  const {
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
  } = resolveMapOverlayTypography(mapSettings, inv);

  const toWorld = p => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih });

  const renderZonePoly = z => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : null; } catch (e) { pts = null; }
    if (!pts || pts.length < 3) return null;
    const wp = pts.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const mx = wp.reduce((s, p) => s + p.cx, 0) / wp.length;
    const my = wp.reduce((s, p) => s + p.cy, 0) / wp.length;
    const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', emojiParsingList);
    const zoneName = stripLeadingMarkerEmoji(z.name || '', emojiParsingList);
    const isEd = mode === 'edit-points' && editZone?.id === z.id;
    const zoneTaskVisual = zoneTaskVisualById.get(z.id);
    const zoneTutorialCount = zoneTutorialCountById.get(z.id) || 0;
    return (
      <g key={z.id} className={mode === 'view' ? 'map-zone-hit' : ''} style={{ cursor: mode === 'view' ? 'pointer' : 'default' }}
        onClick={e => { if (mode === 'view' && !moved.current) { e.stopPropagation(); setSelectedZone(z); } }}>
        <polygon points={str} fill={isEd ? 'rgba(82,183,136,0.35)' : (z.color || '#86efac90')}
          stroke={isEd ? '#52b788' : 'rgba(26,71,49,0.5)'}
          strokeWidth={(isEd ? 2.5 : 1.5) * inv} strokeDasharray={z.special ? `${5 * inv},${3 * inv}` : 'none'} />
        {showLabels && (
          <text
            x={mx}
            y={my}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={mapEmojiFontPx}
            fontFamily="ForetMapColorEmoji, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {zoneEmoji || ''}
          </text>
        )}
        {showLabels && (
          <text x={mx} y={my + (zoneEmoji ? mapEmojiLabelCenterGap : 0)} textAnchor="middle" dominantBaseline="middle"
            fontSize={mapLabelFontPx} fontWeight="700" fontFamily="DM Sans,sans-serif"
            fill="#1a4731" stroke="rgba(255,255,255,0.8)" strokeWidth={3 * inv} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{zoneName || z.name}</text>
        )}
        {zoneTaskVisual && (
          <circle
            className={`map-task-status map-task-status--${zoneTaskVisual}`}
            cx={mx + (16 * inv)}
            cy={my - (12 * inv)}
            r={Math.max(5, 7 * inv)}
            style={{ pointerEvents: 'none' }}>
            <title>{TASK_VISUAL_LABEL[zoneTaskVisual]}</title>
          </circle>
        )}
        {zoneTutorialCount > 0 && (
          <circle
            className="map-tutorial-zone-dot"
            cx={mx - (16 * inv)}
            cy={my - (12 * inv)}
            r={Math.max(4, 6 * inv)}
            style={{ pointerEvents: 'none' }}>
            <title>{zoneTutorialCount === 1 ? '1 tutoriel lié' : `${zoneTutorialCount} tutoriels liés`}</title>
          </circle>
        )}
      </g>
    );
  };

  const endEditZoneTranslate = (e) => {
    scheduleRecordEditHistory();
    editZoneTranslateLastRef.current = null;
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const renderEditPts = () => {
    if (mode !== 'edit-points' || !editPoints.length) return null;
    const wp = editPoints.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const r = Math.max(5, 8 * inv);
    return (
      <g>
        <polygon
          className="edit-zone-translate"
          points={str}
          fill="rgba(82,183,136,0.2)"
          stroke="#52b788"
          strokeWidth={2 * inv}
          style={{ cursor: 'move', touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const p0 = toImagePct(e.clientX, e.clientY);
            if (!p0) return;
            editZoneTranslateLastRef.current = p0;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          }}
          onPointerMove={(e) => {
            const last = editZoneTranslateLastRef.current;
            if (!last) return;
            const p2 = toImagePct(e.clientX, e.clientY);
            if (!p2) return;
            const dx = p2.xp - last.xp;
            const dy = p2.yp - last.yp;
            editZoneTranslateLastRef.current = p2;
            setEditPoints((pts) => clampEditPts(pts.map((pt) => ({ xp: pt.xp + dx, yp: pt.yp + dy }))));
            e.preventDefault();
          }}
          onPointerUp={endEditZoneTranslate}
          onPointerCancel={endEditZoneTranslate}
          onLostPointerCapture={() => { editZoneTranslateLastRef.current = null; }}
        />
        {wp.map((p, i) => (
          <circle key={i} className="edit-pt" cx={p.cx} cy={p.cy} r={r}
            fill={draggingPtIdx === i ? '#1a4731' : 'white'} stroke="#1a4731" strokeWidth={2 * inv}
            style={{ cursor: 'grab', touchAction: 'none' }}
            onPointerDown={e => { e.stopPropagation(); setDraggingPtIdx(i); e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => { if (draggingPtIdx === i) { const p2 = toImagePct(e.clientX, e.clientY); if (p2) setEditPoints((pts) => pts.map((pt, j) => (j === i ? clampEditZonePct(p2) : pt))); } }}
            onPointerUp={(e) => {
              e.stopPropagation();
              scheduleRecordEditHistory();
              setDraggingPtIdx(-1);
              if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
              }
            }} />
        ))}
      </g>
    );
  };

  const renderDrawing = () => {
    if (!drawPoints.length) return null;
    const wp = drawPoints.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const r = Math.max(4, 6 * inv);
    return (
      <g>
        {drawPoints.length > 1 && <polyline points={str} fill="none" stroke="#52b788" strokeWidth={2 * inv} strokeDasharray={`${6 * inv},${3 * inv}`} />}
        {wp.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r={r} fill="#1a4731" stroke="white" strokeWidth={1.5 * inv} />)}
      </g>
    );
  };

  const cursor = mode === 'view' ? 'grab' : mode === 'draw-zone' ? 'crosshair' : mode === 'edit-points' ? 'default' : 'cell';
  const mobileInteractionsActive = mapInteractionEnabled || committed.s > 1.05;
  const canManageMarkerPositions = !!isTeacher;
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher });
  const helpMap = HELP_PANELS.map;
  const tooltipText = (entry) => resolveRoleText(entry, isTeacher);

  return (
    <div className={`map-view-root ${embedded ? 'map-view-root--embedded' : 'map-view-root--solo'}`}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {mapTutorialPreview && (
        <TutorialPreviewModal
          tutorial={mapTutorialPreview}
          onClose={() => setMapTutorialPreview(null)}
          readAcknowledge={{
            isRead: tutorialReadIds.has(Number(mapTutorialPreview.id)),
            onAcknowledged: (id) => setTutorialReadIds((prev) => new Set([...prev, id])),
            onForceLogout,
          }}
        />
      )}

      {selectedZone && (
        <ZoneInfoModal zone={selectedZone} plants={plants} tasks={tasks} tutorials={tutorials} isTeacher={isTeacher} student={student} canSelfAssignTasks={canSelfAssignTasks} canEnrollOnTasks={canEnrollNewTasks} markerEmojis={markerEmojis} emojiParsingList={emojiParsingList} contextCommentsEnabled={contextCommentsEnabled} canParticipateContextComments={canParticipateContextComments}
          onClose={() => setSelectedZone(null)}
          onUpdate={async (id, data) => { await onZoneUpdate(id, data); setSelectedZone(null); await onRefresh(); }}
          onDelete={async id => { await deleteZone(id); setSelectedZone(null); }}
          onDuplicate={isTeacher ? duplicateZone : undefined}
          onLinkTask={async (taskId) => linkTaskToZone(taskId, selectedZone.id)}
          onUnlinkTask={(t) => unlinkTaskFromZone(t, selectedZone.id)}
          onAssignTasks={assignTasksToStudent}
          onLinkTutorial={async (tutorialId) => linkTutorialToZone(tutorialId, selectedZone.id)}
          onUnlinkTutorial={(tu) => unlinkTutorialFromZone(tu, selectedZone.id)}
          onEditPoints={isTeacher ? z => startEditPoints(z) : null}
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={setMapTutorialPreview}
          onOpenPlantCatalogPreview={onOpenPlantCatalogPreview ? (id) => { onOpenPlantCatalogPreview(id); setSelectedZone(null); } : null}
        />
      )}
      {selectedMarker && (
        <MarkerModal
          marker={selectedMarker}
          plants={plants}
          tasks={tasks}
          tutorials={tutorials}
          isTeacher={isTeacher}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnrollOnTasks={canEnrollNewTasks}
          markerEmojis={markerEmojis}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          onClose={() => setSelectedMarker(null)}
          onSave={saveMarker}
          onUpdate={updateMarker}
          onDelete={deleteMarker}
          onDuplicate={isTeacher ? duplicateMarker : undefined}
          onLinkTask={async (taskId) => linkTaskToMarker(taskId, selectedMarker.id)}
          onUnlinkTask={(t) => unlinkTaskFromMarker(t, selectedMarker.id)}
          onLinkTutorial={async (tutorialId) => linkTutorialToMarker(tutorialId, selectedMarker.id)}
          onUnlinkTutorial={(tu) => unlinkTutorialFromMarker(tu, selectedMarker.id)}
          onAssignTasks={assignTasksToStudent}
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={setMapTutorialPreview}
          onOpenPlantCatalogPreview={onOpenPlantCatalogPreview ? (id) => { onOpenPlantCatalogPreview(id); setSelectedMarker(null); } : null}
          onRequestAdjustMarkerPosition={isTeacher
            ? () => {
              setMarkerPositionUnlocked(true);
              setToast('Déplacement des repères activé : fais glisser le repère sur la carte, puis reverrouille dans la barre d’outils si besoin.');
            }
            : undefined}
        />
      )}
      {pendingZone && (
        <ZoneDrawModal points_pct={pendingZone} plants={plants} markerEmojis={markerEmojis} emojiParsingList={emojiParsingList}
          onClose={() => setPendingZone(null)}
          onSave={async data => { await api('/api/zones', 'POST', { ...data, map_id: activeMapId }); setPendingZone(null); await onRefresh(); }} />
      )}
      {pendingMarker && (
        <MarkerModal marker={{ x_pct: pendingMarker.xp, y_pct: pendingMarker.yp, label: '', note: '', emoji: markerEmojis[0] || '🌱', plant_name: '', map_id: activeMapId }}
          plants={plants} isTeacher={isTeacher} markerEmojis={markerEmojis}
          onClose={() => setPendingMarker(null)}
          onSave={async data => { await api('/api/map/markers', 'POST', { ...data, map_id: activeMapId }); setPendingMarker(null); await onRefresh(); }}
          onDelete={() => setPendingMarker(null)} />
      )}

      <div className="map-view-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        background: 'white', borderBottom: '1.5px solid var(--mint)', flexShrink: 0, minHeight: 50 }}>
        {maps.length > 1 && (
          <div style={{ display: 'flex', gap: 3, background: 'var(--parchment)', borderRadius: 10, padding: 3 }}>
            {maps.map((mp) => (
              <button key={mp.id}
                style={{ background: activeMapId === mp.id ? 'var(--forest)' : 'transparent', color: activeMapId === mp.id ? 'white' : 'var(--soil)',
                  border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
                  fontFamily: 'DM Sans,sans-serif', fontSize: '.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                onClick={() => onMapChange?.(mp.id)}>
                {mp.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 3, background: 'var(--parchment)', borderRadius: 10, padding: 3 }}>
          {[['view', '🖐️ Nav'],
            ...(isTeacher && mode !== 'edit-points' ? [
              ['draw-zone', `🖊️ Zone${mode === 'draw-zone' && drawPoints.length > 0 ? ` (${drawPoints.length})` : ''}`],
              ['add-marker', '📍 Repère'],
            ] : [])
          ].map(([m, label]) => (
            <button key={m}
              style={{ background: mode === m ? 'var(--forest)' : 'transparent', color: mode === m ? 'white' : 'var(--soil)',
                border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', fontSize: '.82rem', fontWeight: 600,
                transition: 'all .15s', whiteSpace: 'nowrap' }}
              onClick={() => { setMode(p => p === m && m !== 'view' ? 'view' : m); if (m === 'view') { setDrawPoints([]); discardEditPointsSession(); } }}>
              {label}
            </button>
          ))}
        </div>

        {isTeacher && mode === 'draw-zone' && drawPoints.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {drawPoints.length >= 3 && <button className="btn btn-secondary btn-sm" onClick={finishZone}>✅ Terminer</button>}
            <button className="btn btn-ghost btn-sm" onClick={undoPoint}>↩ Undo</button>
            <button className="btn btn-danger btn-sm" onClick={cancelDraw}>✕</button>
          </div>
        )}
        {mode === 'edit-points' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--leaf)', fontWeight: 700,
              background: '#f0fdf4', padding: '5px 10px', borderRadius: 8, border: '1px solid var(--mint)' }}>
              ✏️ {editZone?.name}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!editCanUndo} onClick={undoEditPoints} title="Annuler la dernière modification (Ctrl+Z ou Cmd+Z)">↩ Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={saveEditPoints}>💾 Sauver</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMode('view'); discardEditPointsSession(); }}>✕</button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {canManageMarkerPositions && (
            <button
              aria-label={markerPositionUnlocked ? 'Verrouiller la position des repères' : 'Déverrouiller la position des repères'}
              onClick={toggleMarkerPositionLock}
              style={{ background: markerPositionUnlocked ? '#ecfdf3' : 'transparent', border: '1.5px solid var(--mint)',
                color: markerPositionUnlocked ? '#166534' : 'var(--forest)', borderRadius: 8, padding: '6px 10px',
                cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, minHeight: 36 }}>
              {markerPositionUnlocked ? '🔓 Repères' : '🔒 Repères'}
            </button>
          )}
          {isCoarsePointer && mode === 'view' && (
            <Tooltip text={tooltipText(HELP_TOOLTIPS.map.toggleGestures)}>
              <button
                className={`map-gesture-toggle ${mobileInteractionsActive ? 'is-on' : ''}`}
                onClick={toggleMapInteraction}
                aria-label={mobileInteractionsActive ? 'Désactiver les gestes carte' : 'Activer les gestes carte'}>
                {mobileInteractionsActive ? '🔓 Gestes' : '🔒 Gestes'}
              </button>
            </Tooltip>
          )}
          <Tooltip text={tooltipText(HELP_TOOLTIPS.map.toggleLabels)}>
            <button
              aria-label={showLabels ? 'Masquer les noms' : 'Afficher les noms'}
              onClick={() => setShowLabels(l => !l)}
              style={{ background: showLabels ? 'var(--mint)' : 'transparent', border: '1.5px solid var(--mint)',
                color: 'var(--forest)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: '.9rem' }}
            >
              🏷️
            </button>
          </Tooltip>
          <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, gap: 2 }}>
            {[
              ['＋', 1.28, HELP_TOOLTIPS.map.zoomIn, 'Zoomer la carte'],
              ['－', 0.78, HELP_TOOLTIPS.map.zoomOut, 'Dézoomer la carte'],
              ['⊡', 0, HELP_TOOLTIPS.map.zoomReset, 'Recentrer la carte'],
            ].map(([label, factor, helpEntry, ariaLabel]) => (
              <Tooltip key={label} text={tooltipText(helpEntry)}>
                <button onClick={() => {
                  if (factor === 0) { fitMap(); return; }
                  const c = containerRef.current; if (!c) return;
                  const mx = c.clientWidth / 2;
                  const my = c.clientHeight / 2;
                  const ns = factor > 1 ? Math.min(tx.current.s * factor, 6) : Math.max(tx.current.s * factor, 0.15);
                  animateZoomTowardScale(ns, mx, my);
                }}
                aria-label={ariaLabel}
                style={{ background: 'transparent', border: 'none', color: 'var(--soil)',
                  padding: '6px 10px', cursor: 'pointer', fontSize: '1rem', borderRadius: 7 }}>{label}</button>
              </Tooltip>
            ))}
          </div>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="map"
              title={helpMap.title}
              entries={helpMap.items}
              isTeacher={isTeacher}
              isPulsing={!hasSeenSection('map')}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
        </div>
      </div>

      <div
        ref={mapLayoutOuterRef}
        className="map-view-canvas-outer"
        style={{
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          ...(embedded
            ? {
                paddingTop: 0,
                paddingLeft: mapFramePaddingPx,
                paddingRight: mapFramePaddingPx,
                paddingBottom: mapFramePaddingPx,
              }
            : { padding: mapFramePaddingPx }),
        }}
      >
        <div className="map-view-canvas-slot">
          <div
            ref={containerRef}
            className="map-view-canvas"
            style={{
              cursor,
              touchAction,
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
            onClick={onMapClick}
          >

          <div ref={worldRef}
            style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
              transformOrigin: '0 0', willChange: 'transform' }}>

          <img ref={imgRef} src={mapImageSrc} draggable={false} alt={`Plan ${activeMap?.label || 'du jardin'}`}
            onError={() => setMapImageIdx((idx) => (
              idx < mapImageCandidates.length - 1 ? idx + 1 : idx
            ))}
            style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
              userSelect: 'none', pointerEvents: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,.18)' }} />

          <svg style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
            overflow: 'visible', pointerEvents: 'none' }}>
            <g style={{ pointerEvents: 'all' }}>
              {zones.map(z => renderZonePoly(z))}
              {renderDrawing()}
              {renderEditPts()}
            </g>
          </svg>

          {markers.map((m) => {
            const markerTaskVisual = markerTaskVisualById.get(m.id);
            const markerTaskLabel = markerTaskVisual ? TASK_VISUAL_LABEL[markerTaskVisual] : '';
            const markerTutorialCount = markerTutorialCountById.get(m.id) || 0;
            const markerTutorialLabel = markerTutorialCount === 0
              ? ''
              : (markerTutorialCount === 1 ? '1 tutoriel lié' : `${markerTutorialCount} tutoriels liés`);
            const markerAriaLabel = [m.label || 'Repère', markerTaskLabel, markerTutorialLabel].filter(Boolean).join(' — ');
            const markerEmojiSize = `${mapEmojiFontPx}px`;
            const markerLabelFontSize = `${mapLabelFontPx}px`;
            const markerStatusDotSize = isCoarsePointer ? 17 : 12;
            const markerStatusDotBorder = isCoarsePointer ? 2 : 1.5;
            const markerStatusDotOffset = isCoarsePointer ? -2 : -1;
            const openMarker = (e) => {
              e.stopPropagation();
              if (!moved.current) setSelectedMarker(m);
            };
            return (
            <button key={m.id} className="map-bubble" type="button"
              style={{ position: 'absolute', left: m.x_pct + '%', top: m.y_pct + '%',
                transform: 'translate(-50%,-50%)', zIndex: 10, cursor: isTeacher && markerPositionUnlocked ? 'grab' : 'pointer',
                border: 'none', background: 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: isCoarsePointer ? 'center' : 'flex-start',
                minWidth: isCoarsePointer ? 48 : undefined,
                minHeight: isCoarsePointer ? 48 : undefined,
                padding: isCoarsePointer ? 6 : 0,
                boxSizing: 'border-box' }}
              aria-label={markerAriaLabel}
              title={markerAriaLabel}
              onClick={openMarker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openMarker(e);
                }
              }}
              onPointerDown={isTeacher && markerPositionUnlocked ? e => {
                e.stopPropagation();
                beginMarkerDrag(m.id, e.currentTarget, e.pointerId);
              } : undefined}
              onPointerUp={e => e.stopPropagation()}>
              <div className="map-bubble-pin" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                background: 'transparent', border: 'none', borderRadius: 0,
                fontSize: markerEmojiSize,
                lineHeight: 1 }}>
                {m.emoji}
                {markerTaskVisual && (
                  <span
                    className={`map-task-status-dot map-task-status-dot--${markerTaskVisual}`}
                    role="img"
                    aria-label={markerTaskLabel}
                    title={markerTaskLabel}
                    style={{
                      width: markerStatusDotSize,
                      height: markerStatusDotSize,
                      borderWidth: markerStatusDotBorder,
                      top: markerStatusDotOffset,
                      right: markerStatusDotOffset,
                    }}
                  />
                )}
                {markerTutorialCount > 0 && (
                  <span
                    className="map-tutorial-marker-dot"
                    role="img"
                    aria-label={markerTutorialLabel}
                    title={markerTutorialLabel}
                    style={{
                      width: Math.max(8, markerStatusDotSize - 3),
                      height: Math.max(8, markerStatusDotSize - 3),
                      borderWidth: markerStatusDotBorder,
                      bottom: markerStatusDotOffset,
                      left: markerStatusDotOffset,
                      right: 'auto',
                      top: 'auto',
                    }}
                  />
                )}
              </div>
              {showLabels && (
                <div style={{
                  flexShrink: 0,
                  marginTop: markerLabelMarginTop,
                  background: 'transparent', color: '#1a4731', borderRadius: 0,
                  padding: 0, fontSize: markerLabelFontSize, fontWeight: 700,
                  fontFamily: 'DM Sans,sans-serif',
                  lineHeight: 1,
                  whiteSpace: 'nowrap', maxWidth: isCoarsePointer ? 128 : 96,
                  overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none',
                  textAlign: 'center',
                  textShadow: '0 0 2px rgba(255,255,255,.95), 0 0 6px rgba(255,255,255,.85), 0 1px 0 rgba(255,255,255,.92)' }}>
                  {m.label}
                </div>
              )}
            </button>
            );
          })}
          </div>

          {mode !== 'view' && mode !== 'edit-points' && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 22,
              padding: '9px 20px', fontSize: '.82rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              {mode === 'draw-zone' && drawPoints.length < 3 && '🖊️ Touche la carte (min. 3 pts)'}
              {mode === 'draw-zone' && drawPoints.length >= 3 && `✅ ${drawPoints.length} pts — Terminer`}
              {mode === 'add-marker' && '📍 Touche la carte pour placer'}
            </div>
          )}
          {mode === 'edit-points' && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(82,183,136,.92)', color: 'white', borderRadius: 22,
              padding: '9px 20px', fontSize: '.82rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              ✋ Glisse un point ou l&apos;intérieur · limites carte · Ctrl+Z annule
            </div>
          )}
          {prefersPageScroll && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 18,
              padding: '6px 12px', fontSize: '.72rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              📱 1 doigt: page · 2 doigts: zoom carte
            </div>
          )}
          {isCoarsePointer && mode === 'view' && !prefersPageScroll && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.82)', color: 'white', borderRadius: 18,
              padding: '6px 12px', fontSize: '.72rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              ✋ Gestes carte actifs
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export {
  Lightbox,
  PhotoGallery,
  ZoneInfoModal,
  ZoneDrawModal,
  MarkerModal,
  MapView,
  LivingBeingsCatalogPanel,
  CatalogRemarksSection,
};
