import React from 'react';
import { LocationTutorialPreviewList } from './mapModalShared.jsx';

/**
 * Onglet « Tutoriels » des modales de lieu (ZoneInfoModal / MarkerModal) — variantes
 * enseignant / consultation. Feuille pilotée par props ; l'état (`linkTutorialId`)
 * et les callbacks restent détenus par le modal parent. Extrait de `ZoneInfoModal.jsx`
 * (O6, 2e niveau), paramétré par `locationKind` (libellés zone / repère) pour résorber
 * les copies inline de MarkerModal (audit §5.3).
 */

/** Vue enseignant : liste des tutoriels liés (directs + via tâches) + formulaire de liaison. */
export function ZoneTutorialsTeacherPanel({
  locationKind = 'zone',
  linkedTutorialsDirect,
  tutorialsOnlyViaTasks,
  assignableTutorials,
  linkTutorialId,
  onChangeLinkTutorialId,
  onUnlinkTutorial,
  onLinkTutorial,
}) {
  return (
    <div className="fade-in">
      <div style={{ marginTop: 12 }}>
        {linkedTutorialsDirect.length === 0 && tutorialsOnlyViaTasks.length === 0 ? (
          <p style={{ color: '#999', fontSize: '.85rem' }}>
            {locationKind === 'marker'
              ? 'Aucun tutoriel lié à ce repère.'
              : 'Aucun tutoriel lié à cette zone.'}
          </p>
        ) : (
          <>
            {linkedTutorialsDirect.length === 0
              ? null
              : linkedTutorialsDirect.map((tu) => (
                  <div key={tu.id} className="history-item" style={{ alignItems: 'center' }}>
                    <span>
                      {tu.title}
                      {tu.is_active === false ? ' (archivé)' : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onUnlinkTutorial?.(tu)}
                    >
                      Délier
                    </button>
                  </div>
                ))}
            {tutorialsOnlyViaTasks.length > 0 && (
              <div style={{ marginTop: linkedTutorialsDirect.length ? 16 : 0 }}>
                <p
                  style={{
                    fontSize: '.78rem',
                    color: '#64748b',
                    margin: '0 0 8px',
                    lineHeight: 1.45,
                  }}
                >
                  Rattachés aux missions sur ce lieu (pour les retirer, modifie la tâche concernée).
                </p>
                {tutorialsOnlyViaTasks.map((tu) => (
                  <div
                    key={`task-tu-${tu.id}`}
                    className="history-item"
                    style={{ alignItems: 'center' }}
                  >
                    <span>
                      {tu.title}
                      {tu.is_active === false ? ' (archivé)' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label>
          {locationKind === 'marker'
            ? 'Lier un tutoriel à ce repère'
            : 'Lier un tutoriel à cette zone'}
        </label>
        <select value={linkTutorialId} onChange={(e) => onChangeLinkTutorialId(e.target.value)}>
          <option value="">— Choisir un tutoriel —</option>
          {assignableTutorials.map((tu) => (
            <option key={tu.id} value={String(tu.id)}>
              {tu.title}
            </option>
          ))}
        </select>
        <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
          Tu peux lier plusieurs tutoriels en répétant l’opération pour chaque fiche.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-full"
        disabled={!linkTutorialId}
        onClick={() => onLinkTutorial?.(linkTutorialId)}
      >
        🔗 Lier le tutoriel
      </button>
    </div>
  );
}

/** Vue consultation : aperçu des tutoriels visibles, réutilise la liste mutualisée. */
export function ZoneTutorialsStudentPanel({ tutorials, zoneId, onOpenTutorialPreview }) {
  return (
    <div className="fade-in">
      <LocationTutorialPreviewList
        tutorials={tutorials}
        locationKind="zone"
        locationId={zoneId}
        onOpenTutorialPreview={onOpenTutorialPreview}
      />
    </div>
  );
}
