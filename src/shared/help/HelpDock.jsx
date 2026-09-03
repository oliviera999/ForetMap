import { useEffect, useState } from 'react';

import { DialogShell } from '../components/DialogShell.jsx';
import { MascotSpeaker } from '../components/MascotSpeaker.jsx';
import { Tooltip } from '../components/Tooltip.jsx';
import { Button } from '../ui/Button.jsx';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../platform/browserStorage.js';

/**
 * Dock d'aide partagé (lot 7 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6) — généralisation de `GLHelpDialog` +
 * `GLHelpDock`, la forme d'aide la plus aboutie des trois produits : un bouton « ? »
 * discret, une modale, un bouton pulse tant que l'aide n'a jamais été ouverte, et le
 * rappel de la visite guidée là où elle existe.
 *
 * Le contenu n'est pas décidé ici : le produit fournit un titre et un corps déjà résolus
 * (contenu serveur côté G&L, registre d'aide côté ForetMap, texte fixe côté plan). Le
 * composant ne s'occupe que de l'appel, de la mémoire « déjà lu » et du rendu.
 *
 * @param {object} props
 * @param {string} props.helpKey clé de mémorisation (`tab:maps`, `plan:home`…).
 * @param {string} props.title titre de la modale.
 * @param {import('react').ReactNode} props.body corps déjà rendu par le produit.
 * @param {string} [props.storagePrefix='help_seen:'] préfixe de la clé de stockage.
 * @param {() => void} [props.onStartTour] relance de la visite guidée, si l'écran en a une.
 * @param {string} [props.tourLabel='▶ Visite guidée']
 * @param {object|null} [props.narrator] portrait d'en-tête (décoratif).
 * @param {string|null} [props.className] classes du conteneur ; `null` = aucun conteneur
 *   (le produit fournit déjà le sien).
 * @param {string} [props.buttonClassName] classes du bouton « ? ».
 * @param {string} [props.overlayClassName]
 * @param {string} [props.dialogClassName]
 * @param {object} [props.classNames] classes **additionnelles** des parties internes du
 *   dialogue (`title`, `portrait`, `body`, `actions`, `tourCta`) : un produit garde ainsi ses
 *   classes historiques, les classes neutres restant posées en plus (même principe que
 *   `MapActionButton`, lot 3).
 * @param {(key: string) => void} [props.onOpen] crochet de métriques (ForetMap).
 */
export function HelpDock({
  helpKey,
  title,
  body,
  storagePrefix = 'help_seen:',
  onStartTour = null,
  tourLabel = '▶ Visite guidée',
  narrator = null,
  className = 'fm-help-dock',
  buttonClassName = 'fm-help-btn',
  overlayClassName = 'fm-help-dialog-overlay',
  dialogClassName = 'fm-help-dialog fade-in',
  classNames = null,
  onOpen = null,
}) {
  const [open, setOpen] = useState(false);
  const storageKey = `${storagePrefix}${helpKey}`;
  // Lecture dès le premier rendu : un bouton déjà lu ne doit pas pulser le temps d'un
  // battement, et l'aide peut se monter après son contenu (chargement serveur).
  const [seen, setSeen] = useState(() => safeLocalStorageGetItem(storageKey, null) === '1');

  useEffect(() => {
    setSeen(safeLocalStorageGetItem(storageKey, null) === '1');
  }, [storageKey]);

  if (!helpKey || body == null || body === '') return null;

  const markSeen = () => {
    if (seen) return;
    safeLocalStorageSetItem(storageKey, '1');
    setSeen(true);
  };

  const partClass = (part, neutral) => [neutral, classNames?.[part]].filter(Boolean).join(' ');

  const content = (
    <>
      {/*
       * L'infobulle dit ce que le bouton ouvre vraiment — l'aide, et la visite quand elle
       * existe. Le « ? » pulse pour attirer l'œil, il n'explique rien. `aria-label` reste la
       * source du nom accessible ; l'infobulle s'y ajoute, elle ne s'y substitue pas.
       */}
      <Tooltip
        text={onStartTour ? 'Aide et visite guidée de cet écran' : 'Aide de cet écran'}
        position="left"
      >
        <button
          type="button"
          className={`${buttonClassName}${seen ? '' : ' is-pulsing'}`}
          aria-label={`Ouvrir l'aide : ${title}`}
          data-help-key={helpKey}
          onClick={() => {
            markSeen();
            onOpen?.(helpKey);
            setOpen(true);
          }}
        >
          ?
        </button>
      </Tooltip>
      {open ? (
        <DialogShell
          open={open}
          onClose={() => setOpen(false)}
          overlayClassName={overlayClassName}
          dialogClassName={dialogClassName}
          ariaLabel={title}
          showCloseButton
          closeButtonLabel="Fermer"
        >
          <h3 className={partClass('title', 'fm-help-dialog__title')}>
            {narrator ? (
              <MascotSpeaker
                className={partClass('portrait', 'fm-help-dialog__portrait')}
                narrator={narrator}
                expression="neutre"
                size="face"
              />
            ) : null}
            <span>{title}</span>
          </h3>
          <div className={partClass('body', 'fm-help-dialog__body')}>{body}</div>
          <div className={partClass('actions', 'fm-help-dialog__actions')}>
            {onStartTour ? (
              <Button
                variant="secondary"
                className={partClass('tourCta', 'fm-help-dialog__tour-cta')}
                onClick={() => {
                  setOpen(false);
                  onStartTour();
                }}
              >
                {tourLabel}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </div>
        </DialogShell>
      ) : null}
    </>
  );

  // `className: null` : le produit fournit déjà son conteneur (dock G&L), on n'en empile pas
  // un second — la structure du DOM et les sélecteurs CSS existants restent valides.
  if (className == null) return content;
  return (
    <div className={className} data-help-key={helpKey}>
      {content}
    </div>
  );
}
