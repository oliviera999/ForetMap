// Libellés d'aide adaptés aux enfants (9–12 ans) : expliquent « ce que c'est »
// derrière les cœurs et les gemmes, réutilisés en title + aria-label.
const HEALTH_HELP = 'Cœurs : tes points de vie';
const POWER_HELP = 'Gemmes : tes points de pouvoir';
// Ensemble unifié (M1) : une seule monnaie. `gemmesSeules` retire les cœurs de l'affichage.
const GEMMES_HELP = 'Gemmes : ta bourse';

export function GLVitalityCounts({
  health = 0,
  power = 0,
  className = '',
  showHint = false,
  gemmesSeules = false,
}) {
  return (
    <span className={`gl-vitality-counts ${className}`.trim()}>
      {gemmesSeules ? null : (
        <span
          className="gl-vitality-count gl-vitality-count--health"
          title={HEALTH_HELP}
          aria-label={HEALTH_HELP}
        >
          <span className="foretmap-emoji-text-mixed" aria-hidden>
            ❤️
          </span>{' '}
          <span className="gl-vitality-count-value">{Number(health) || 0}</span>
        </span>
      )}
      <span
        className="gl-vitality-count gl-vitality-count--power"
        title={gemmesSeules ? GEMMES_HELP : POWER_HELP}
        aria-label={gemmesSeules ? GEMMES_HELP : POWER_HELP}
      >
        <span className="foretmap-emoji-text-mixed" aria-hidden>
          💎
        </span>{' '}
        <span className="gl-vitality-count-value">{Number(power) || 0}</span>
      </span>
      {showHint ? (
        <small className="gl-hint gl-vitality-hint">
          {gemmesSeules
            ? 'Gemmes = ta bourse, gardée toute l’année'
            : 'Cœurs = tes points de vie · Gemmes = tes points de pouvoir'}
        </small>
      ) : null}
    </span>
  );
}

/**
 * Bourse du joueur dans la barre du haut. « Tenir à deux » (ensemble unifié, M1) : une seule
 * bourse, les gemmes (`gemmesSeules`), et la plume du chapardeur (vue de l'élève concerné et du
 * prof seulement — personne d'autre ne sait qui). Jeu classique : cœurs et gemmes.
 */
export function GLVitalityBadge({
  health = 0,
  power = 0,
  onClick = null,
  plume = false,
  gemmesSeules = false,
}) {
  const label = gemmesSeules
    ? `${power} ${Number(power) > 1 ? 'gemmes' : 'gemme'}`
    : `${health} points de vie, ${power} points de pouvoir`;
  const content = (
    <span className="gl-vitality-badge-inner">
      <GLVitalityCounts health={health} power={power} gemmesSeules={gemmesSeules} />
      {plume ? (
        <span
          className="gl-vitality-plume foretmap-emoji-text-mixed"
          title="Une plume est posée sur ta bourse : une gemme est partie au nid. Elle reviendra à la prochaine page trouvée."
          aria-label="Plume : une gemme au nid"
        >
          🪶
        </span>
      ) : null}
    </span>
  );
  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        className="gl-vitality-badge gl-vitality-badge--button"
        role="status"
        aria-label={`${label} — voir mes statistiques`}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <span className="gl-vitality-badge" role="status" aria-label={label}>
      {content}
    </span>
  );
}

export function GLVitalityAdjustButtons({
  health,
  power,
  disabled = false,
  busy = false,
  onAdjust,
  gemmesSeules = false,
}) {
  if (gemmesSeules) {
    return (
      <div className="gl-vitality-adjust">
        <div className="gl-vitality-adjust-group">
          <GLVitalityCounts power={power} gemmesSeules />
        </div>
        <div className="gl-vitality-adjust-row">
          <span className="gl-vitality-adjust-label foretmap-emoji-text-mixed" aria-hidden>
            💎
          </span>
          <button
            type="button"
            className="gl-vitality-btn"
            disabled={disabled || busy}
            aria-label="Retirer une gemme"
            onClick={() => onAdjust?.({ healthDelta: 0, powerDelta: -1 })}
          >
            −
          </button>
          <button
            type="button"
            className="gl-vitality-btn"
            disabled={disabled || busy}
            aria-label="Ajouter une gemme"
            onClick={() => onAdjust?.({ healthDelta: 0, powerDelta: 1 })}
          >
            +
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="gl-vitality-adjust">
      <div className="gl-vitality-adjust-group">
        <GLVitalityCounts health={health} power={power} />
      </div>
      <div className="gl-vitality-adjust-row">
        <span className="gl-vitality-adjust-label foretmap-emoji-text-mixed" aria-hidden>
          ❤️
        </span>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Retirer un point de vie"
          onClick={() => onAdjust?.({ healthDelta: -1, powerDelta: 0 })}
        >
          −
        </button>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Ajouter un point de vie"
          onClick={() => onAdjust?.({ healthDelta: 1, powerDelta: 0 })}
        >
          +
        </button>
      </div>
      <div className="gl-vitality-adjust-row">
        <span className="gl-vitality-adjust-label foretmap-emoji-text-mixed" aria-hidden>
          💎
        </span>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Retirer un point de pouvoir"
          onClick={() => onAdjust?.({ healthDelta: 0, powerDelta: -1 })}
        >
          −
        </button>
        <button
          type="button"
          className="gl-vitality-btn"
          disabled={disabled || busy}
          aria-label="Ajouter un point de pouvoir"
          onClick={() => onAdjust?.({ healthDelta: 0, powerDelta: 1 })}
        >
          +
        </button>
      </div>
    </div>
  );
}
