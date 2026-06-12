import React, { useEffect, useState } from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';

/**
 * Modale d'accueil de la visite publique invitée : choix de la mascotte guide
 * avant de commencer (changeable ensuite via le bandeau carte). Possède son
 * état d'ouverture, resynchronisé quand `requested` change ; le choix courant
 * reste piloté par le parent (`mascotId` / `onChangeMascotId`).
 *
 * @param {boolean} requested ouverture demandée (invité public + réglage actif).
 * @param {string} mascotId mascotte actuellement sélectionnée.
 * @param {Array<{id: string, label: string}>} mascotOptions catalogue proposé.
 * @param {Function} onChangeMascotId sélectionne une mascotte (aperçu immédiat).
 * @param {Array|null} extraCatalogEntries packs mascotte additionnels du contenu visite.
 * @param {Function|null} onDone appelé à la fermeture via « Commencer la visite ».
 */
export function VisitGuestMascotOnboarding({
  requested = false,
  mascotId,
  mascotOptions = [],
  onChangeMascotId,
  extraCatalogEntries = null,
  onDone = null,
}) {
  const [open, setOpen] = useState(requested);
  useEffect(() => {
    setOpen(requested);
  }, [requested]);
  if (!open) return null;
  return (
    <div className="visit-mascot-onboarding" role="dialog" aria-modal="true" aria-label="Choix de la mascotte">
      <div className="visit-mascot-onboarding__card">
        <p className="visit-mascot-onboarding__eyebrow">Bienvenue dans la visite</p>
        <h3>Choisis ta mascotte guide</h3>
        <p>
          Avant de commencer, sélectionne ton compagnon de balade. Tu pourras le changer plus tard pendant la visite.
        </p>
        <div className="visit-mascot-onboarding__grid" role="list">
          {mascotOptions.map((mascot) => {
            const isActive = mascotId === mascot.id;
            return (
              <button
                key={mascot.id}
                type="button"
                role="listitem"
                className={`visit-mascot-onboarding__option${isActive ? ' is-active' : ''}`}
                onClick={() => onChangeMascotId(mascot.id)}
                aria-pressed={isActive}
              >
                <span className="visit-mascot-onboarding__preview" aria-hidden="true">
                  <VisitMapMascotRenderer
                    mascotId={mascot.id}
                    state={VISIT_MASCOT_STATE.IDLE}
                    extraCatalogEntries={extraCatalogEntries}
                  />
                </span>
                <span className="visit-mascot-onboarding__label">{mascot.label}</span>
              </button>
            );
          })}
        </div>
        <div className="visit-mascot-onboarding__actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setOpen(false);
              onDone?.();
            }}
            disabled={mascotOptions.length === 0}
          >
            Commencer la visite
          </button>
          {!mascotOptions.length ? (
            <span className="section-sub">Aucune mascotte disponible pour l’instant.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
