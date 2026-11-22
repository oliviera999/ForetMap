import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import './plantCatalogCollege.css';

/** Valeur du paramètre `profile` qui demande au serveur le fil de l'arbre réduit. */
const COLLEGE_TREE_PROFILE = 'college';

/**
 * Fil de classification « Êtres vivants › … » — l'attribut partagé du groupe
 * s'affiche au survol (title) et en info-bulle accessible.
 *
 * Au collège (brique `nested_groups_full_tree` masquée), le fil suit l'arbre réduit aux
 * groupes d'usage (`?profile=college`, chantier collège, flux C4) ; « Pour aller plus loin »
 * affiche le fil complet. Si aucune boîte n'est marquée, le serveur rend le fil complet.
 */
export function PlantCladeBreadcrumb({ plant }) {
  const cladeId = plant?.clade_id ? String(plant.clade_id) : null;
  const { canShow } = useBiodivPedago();
  const reducedByDefault = !canShow('nested_groups_full_tree');
  const [fullPath, setFullPath] = useState(false);
  const reduced = reducedByDefault && !fullPath;
  const [path, setPath] = useState([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!cladeId) {
      setPath([]);
      setCollapsed(false);
      return undefined;
    }
    let cancelled = false;
    const query = reduced ? `?profile=${COLLEGE_TREE_PROFILE}` : '';
    api(`/api/clades/${encodeURIComponent(cladeId)}/path${query}`)
      .then((data) => {
        if (cancelled) return;
        setPath(Array.isArray(data?.path) ? data.path : []);
        setCollapsed(Boolean(data?.collapsed));
      })
      .catch(() => {
        if (!cancelled) {
          setPath([]);
          setCollapsed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cladeId, reduced]);

  // Le bouton reste offert dès que le fil a été réduit une fois (retour possible).
  const canToggle = reducedByDefault && (collapsed || fullPath);

  if (!cladeId || (path.length === 0 && !canToggle)) return null;

  return (
    <nav className="plant-clade-breadcrumb" aria-label="Classification">
      {path.length > 0 ? (
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
      ) : null}
      {canToggle ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm plant-clade-breadcrumb__depth"
          aria-pressed={fullPath}
          onClick={() => setFullPath((v) => !v)}
        >
          {fullPath ? 'Revenir aux grands groupes' : 'Pour aller plus loin'}
        </button>
      ) : null}
    </nav>
  );
}
