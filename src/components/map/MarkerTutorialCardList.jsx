import React from 'react';
import { tutorialPreviewCanEmbed, tutorialPreviewPayload } from '../TutorialPreviewModal';

/**
 * Liste en lecture seule des tutoriels liés à un repère, présentée côté élève.
 * Composant purement présentationnel extrait de MarkerModal (recommandation O6).
 *
 * @param {Array} tutorials - tutoriels visibles à afficher
 * @param {string|number} currentMarkerId - id du repère courant (exclu des « autres repères »)
 * @param {Function|null} onOpenTutorialPreview - callback d'ouverture de l'aperçu d'un tutoriel
 */
function MarkerTutorialCardList({ tutorials = [], currentMarkerId, onOpenTutorialPreview = null }) {
  if (tutorials.length === 0) {
    return <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à ce repère.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {tutorials.map((tu) => {
        const zones = tu.zones_linked || [];
        const otherMarkers = (tu.markers_linked || []).filter((mk) => mk.id !== currentMarkerId);
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
  );
}

export { MarkerTutorialCardList };
