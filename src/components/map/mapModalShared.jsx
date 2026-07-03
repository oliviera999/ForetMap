import React from 'react';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { tutorialPreviewPayload, tutorialPreviewCanEmbed } from '../TutorialPreviewModal';
import {
  BiodiversitySpeciesOpenLinks,
  LivingBeingsCatalogPanel,
} from './LivingBeingsCatalogPanel.jsx';

/** Liste cartes tutoriel (aperçu), alignée sur l’onglet « Tutoriels » des modales zone/repère. */
export function LocationTutorialPreviewList({
  tutorials,
  locationKind,
  locationId,
  onOpenTutorialPreview,
}) {
  const list = tutorials || [];
  if (!list.length) {
    return (
      <p style={{ color: '#999', fontSize: '.85rem', margin: 0 }}>
        {locationKind === 'zone'
          ? 'Aucun tutoriel lié à cette zone.'
          : 'Aucun tutoriel lié à ce repère.'}
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.map((tu) => {
        const zones = tu.zones_linked || [];
        const markers = tu.markers_linked || [];
        const showZones =
          locationKind === 'marker'
            ? zones
            : zones.filter((z) => String(z.id) !== String(locationId));
        const showMarkers =
          locationKind === 'zone'
            ? markers
            : markers.filter((m) => String(m.id) !== String(locationId));
        return (
          <div
            key={tu.id}
            style={{
              border: '1px solid rgba(0,0,0,.08)',
              borderRadius: 10,
              padding: '12px 14px',
              background: 'var(--parchment)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--forest)' }}>
              {tu.title}
              {tu.is_active === false ? (
                <span style={{ fontWeight: 400, color: '#94a3b8' }}> (archivé)</span>
              ) : null}
            </div>
            {tu.summary ? (
              <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#555', lineHeight: 1.45 }}>
                {tu.summary}
              </p>
            ) : null}
            {showZones.length > 0 ? (
              <p style={{ margin: '10px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                <strong>{locationKind === 'marker' ? 'Zones' : 'Autres zones'}</strong> :{' '}
                {showZones.map((z) => z.name).join(', ')}
              </p>
            ) : null}
            {showMarkers.length > 0 ? (
              <p style={{ margin: '6px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                <strong>{locationKind === 'zone' ? 'Repères' : 'Autres repères'}</strong> :{' '}
                {showMarkers.map((m) => m.label).join(', ')}
              </p>
            ) : null}
            {tutorialPreviewCanEmbed(tu) && typeof onOpenTutorialPreview === 'function' ? (
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
  );
}

/**
 * Bloc « visite » de l'onglet Info des modales de lieu (zone / repère) :
 * sous-titre, accroche, détails dépliables, biodiversité et tutoriels.
 * Dupliqué à l'identique dans ZoneInfoModal et MarkerModal avant mutualisation
 * (audit §5.3) — seuls le titre de section (« Sur cette zone » / « Sur ce repère »)
 * et les champs de l'entité varient. Le parent garde la condition d'affichage
 * (`showVisitAsideBlock`) et fournit les listes déjà dérivées.
 */
export function LocationVisitAside({
  entity,
  locationKind,
  plants,
  livingNames,
  livingBeingsOnlyOnTasks,
  visitAsideSpecies,
  visitAsideTutorials,
  tutorials,
  onOpenTutorialPreview = null,
  onOpenPlantCatalogPreview = null,
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      {entity.visit_subtitle && (
        <p className="visit-subtitle" style={{ margin: '0 0 8px' }}>
          {entity.visit_subtitle}
        </p>
      )}
      {entity.visit_short_description && (
        <MarkdownContent style={{ margin: '0 0 8px', fontSize: '.88rem', color: '#333' }}>
          {entity.visit_short_description}
        </MarkdownContent>
      )}
      {entity.visit_details_text && (
        <details className="visit-details" style={{ marginTop: 8 }}>
          <summary>{entity.visit_details_title || 'Détails'}</summary>
          <MarkdownContent style={{ margin: '8px 0 0', fontSize: '.86rem' }}>
            {entity.visit_details_text}
          </MarkdownContent>
        </details>
      )}
      {visitAsideSpecies && (
        <details className="visit-details" style={{ marginTop: 8 }}>
          <summary>Biodiversité</summary>
          <div style={{ marginTop: 8 }}>
            {livingNames.length > 0 && (
              <div style={{ marginBottom: livingBeingsOnlyOnTasks.length ? 14 : 0 }}>
                {livingNames.length > 1 || livingBeingsOnlyOnTasks.length > 0 ? (
                  <h4
                    style={{
                      margin: '0 0 8px',
                      fontSize: '.82rem',
                      color: 'var(--forest)',
                    }}
                  >
                    {locationKind === 'marker' ? 'Sur ce repère' : 'Sur cette zone'}
                  </h4>
                ) : null}
                {onOpenPlantCatalogPreview ? (
                  <BiodiversitySpeciesOpenLinks
                    plants={plants}
                    names={livingNames}
                    showHeading={false}
                    onOpenPlant={onOpenPlantCatalogPreview}
                  />
                ) : (
                  <LivingBeingsCatalogPanel
                    plants={plants}
                    names={livingNames}
                    showHeading={false}
                  />
                )}
              </div>
            )}
            {livingBeingsOnlyOnTasks.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '.82rem', color: 'var(--forest)' }}>
                  Également dans les missions
                </h4>
                {onOpenPlantCatalogPreview ? (
                  <BiodiversitySpeciesOpenLinks
                    plants={plants}
                    names={livingBeingsOnlyOnTasks}
                    showHeading={false}
                    sectionTitle="Également dans les missions"
                    onOpenPlant={onOpenPlantCatalogPreview}
                  />
                ) : (
                  <LivingBeingsCatalogPanel
                    plants={plants}
                    names={livingBeingsOnlyOnTasks}
                    showHeading={false}
                  />
                )}
              </div>
            )}
          </div>
        </details>
      )}
      {visitAsideTutorials && (
        <details className="visit-details" style={{ marginTop: 8 }}>
          <summary>Tuto</summary>
          <div style={{ marginTop: 8 }}>
            <LocationTutorialPreviewList
              tutorials={tutorials}
              locationKind={locationKind}
              locationId={entity.id}
              onOpenTutorialPreview={onOpenTutorialPreview}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/** Tutoriel sans lieu ou entièrement sur la carte `mapId` (évite mélange de cartes). */
export function tutorialLinkedToSameMap(tu, mapId) {
  if (!mapId) return true;
  const zl = tu.zones_linked || [];
  const ml = tu.markers_linked || [];
  if (zl.length === 0 && ml.length === 0) return true;
  return [...zl, ...ml].every((x) => x.map_id === mapId);
}

export function TaskEnrollmentLegend() {
  const items = [
    { key: 'mine', color: '#0f766e', label: 'Déjà prise' },
    { key: 'open', color: '#166534', label: 'Disponible' },
    { key: 'full', color: '#991b1b', label: 'Complet' },
    { key: 'closed', color: '#92400e', label: 'Fermée' },
  ];
  return (
    <div style={{ marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <span
          key={item.key}
          style={{
            fontSize: '.78rem',
            color: '#555',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ color: item.color, fontSize: '.9rem', lineHeight: 1 }}>●</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}
