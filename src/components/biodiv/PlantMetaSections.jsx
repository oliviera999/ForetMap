import React, { useState, useEffect, useMemo } from 'react';
import { Lightbox } from '../map-views';
import { MarkdownContent } from '../MarkdownContent.jsx';
import {
  isHttpLink,
  isLocalUploadsPath,
  isLikelyDirectImageUrl,
  commonsFilePageToDisplaySrc,
  parseCommonsCategoryFromUrl,
  getSourceLabel,
} from '../../utils/plantSourceLinks.js';
import { normalizedPlantValue, parseLinkCandidates } from '../../utils/plantFormValues.js';
import { findFirstBiodivHeroPhotoCandidate } from '../../utils/biodivPlantForm.js';
import { PLANT_META_SECTIONS, PHOTO_FIELD_KEYS } from '../../constants/plantMetaSections.js';

/**
 * Affichage des métadonnées d'une fiche plante — extrait de `foretmap-views.jsx` (O6).
 * Photo « héro » (lien direct ou aperçu de catégorie Wikimedia Commons) et sections repliables
 * (identité / écologie / ressources) avec galerie de photos et liens source étiquetés.
 */

export async function fetchCommonsCategoryPreview(urlValue) {
  const categoryTitle = parseCommonsCategoryFromUrl(urlValue);
  if (!categoryTitle) return null;
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');
  endpoint.searchParams.set('generator', 'categorymembers');
  endpoint.searchParams.set('gcmtype', 'file');
  endpoint.searchParams.set('gcmtitle', categoryTitle);
  endpoint.searchParams.set('gcmlimit', '1');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url');
  endpoint.searchParams.set('iiurlwidth', '1200');
  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const first = pages[0];
  const info = first?.imageinfo?.[0];
  return info?.thumburl || info?.url || null;
}

/** Photo principale (champ `photo` puis `photo_species`) entre description brève et bloc écologie. */
export function PlantBiodivHeroPhoto({ plant }) {
  const [lightbox, setLightbox] = useState(null);
  const candidate = useMemo(() => findFirstBiodivHeroPhotoCandidate(plant), [plant]);
  const [categorySrc, setCategorySrc] = useState(null);

  useEffect(() => {
    setCategorySrc(null);
    if (!candidate || candidate.kind !== 'category') return undefined;
    let cancelled = false;
    (async () => {
      const thumb = await fetchCommonsCategoryPreview(candidate.categoryUrl);
      if (!cancelled) setCategorySrc(thumb);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  if (!candidate) return null;
  const src = candidate.kind === 'direct' ? candidate.src : categorySrc;
  if (!src) return null;

  const name = normalizedPlantValue(plant.name) || 'Espèce';

  return (
    <>
      {lightbox && (
        <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      )}
      <button
        type="button"
        className="biodiv-card-hero-photo-wrap"
        onClick={() => setLightbox({ src, caption: `Photo — ${name}` })}
        aria-label={`Agrandir la photo de ${name}`}
      >
        <img
          src={src}
          alt=""
          className="biodiv-card-hero-photo"
          fetchPriority="high"
          decoding="async"
        />
        <span className="biodiv-card-hero-photo-hint" aria-hidden="true">
          🔍 Voir
        </span>
      </button>
    </>
  );
}

export function PlantMetaSections({ plant }) {
  const [bigPhoto, setBigPhoto] = useState(null);
  const [commonsPreviewByUrl, setCommonsPreviewByUrl] = useState({});

  const plantPhotoLinks = useMemo(() => {
    const links = [];
    for (const section of PLANT_META_SECTIONS) {
      for (const item of section.items) {
        if (!PHOTO_FIELD_KEYS.has(item.key)) continue;
        const entries = parseLinkCandidates(plant[item.key]).filter(
          (entry) => isHttpLink(entry) || isLocalUploadsPath(entry),
        );
        for (const entry of entries) links.push(entry);
      }
    }
    return Array.from(new Set(links));
  }, [plant]);

  useEffect(() => {
    let cancelled = false;
    const categoryLinks = plantPhotoLinks.filter((entry) => !!parseCommonsCategoryFromUrl(entry));
    const missing = categoryLinks.filter(
      (entry) => !Object.prototype.hasOwnProperty.call(commonsPreviewByUrl, entry),
    );
    if (missing.length === 0)
      return () => {
        cancelled = true;
      };
    (async () => {
      const resolved = {};
      for (const link of missing) {
        try {
          resolved[link] = await fetchCommonsCategoryPreview(link);
        } catch {
          resolved[link] = null;
        }
      }
      if (!cancelled) {
        setCommonsPreviewByUrl((prev) => ({ ...prev, ...resolved }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantPhotoLinks, commonsPreviewByUrl]);

  const renderPhotoLinks = (item, entries) => (
    <div className="plant-photo-grid">
      {entries.map((entry, idx) => (
        <button
          key={`${item.key}-${idx}`}
          type="button"
          className="plant-photo-thumb"
          onClick={() => setBigPhoto({ src: entry.src, caption: item.label })}
        >
          <img src={entry.src} alt={item.label} loading="lazy" decoding="async" />
          <span className="plant-photo-overlay">🔍 Voir</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {bigPhoto && (
        <Lightbox src={bigPhoto.src} caption={bigPhoto.caption} onClose={() => setBigPhoto(null)} />
      )}
      {PLANT_META_SECTIONS.map((section) => {
        const values = section.items
          .map((item) => ({ ...item, value: normalizedPlantValue(plant[item.key]) }))
          .filter((item) => !!item.value);
        if (values.length === 0) return null;
        return (
          <details key={section.title} className="plant-more">
            <summary>{section.title}</summary>
            <div className="plant-meta-grid">
              {values.map((item) => (
                <div key={item.key} className="plant-meta-item">
                  <div className="plant-meta-label">{item.label}</div>
                  {item.links ? (
                    <div className="plant-links">
                      {(() => {
                        const entries = parseLinkCandidates(item.value);
                        const photoEntries = entries.filter(
                          (entry) => isHttpLink(entry) || isLocalUploadsPath(entry),
                        );

                        if (PHOTO_FIELD_KEYS.has(item.key) && photoEntries.length > 0) {
                          const directImageEntries = photoEntries
                            .filter(isLikelyDirectImageUrl)
                            .map((entry) => ({ src: entry, source: entry }));
                          const commonsFileEntries = photoEntries
                            .map((entry) => {
                              const src = commonsFilePageToDisplaySrc(entry);
                              return src ? { src, source: entry } : null;
                            })
                            .filter(Boolean);
                          const commonsCategoryImageEntries = photoEntries
                            .filter((entry) => !!parseCommonsCategoryFromUrl(entry))
                            .map((entry) => ({
                              src: commonsPreviewByUrl[entry],
                              source: entry,
                            }))
                            .filter((entry) => !!entry.src);
                          const imageEntries = [
                            ...directImageEntries,
                            ...commonsFileEntries,
                            ...commonsCategoryImageEntries,
                          ];
                          const pageEntries = photoEntries.filter((entry) => {
                            if (isLikelyDirectImageUrl(entry)) return false;
                            if (commonsFilePageToDisplaySrc(entry)) return false;
                            if (parseCommonsCategoryFromUrl(entry) && commonsPreviewByUrl[entry])
                              return false;
                            return true;
                          });
                          return (
                            <>
                              {imageEntries.length > 0 && renderPhotoLinks(item, imageEntries)}
                              {pageEntries.map((entry, idx) => (
                                <a
                                  key={`${item.key}-page-${idx}`}
                                  href={entry}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={entry}
                                >
                                  {getSourceLabel(entry)}
                                </a>
                              ))}
                            </>
                          );
                        }

                        return entries.map((entry, idx) =>
                          isHttpLink(entry) ? (
                            <a
                              key={`${item.key}-${idx}`}
                              href={entry}
                              target="_blank"
                              rel="noreferrer"
                              className={item.key === 'sources' ? 'plant-source-link' : undefined}
                              title={entry}
                            >
                              {item.key === 'sources' ? getSourceLabel(entry) : entry}
                            </a>
                          ) : (
                            <span key={`${item.key}-${idx}`}>{entry}</span>
                          ),
                        );
                      })()}
                    </div>
                  ) : (
                    <MarkdownContent className="plant-meta-value">{item.value}</MarkdownContent>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </>
  );
}
