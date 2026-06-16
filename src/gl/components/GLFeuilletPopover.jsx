import React from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { GLButton } from './ui/GLButton.jsx';

export function GLFeuilletPopover({
  open = false,
  titre = '',
  popover = '',
  coutGemme = 0,
  gainCoeur = 0,
  loading = false,
  error = '',
  onClose,
  themeStyle = null,
}) {
  const gemCost = Number(coutGemme) || 0;
  const heartGain = Number(gainCoeur) || 0;
  const showMechanics = gemCost > 0 || heartGain > 0;

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="gl-feui-discovery-overlay"
      dialogClassName="gl-feui-discovery gl-feui-boite gl-feuillet-popover fade-in"
      dialogStyle={themeStyle || undefined}
      ariaLabel={titre ? `Feuillet : ${titre}` : 'Feuillet'}
      showCloseButton
      closeButtonClassName="gl-feui-discovery__close"
      closeButtonLabel="Fermer"
    >
      <header className="gl-feui-discovery__head">
        <p className="gl-feui-discovery__eyebrow">Carnet de voyage</p>
        <h3>{titre || 'Feuillet'}</h3>
      </header>

      {error ? <p className="gl-error">{error}</p> : null}
      {loading ? <p className="gl-hint">Ouverture du feuillet…</p> : null}

      {!loading && popover ? (
        <div className="gl-feui-discovery__body gl-feuillet-popover__body">
          <p className="gl-feuillet-popover__text">{popover}</p>
        </div>
      ) : null}

      {showMechanics ? (
        <div className="gl-feuillet-popover__mechanics" aria-label="Effets de jeu">
          {gemCost > 0 ? (
            <span className="gl-feuillet-popover__mech-item">
              <span aria-hidden="true">💎</span>
              {` Coût : ${gemCost} gemme${gemCost > 1 ? 's' : ''}`}
            </span>
          ) : null}
          {heartGain > 0 ? (
            <span className="gl-feuillet-popover__mech-item">
              <span aria-hidden="true">❤️</span>
              {` Gain : ${heartGain} cœur${heartGain > 1 ? 's' : ''}`}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className="gl-feui-discovery__foot">
        <GLButton type="button" onClick={() => onClose?.()}>
          Fermer
        </GLButton>
      </footer>
    </DialogShell>
  );
}
