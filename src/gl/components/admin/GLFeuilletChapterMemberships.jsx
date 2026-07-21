import React, { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLBadge } from '../ui/GLBadge.jsx';

/**
 * Affiche (lecture seule) les chapitres auxquels un feuillet est rattaché.
 *
 * IMPORTANT — rattachement DÉDUIT : il n'existe pas de table de lien
 * feuillet↔chapitre. Un feuillet appartient à un chapitre si son `biome_slug`
 * ∈ biomes du chapitre, OU son `plateau_number` = plateau du chapitre, OU son
 * `lien_pays` ∈ pays du chapitre. On ne crée donc aucun attachement explicite :
 * ce composant se contente de rendre le rattachement lisible et de l'expliquer.
 *
 * La source est l'endpoint d'agrégation `/api/gl/lore/admin/feuillets/overview`,
 * qui renvoie `{ items: [{ feuilletCode, chapters: [{ id, name }], … }] }`.
 * On récupère les chapitres déduits en cherchant l'item du feuillet courant.
 *
 * @param {string} feuilletCode code du feuillet dont on veut les chapitres
 */
export function GLFeuilletChapterMemberships({ feuilletCode }) {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const code = (feuilletCode || '').trim();
    if (!code) {
      setChapters([]);
      setLoadError('');
      return undefined;
    }
    setLoading(true);
    setLoadError('');
    apiGL('/api/gl/lore/admin/feuillets/overview')
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        // Rattachement déduit : on retrouve l'item par son code de feuillet.
        const item = items.find((it) => it?.feuilletCode === code);
        setChapters(Array.isArray(item?.chapters) ? item.chapters : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setChapters([]);
        setLoadError(err.message || 'Chapitres indisponibles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [feuilletCode]);

  return (
    <div className="gl-feuillet-chapter-memberships">
      {loading ? <p className="gl-hint">Chargement des chapitres…</p> : null}
      {loadError ? <p className="gl-error">{loadError}</p> : null}

      {!loading && !loadError ? (
        chapters.length ? (
          <div className="gl-feuillet-chapter-memberships__badges">
            {chapters.map((ch) => (
              <GLBadge key={ch.id}>{ch.name}</GLBadge>
            ))}
          </div>
        ) : (
          <p className="gl-hint">Hors chapitre.</p>
        )
      ) : null}

      {/* Note toujours affichée : le rattachement n'est pas modifiable ici. */}
      <p className="gl-hint">
        Rattachement déduit du biome, du plateau ou du pays du feuillet. Modifiez ces champs pour
        changer le rattachement.
      </p>
    </div>
  );
}
