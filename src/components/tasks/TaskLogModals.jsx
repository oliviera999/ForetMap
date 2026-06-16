import React, { useState, useEffect, useRef, useId } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { compressImageWithPreset, isLikelyImageFile } from '../../utils/image';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../../utils/overlayHistory';
import { formatDateTimeFr } from '../../utils/datetime-fr';
import { readTaskLogCommentDraft, writeTaskLogCommentDraft } from '../../utils/taskLogDraft.js';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { TimedToast } from '../../shared/components/TimedToast.jsx';
import { ImageLightbox } from '../../shared/components/ImageLightbox.jsx';

function Lightbox({ src, caption, onClose }) {
  return <ImageLightbox src={src} caption={caption} onClose={onClose} useOverlayHistory />;
}

function LogModal({ task, student, onClose, onDone, onForceLogout }) {
  const dialogRef = useDialogA11y(onClose);
  // Pas de useOverlayHistoryBack : même conflit popstate / caméra native que le formulaire tâche.
  const commentFieldId = useId();
  const [comment, setComment] = useState(() => readTaskLogCommentDraft(task?.id));
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    setComment(readTaskLogCommentDraft(task?.id));
  }, [task?.id]);

  useEffect(() => {
    const id = task?.id;
    if (id == null || id === '') return undefined;
    const t = setTimeout(() => writeTaskLogCommentDraft(id, comment), 200);
    return () => {
      clearTimeout(t);
      writeTaskLogCommentDraft(id, comment);
    };
  }, [comment, task?.id]);

  const handleFile = async (e) => {
    disarmNativeFilePickerGuard();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setErr('Format image invalide (image requise)');
      return;
    }
    setErr('');
    try {
      const compressed = await compressImageWithPreset(file, 'taskForm');
      setImageData(compressed);
      setPreview(compressed);
    } catch (errImg) {
      setErr(errImg?.message || 'Image invalide');
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/tasks/${task.id}/done`, 'POST', {
        comment,
        imageData,
        firstName: student.first_name,
        lastName: student.last_name,
        studentId: student.id,
      });
      writeTaskLogCommentDraft(task.id, '');
      await onDone?.();
      onClose();
    } catch (e) {
      if (e instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      ariaLabel="Rapport de tâche"
      closeOnOverlay
      dialogRef={dialogRef}
    >
      <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>
        ✕
      </button>
      <h3>📋 Rapport de tâche</h3>
      <p style={{ fontSize: '.85rem', color: '#777', marginBottom: 16 }}>
        <strong>{task.title}</strong> — laisse un commentaire ou une photo avant de valider
      </p>
      {err && <p style={{ color: 'var(--alert)', fontSize: '.82rem', marginBottom: 8 }}>{err}</p>}

      <div className="field">
        <label htmlFor={commentFieldId}>Commentaire (optionnel)</label>
        <MarkdownTextarea
          id={commentFieldId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Comment ça s'est passé ? Des observations sur l'être vivant ?"
        />
      </div>

      <div className="field">
        <label>Photo (optionnel)</label>
        {!preview ? (
          <div
            className="img-upload-area img-upload-area--split"
            role="group"
            aria-label="Photo du rapport : galerie ou appareil photo"
          >
            <div style={{ fontSize: '2rem', marginBottom: 6 }}>📷</div>
            <div style={{ fontSize: '.85rem', color: '#888', marginBottom: 10 }}>
              Galerie ou appareil photo
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (galleryInputRef.current) galleryInputRef.current.value = '';
                  armNativeFilePickerGuard();
                  galleryInputRef.current?.click();
                }}
              >
                📁 Choisir une photo
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (cameraInputRef.current) cameraInputRef.current.value = '';
                  armNativeFilePickerGuard();
                  cameraInputRef.current?.click();
                }}
              >
                📸 Prendre une photo
              </button>
            </div>
            <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFile} />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
            />
          </div>
        ) : (
          <div className="img-preview-wrap">
            <img src={preview} className="img-preview" alt="preview" />
            <button
              className="img-remove"
              onClick={() => {
                setImageData(null);
                setPreview(null);
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={saving}>
          {saving ? 'Envoi...' : '✅ Marquer comme terminée'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </DialogShell>
  );
}

function TaskLogsViewer({ task, onClose }) {
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const [logs, setLogs] = useState([]);
  const [big, setBig] = useState(null);
  const [toast, setToast] = useState(null);

  const loadLogs = () => {
    api(`/api/tasks/${task.id}/logs`)
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('[ForetMap] logs tâche', err);
        setLogs([]);
      });
  };

  useEffect(() => {
    let cancelled = false;
    api(`/api/tasks/${task.id}/logs`)
      .then((data) => {
        if (cancelled) return;
        setLogs(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ForetMap] logs tâche', err);
        setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const deleteLog = async (logId) => {
    try {
      await api(`/api/tasks/${task.id}/logs/${logId}`, 'DELETE');
      setToast('Rapport retiré — c’est noté.');
      loadLogs();
    } catch (e) {
      setToast('Oups : ' + e.message);
    }
  };

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      ariaLabel={`Rapports de la tâche ${task.title}`}
      closeOnOverlay
      dialogRef={dialogRef}
    >
      {big && <Lightbox src={big} caption="" onClose={() => setBig(null)} />}
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>
        ✕
      </button>
      <h3>📋 Rapports — {task.title}</h3>
      {logs.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📭</div>
          <p>Pas encore de retour sur cette mission — à toi d’ouvrir le bal !</p>
        </div>
      ) : (
        logs.map((l) => (
          <div key={l.id} className="log-entry fade-in">
            <div className="log-entry-header">
              <span className="log-entry-author">
                {l.student_first_name} {l.student_last_name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{formatDateTimeFr(l.created_at)}</span>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ padding: '4px 8px', minHeight: 'auto', fontSize: '.72rem' }}
                  onClick={() => {
                    if (confirm('Supprimer ce rapport ?')) deleteLog(l.id);
                  }}
                  title="Supprimer ce rapport"
                >
                  🗑️
                </button>
              </div>
            </div>
            {l.comment && <MarkdownContent className="log-comment">{l.comment}</MarkdownContent>}
            {l.image_url && (
              <img
                src={l.image_url}
                className="log-image"
                alt="rapport"
                loading="lazy"
                decoding="async"
                onClick={() => setBig(l.image_url)}
              />
            )}
          </div>
        ))
      )}
    </DialogShell>
  );
}

export { LogModal, TaskLogsViewer };
