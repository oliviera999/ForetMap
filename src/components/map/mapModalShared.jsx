import React from 'react';
import { tutorialPreviewPayload, tutorialPreviewCanEmbed } from '../TutorialPreviewModal';

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
