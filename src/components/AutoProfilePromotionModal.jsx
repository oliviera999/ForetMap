import React, { useEffect, useRef } from 'react';

/**
 * Célébration courte après une montée de palier automatique (progression par tâches validées).
 */
export function AutoProfilePromotionModal({ data, roleTerms, onClose }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  if (!data) return null;

  const titleEmoji = data.roleEmoji ? `${data.roleEmoji} ` : '🌟 ';
  const studentLabel = roleTerms?.studentSingular || 'n3beur';

  return (
    <div
      className="modal-overlay modal-overlay--centered profile-promo-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="profile-promo-card fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-promo-title"
        aria-describedby="profile-promo-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-promo-card__glow" aria-hidden="true" />
        <div className="profile-promo-card__inner">
          <p className="profile-promo-card__kicker">Nouveau palier</p>
          <h2 id="profile-promo-title" className="profile-promo-card__title">
            {titleEmoji}
            Bravo !
          </h2>
          <p id="profile-promo-desc" className="profile-promo-card__lead">
            Ton profil <strong>{studentLabel}</strong> évolue : tu es maintenant{' '}
            <strong>
              {data.roleEmoji ? `${data.roleEmoji} ` : ''}
              {data.roleDisplayName || data.roleSlug}
            </strong>
            {data.validatedTaskCount > 0 ? (
              <>
                {' '}
                — avec <strong>{data.validatedTaskCount}</strong> tâche
                {data.validatedTaskCount > 1 ? 's' : ''} validée
                {data.validatedTaskCount > 1 ? 's' : ''}
              </>
            ) : null}
            .
          </p>
          {Array.isArray(data.highlights) && data.highlights.length > 0 ? (
            <div className="profile-promo-card__highlights">
              <p className="profile-promo-card__highlights-title">En résumé, ton profil te permet :</p>
              <ul>
                {data.highlights.map((line, i) => (
                  <li key={`h-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="profile-promo-card__hint">
            Tu retrouveras le détail des droits dans l’aide ou avec un {roleTerms?.teacherSingular || 'n3boss'} si besoin.
          </p>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn profile-promo-card__cta"
            onClick={onClose}
          >
            C’est parti !
          </button>
        </div>
      </div>
    </div>
  );
}
