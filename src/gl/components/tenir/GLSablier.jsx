import { useEffect, useId, useRef, useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import {
  SABLIER_DUREES_MINUTES,
  SABLIER_SECONDES_MAX,
  SABLIER_SECONDES_MIN,
  formatSablier,
} from '../../../shared/glSablierCore.js';

/**
 * Sablier de « Tenir à deux » : un même composant pour l'équipe active (tableau), la phase
 * (hybride et tablette) et les défis. Il donne un rythme, il n'annule jamais rien.
 *
 * Deux sources de temps :
 * - **serveur** (`restantSecondes` fourni) : le départ et la durée viennent du serveur, le
 *   composant décompte entre deux lectures (console, tablettes et projection affichent la même
 *   chose) ; `enPause` fige l'affichage ;
 * - **local** (`restantSecondes` absent) : décompte de `secondes`, réarmé quand `resetKey`
 *   change ; pause et remise à zéro se font dans le composant.
 *
 * `onRegler` (prof seulement) rend le sablier cliquable : un clic ouvre le petit panneau de
 * réglage. Sans `onRegler` (élèves, projection), le sablier s'affiche sans pouvoir être réglé.
 */
export function GLSablier({
  mode = 'equipe',
  secondes = 180,
  restantSecondes = null,
  enPause = false,
  resetKey = null,
  running = true,
  onDone = null,
  doneHint = 'le sablier a sonné (rien n’est annulé)',
  reglages = null,
  onRegler = null,
  busy = false,
  className = '',
  testId = 'gl-sablier',
}) {
  const serveur = restantSecondes != null;
  const [left, setLeft] = useState(serveur ? restantSecondes : secondes);
  const [pauseLocale, setPauseLocale] = useState(false);
  const [zeroLocal, setZeroLocal] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const panneauId = useId();

  // Recalage : nouvelle lecture du serveur, ou réarmement local. Un sablier qui a du temps
  // devant lui pourra sonner de nouveau ; un sablier lu à zéro sonne une fois, pas à chaque
  // relecture.
  useEffect(() => {
    const depart = serveur ? restantSecondes : secondes;
    setLeft(depart);
    if (depart > 0) doneRef.current = false;
  }, [serveur, restantSecondes, secondes, resetKey, zeroLocal]);

  const fige = serveur ? enPause : pauseLocale || !running;
  useEffect(() => {
    if (fige) return undefined;
    const id = setInterval(() => {
      setLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [fige, serveur, restantSecondes, secondes, resetKey, zeroLocal]);

  useEffect(() => {
    if (left === 0 && !doneRef.current) {
      doneRef.current = true;
      onDoneRef.current?.();
    }
  }, [left]);

  const reglable = typeof onRegler === 'function';
  const enPauseAffichee = serveur ? enPause : pauseLocale;
  const temps = (
    <span className="gl-tour-sablier__time">
      {formatSablier(left)}
      {enPauseAffichee ? <span className="gl-tour-sablier__etat"> · en pause</span> : null}
    </span>
  );

  return (
    <div
      className={`gl-tour-sablier gl-tour-sablier--${mode}${left === 0 ? ' is-done' : ''}${
        enPauseAffichee ? ' is-paused' : ''
      } ${className}`.trim()}
      role="timer"
      aria-live="off"
      data-testid={testId}
    >
      {reglable ? (
        <button
          type="button"
          className="gl-tour-sablier__bouton"
          aria-expanded={ouvert}
          aria-controls={panneauId}
          aria-label={`Sablier ${formatSablier(left)} : régler`}
          onClick={() => setOuvert((v) => !v)}
        >
          <span aria-hidden="true">⏳ </span>
          {temps}
        </button>
      ) : (
        <>
          <span aria-hidden="true">⏳ </span>
          {temps}
        </>
      )}
      {left === 0 ? <span className="gl-hint"> — {doneHint}</span> : null}
      {reglable && ouvert ? (
        <GLSablierPanneau
          id={panneauId}
          mode={mode}
          reglages={reglages || {}}
          enPause={enPauseAffichee}
          busy={busy}
          onRegler={onRegler}
          onFermer={() => setOuvert(false)}
          actionsLocales={
            serveur
              ? null
              : {
                  pause: () => setPauseLocale(true),
                  reprise: () => setPauseLocale(false),
                  zero: () => setZeroLocal((n) => n + 1),
                }
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Bouton « Sablier » de la console quand aucun sablier ne tourne (sablier de phase éteint ou
 * sans durée) : il ouvre le même panneau, pour l'allumer d'un clic.
 */
export function GLSablierReglage({ mode = 'phase', reglages = null, onRegler, busy = false }) {
  const [ouvert, setOuvert] = useState(false);
  const panneauId = useId();
  return (
    <div className="gl-tour-sablier gl-tour-sablier--eteint" data-testid="gl-sablier-reglage">
      <button
        type="button"
        className="gl-tour-sablier__bouton"
        aria-expanded={ouvert}
        aria-controls={panneauId}
        onClick={() => setOuvert((v) => !v)}
      >
        <span aria-hidden="true">⏳ </span>Sablier
      </button>
      {ouvert ? (
        <GLSablierPanneau
          id={panneauId}
          mode={mode}
          reglages={reglages || {}}
          enPause={false}
          busy={busy}
          onRegler={onRegler}
          onFermer={() => setOuvert(false)}
          actionsLocales={null}
          sansActions
        />
      ) : null}
    </div>
  );
}

function GLSablierPanneau({
  id,
  mode,
  reglages,
  enPause,
  busy,
  onRegler,
  onFermer,
  actionsLocales,
  sansActions = false,
}) {
  const dePhase = mode === 'phase';
  const actif = reglages.actif !== false;
  const secondesCourantes = dePhase
    ? Number(reglages.phaseSecondes) || 0
    : Number(reglages.equipeSecondes) || 0;
  const [saisie, setSaisie] = useState('');
  const cle = dePhase ? 'phaseSecondes' : 'secondes';

  const choisir = (secondes) => onRegler({ [cle]: secondes, ...(actif ? {} : { actif: true }) });
  const action = (nom) => (actionsLocales ? actionsLocales[nom]() : onRegler({ action: nom }));
  const minutesSaisies = Number(String(saisie).replace(',', '.'));
  const secondesSaisies = Math.round(minutesSaisies * 60);
  const saisieValide =
    Number.isFinite(minutesSaisies) &&
    secondesSaisies >= SABLIER_SECONDES_MIN &&
    secondesSaisies <= SABLIER_SECONDES_MAX;

  return (
    <div
      id={id}
      className="gl-sablier-panneau"
      role="group"
      aria-label="Régler le sablier"
      data-testid="gl-sablier-panneau"
    >
      <label className="gl-checkbox-row gl-sablier-panneau__ligne">
        <input
          type="checkbox"
          role="switch"
          checked={actif}
          disabled={busy}
          onChange={(e) => onRegler({ actif: e.target.checked })}
        />{' '}
        Sablier
      </label>
      <div className="gl-sablier-panneau__durees" role="group" aria-label="Durée">
        {SABLIER_DUREES_MINUTES.map((m) => (
          <GLButton
            key={m}
            type="button"
            size="sm"
            variant={secondesCourantes === m * 60 ? 'primary' : 'secondary'}
            aria-pressed={secondesCourantes === m * 60}
            disabled={busy}
            onClick={() => choisir(m * 60)}
          >
            {m} min
          </GLButton>
        ))}
      </div>
      <div className="gl-inline-actions gl-sablier-panneau__ligne">
        <label>
          Autre durée (minutes){' '}
          <input
            type="number"
            className="gl-input gl-sablier-panneau__saisie"
            min="0.5"
            max="60"
            step="0.5"
            inputMode="decimal"
            value={saisie}
            disabled={busy}
            onChange={(e) => setSaisie(e.target.value)}
          />
        </label>
        <GLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !saisieValide}
          onClick={() => choisir(secondesSaisies)}
        >
          Régler
        </GLButton>
      </div>
      {dePhase ? (
        <>
          <label className="gl-checkbox-row gl-sablier-panneau__ligne">
            <input
              type="checkbox"
              checked={reglages.phaseAuto === true}
              disabled={busy}
              onChange={(e) => onRegler({ phaseAuto: e.target.checked })}
            />{' '}
            Passer au souffle à la fin
          </label>
          {secondesCourantes > 0 ? (
            <GLButton
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onRegler({ phaseSecondes: 0 })}
            >
              Sans sablier de tour
            </GLButton>
          ) : null}
        </>
      ) : null}
      {sansActions ? null : (
        <div className="gl-inline-actions gl-sablier-panneau__ligne">
          {enPause ? (
            <GLButton type="button" size="sm" disabled={busy} onClick={() => action('reprise')}>
              Reprise
            </GLButton>
          ) : (
            <GLButton type="button" size="sm" disabled={busy} onClick={() => action('pause')}>
              Pause
            </GLButton>
          )}
          <GLButton
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => action('zero')}
          >
            Remise à zéro
          </GLButton>
        </div>
      )}
      <GLButton type="button" size="sm" variant="ghost" onClick={onFermer}>
        Fermer
      </GLButton>
    </div>
  );
}
