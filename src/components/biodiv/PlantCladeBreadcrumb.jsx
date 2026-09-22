import { useEffect, useState } from 'react';
import { api } from '../../services/api';

/**
 * Fil de classification « Êtres vivants › … » — l'attribut partagé du groupe
 * s'affiche au survol (title) et en info-bulle accessible.
 */
export function PlantCladeBreadcrumb({ plant }) {
  const cladeId = plant?.clade_id ? String(plant.clade_id) : null;
  const [path, setPath] = useState([]);

  useEffect(() => {
    if (!cladeId) {
      setPath([]);
      return undefined;
    }
    let cancelled = false;
    api(`/api/clades/${encodeURIComponent(cladeId)}/path`)
      .then((data) => {
        if (!cancelled) setPath(Array.isArray(data?.path) ? data.path : []);
      })
      .catch(() => {
        if (!cancelled) setPath([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cladeId]);

  if (!cladeId || path.length === 0) return null;

  return (
    <nav className="plant-clade-breadcrumb" aria-label="Classification">
      <ol className="plant-clade-breadcrumb__list">
        {path.map((node, index) => (
          <li key={node.id} className="plant-clade-breadcrumb__item">
            {index > 0 ? (
              <span className="plant-clade-breadcrumb__sep" aria-hidden="true">
                ›
              </span>
            ) : null}
            <span
              className="plant-clade-breadcrumb__name"
              title={node.shared_attribute || undefined}
            >
              {node.name}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
