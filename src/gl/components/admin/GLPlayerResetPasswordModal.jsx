import React from 'react';
import { DialogShell } from '../../../components/DialogShell.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';

/**
 * Modale feuille (prop-driven) de réinitialisation du mot de passe d'un joueur GL.
 * L'état (joueur ciblé, valeur du mot de passe) est conservé par le parent.
 *
 * @param {object|null} props.player joueur ciblé ; la modale est ouverte si non nul
 * @param {string} props.passwordValue valeur courante du champ
 * @param {(value: string) => void} props.onPasswordChange
 * @param {() => void} props.onClose
 * @param {(player: object) => void} props.onSubmit
 */
export function GLPlayerResetPasswordModal({
  player,
  passwordValue,
  onPasswordChange,
  onClose,
  onSubmit,
}) {
  return (
    <DialogShell
      open={!!player}
      onClose={onClose}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel animate-pop gl-action-modal-body"
      ariaLabel="Réinitialiser mot de passe joueur"
    >
      <h4>Réinitialiser {player?.pseudo}</h4>
      <GLField label="Nouveau mot de passe">
        <GLInput
          type="password"
          value={passwordValue}
          onChange={(event) => onPasswordChange?.(event.target.value)}
          autoComplete="new-password"
        />
      </GLField>
      <div className="gl-inline-actions">
        <GLButton type="button" onClick={() => onSubmit?.(player)}>
          Valider
        </GLButton>
        <GLButton type="button" variant="secondary" onClick={onClose}>
          Annuler
        </GLButton>
      </div>
    </DialogShell>
  );
}
