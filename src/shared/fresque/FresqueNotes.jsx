import { useCallback, useRef } from 'react';

import { NOTE_W_PCT, NOTE_H_PCT } from './fresqueCore.js';

const TAP_TOLERANCE_PCT = 0.8;

/**
 * Post-it sur la table : ceux de l'élève (5 couleurs, texte brut) et les indices (couleur
 * distincte, étiquette « Indice »). Déplaçables au doigt ; un toucher ouvre leur bulle (modifier,
 * accepter une flèche révélée, fermer). Rendus en texte, jamais en HTML. Ils ne recouvrent
 * jamais une carte (le cœur les décale à la pose).
 */
export function FresqueNote({ note, tableApi, readOnly = false, onMove, onTap }) {
  const elRef = useRef(null);
  const gestureRef = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = elRef.current;
      const api = tableApi?.current;
      if (!el || !api) return;
      const start = api.toImagePct(e.clientX, e.clientY);
      if (!start) return;
      gestureRef.current = { start, offsetX: start.xp - note.x, offsetY: start.yp - note.y };
      api.beginExternalDrag(el, e.pointerId, {
        onMove: (p) => {
          const g = gestureRef.current;
          if (!g || readOnly) return;
          el.style.left = `${Math.min(100 - NOTE_W_PCT, Math.max(0, p.xp - g.offsetX))}%`;
          el.style.top = `${Math.min(100 - NOTE_H_PCT, Math.max(0, p.yp - g.offsetY))}%`;
        },
        onEnd: (p) => {
          const g = gestureRef.current;
          gestureRef.current = null;
          if (!g) return;
          const moved = p ? Math.hypot(p.xp - g.start.xp, p.yp - g.start.yp) : 0;
          if (p && moved > TAP_TOLERANCE_PCT && !readOnly) {
            onMove?.(
              note.id,
              Math.min(100 - NOTE_W_PCT, Math.max(0, p.xp - g.offsetX)),
              Math.min(100 - NOTE_H_PCT, Math.max(0, p.yp - g.offsetY)),
            );
            return;
          }
          el.style.left = `${note.x}%`;
          el.style.top = `${note.y}%`;
          onTap?.(note);
        },
      });
    },
    [note, onMove, onTap, readOnly, tableApi],
  );

  const isHint = note.kind === 'hint';
  return (
    <button
      ref={elRef}
      type="button"
      className={`fm-fresque-note${isHint ? ' fm-fresque-note--hint' : ''}`}
      style={{
        left: `${note.x}%`,
        top: `${note.y}%`,
        width: `${NOTE_W_PCT}%`,
        height: `${NOTE_H_PCT}%`,
      }}
      data-color={note.color}
      data-note-id={note.id}
      data-testid={`fm-fresque-note-${note.id}`}
      aria-label={`${isHint ? 'Indice' : 'Post-it'} : ${note.text || '(vide)'}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap?.(note);
        }
      }}
    >
      {isHint ? <span className="fm-fresque-note__kind">Indice</span> : null}
      {note.text}
    </button>
  );
}

export function FresqueNotes({ notes, tableApi, readOnly, onMove, onTap }) {
  return (
    <>
      {notes
        .filter((n) => !n.dismissed)
        .map((note) => (
          <FresqueNote
            key={note.id}
            note={note}
            tableApi={tableApi}
            readOnly={readOnly}
            onMove={onMove}
            onTap={onTap}
          />
        ))}
    </>
  );
}
