import React from 'react';

/**
 * Bandeaux de retour (erreur / succès) de la vue « Profils & utilisateurs ».
 * Extrait de profiles-views.jsx (O6) — présentationnel pur. DOM/classes/textes inchangés.
 *
 * L'erreur est masquée pendant que la fiche utilisateur est ouverte et chargée
 * (la modale affiche alors son propre message), sinon elle s'affiche en haut de section.
 *
 * @param {object} props
 * @param {string} [props.err] message d'erreur à afficher
 * @param {string} [props.msg] message de succès à afficher
 * @param {boolean} [props.editModalOpen] vrai si la modale d'édition utilisateur est ouverte
 * @param {string} [props.editUserLoadState] état de chargement de la fiche utilisateur
 */
function ProfilesAdminFeedback({ err, msg, editModalOpen, editUserLoadState }) {
  return (
    <>
      {err && !(editModalOpen && editUserLoadState === 'ready') && (
        <div className="auth-error">⚠️ {err}</div>
      )}
      {msg && <div className="auth-success">{msg}</div>}
    </>
  );
}

export { ProfilesAdminFeedback };
