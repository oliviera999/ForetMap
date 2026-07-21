import React, { useEffect, useMemo, useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Réordonnancement des feuillets d'une même liasse (change leur `ordre_liasse`).
 * Composant purement local : la persistance est déléguée au parent via `onPersist`
 * (aucun appel réseau ici). On expose Monter/Descendre (accessibles, testés) et
 * un drag & drop HTML5 en complément « souris ».
 *
 * @param {Array<{ feuillet_code: string, titre?: string, ordre_liasse?: number }>} items
 *   feuillets de la liasse (pas forcément triés à l'entrée).
 * @param {(orderedCodes: string[]) => Promise<void>} onPersist
 *   appelé avec les codes dans le NOUVEL ordre lorsqu'on valide.
 */
export function GLFeuilletLiasseReorder({ items, onPersist }) {
  const list = Array.isArray(items) ? items : [];

  // Tri stable : ordre_liasse numérique croissant, puis feuillet_code alphabétique.
  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const oa = Number(a?.ordre_liasse);
      const ob = Number(b?.ordre_liasse);
      const na = Number.isFinite(oa) ? oa : Number.POSITIVE_INFINITY;
      const nb = Number.isFinite(ob) ? ob : Number.POSITIVE_INFINITY;
      if (na !== nb) return na - nb;
      return String(a?.feuillet_code || '').localeCompare(String(b?.feuillet_code || ''));
    });
  }, [list]);

  // Index rapide code -> feuillet, et ordre d'origine (codes triés).
  const byCode = useMemo(() => {
    const map = new Map();
    for (const it of sorted) map.set(it.feuillet_code, it);
    return map;
  }, [sorted]);

  const initialOrder = useMemo(() => sorted.map((it) => it.feuillet_code), [sorted]);

  const [order, setOrder] = useState(initialOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragCode, setDragCode] = useState(null);

  // Réinitialise l'ordre local quand la liste des codes d'entrée change.
  const initialKey = initialOrder.join('|');
  useEffect(() => {
    setOrder(initialOrder);
    setError('');
    // On se base sur la clé des codes pour ne pas boucler à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  if (list.length < 2) {
    return <p className="gl-hint">Au moins deux feuillets requis pour réordonner.</p>;
  }

  function labelFor(code) {
    const it = byCode.get(code);
    return (it && (it.titre || it.feuillet_code)) || code;
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  // — Drag & drop HTML5 (complément souris) —
  function handleDragStart(code) {
    setDragCode(code);
  }
  function handleDragOver(event) {
    event.preventDefault(); // autorise le drop
  }
  function handleDrop(targetCode) {
    if (!dragCode || dragCode === targetCode) {
      setDragCode(null);
      return;
    }
    setOrder((prev) => {
      const next = prev.filter((c) => c !== dragCode);
      const at = next.indexOf(targetCode);
      next.splice(at < 0 ? next.length : at, 0, dragCode);
      return next;
    });
    setDragCode(null);
  }

  function reset() {
    setOrder(initialOrder);
    setError('');
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onPersist(order);
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gl-liasse-reorder">
      <ol className="gl-liasse-reorder__list">
        {order.map((code, index) => (
          <li
            key={code}
            className="gl-liasse-reorder__item"
            draggable
            onDragStart={() => handleDragStart(code)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(code)}
          >
            <span className="gl-liasse-reorder__title">{labelFor(code)}</span>
            <span className="gl-liasse-reorder__controls">
              <GLButton
                size="sm"
                variant="ghost"
                aria-label={`Monter ${labelFor(code)}`}
                disabled={index === 0 || saving}
                onClick={() => move(index, -1)}
              >
                Monter
              </GLButton>
              <GLButton
                size="sm"
                variant="ghost"
                aria-label={`Descendre ${labelFor(code)}`}
                disabled={index === order.length - 1 || saving}
                onClick={() => move(index, 1)}
              >
                Descendre
              </GLButton>
            </span>
          </li>
        ))}
      </ol>

      {error ? <p className="gl-error">{error}</p> : null}

      <div className="gl-liasse-reorder__actions">
        <GLButton onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : "Enregistrer l'ordre"}
        </GLButton>
        <GLButton variant="ghost" onClick={reset} disabled={saving}>
          Réinitialiser
        </GLButton>
      </div>
    </div>
  );
}
