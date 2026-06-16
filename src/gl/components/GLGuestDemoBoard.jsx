import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { withAppBase } from '../../services/api.js';
import { apiGL } from '../services/apiGL.js';
import { getRuntimeFeuilletZonesForPlateau } from '../data/glFeuilletZonesBundle.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { useGLBoardMascotMotion } from '../hooks/useGLBoardMascotMotion.js';
import { useGLGuestFeuilletArrival } from '../hooks/useGLGuestFeuilletArrival.js';
import { useGLVirtualDice } from '../hooks/useGLVirtualDice.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLBoardMascot } from './GLBoardMascot.jsx';
import { GLFeuilletZoneOverlay } from './GLFeuilletZoneOverlay.jsx';
import { GLFeuilletPopover } from './GLFeuilletPopover.jsx';
import { GLFeuilletDiscoveryPopover } from './GLFeuilletDiscoveryPopover.jsx';
import { GLVirtualDicePopover } from './GLVirtualDicePopover.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GL_DISCOVERY_TAB } from '../constants/app-runtime.js';

const DEMO_TEAM_ID = 1;
const DEMO_MASCOT_ID = 'liche';
const LAST_DEMO_ZONE_ID = 'zf-p1-04';

const DEMO_TEAM = Object.freeze({
  id: DEMO_TEAM_ID,
  name: 'Visiteur',
  mascot_id: DEMO_MASCOT_ID,
  position_x_pct: 10,
  position_y_pct: 72,
});

function boardImageUrlFromZones(zones) {
  const file = zones.find((z) => z.boardImage)?.boardImage;
  if (!file) return '/maps/map-foret.svg';
  return withAppBase(`/gl/boards/${file}`);
}

function buildPathWaypoints(zones) {
  const start = { xp: 10, yp: 72 };
  const centres = zones.map((z) => ({ xp: z.centreXp, yp: z.centreYp }));
  return [start, ...centres];
}

export function GLGuestDemoBoard({ onExitGuest, brandThemeStyle = null }) {
  const feuilletZones = useMemo(() => getRuntimeFeuilletZonesForPlateau(1), []);
  const imageUrl = useMemo(() => boardImageUrlFromZones(feuilletZones), [feuilletZones]);
  const pathWaypoints = useMemo(() => buildPathWaypoints(feuilletZones), [feuilletZones]);
  const mapGestures = useGlPctMapGestures();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [boardHeightPx, setBoardHeightPx] = useState(0);
  const [presentedZoneIds, setPresentedZoneIds] = useState([]);
  const [pathIndex, setPathIndex] = useState(0);
  const [demoFeuillets, setDemoFeuillets] = useState([]);
  const [discoveryFeuillet, setDiscoveryFeuillet] = useState(null);
  const [discoveryZone, setDiscoveryZone] = useState(null);
  const [showWall, setShowWall] = useState(false);
  const [loadError, setLoadError] = useState('');
  const lastRollKeyRef = useRef('');
  const diceFabRef = useRef(null);
  const [diceOpen, setDiceOpen] = useState(false);
  const dice = useGLVirtualDice({ prefersReducedMotion });

  const teams = useMemo(() => [DEMO_TEAM], []);
  const { getPositionForTeam, getMotionForTeam, moveTeamTo } = useGLBoardMascotMotion({
    teams,
    boardHeightPx,
    prefersReducedMotion,
  });

  const feuilletByCode = useMemo(() => {
    const map = new Map();
    for (const item of demoFeuillets) {
      const code = String(item?.feuilletCode || '').trim();
      if (code) map.set(code, item);
    }
    return map;
  }, [demoFeuillets]);

  useEffect(() => {
    let cancelled = false;
    apiGL('/api/gl/lore/demo-feuillets')
      .then((data) => {
        if (cancelled) return;
        setDemoFeuillets(Array.isArray(data?.items) ? data.items : []);
        setLoadError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message || 'Impossible de charger l’arc découverte');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleZonePresented = useCallback((zone) => {
    setPresentedZoneIds((prev) => {
      const id = String(zone.zoneId);
      return prev.includes(id) ? prev : [...prev, id];
    });
  }, []);

  const {
    popover: feuilletZonePopover,
    closePopover: closeFeuilletZonePopover,
    handlePositionChange: handleFeuilletZonePositionChange,
  } = useGLGuestFeuilletArrival({
    feuilletZones,
    watchTeamId: DEMO_TEAM_ID,
    presentedZoneIds,
    enabled: !showWall && demoFeuillets.length > 0,
    onZonePresented: handleZonePresented,
  });

  const watchPosition = getPositionForTeam(DEMO_TEAM_ID);

  useEffect(() => {
    if (!watchPosition) return undefined;
    return handleFeuilletZonePositionChange({
      xp: watchPosition.xp,
      yp: watchPosition.yp,
    });
  }, [watchPosition?.xp, watchPosition?.yp, handleFeuilletZonePositionChange]);

  const advanceAlongPath = useCallback(
    (steps) => {
      const delta = Math.max(1, Number(steps) || 1);
      setPathIndex((prev) => {
        const next = Math.min(prev + delta, pathWaypoints.length - 1);
        const target = pathWaypoints[next];
        if (target) {
          moveTeamTo(DEMO_TEAM_ID, target.xp, target.yp, { triggerHappy: true });
        }
        return next;
      });
    },
    [moveTeamTo, pathWaypoints],
  );

  useEffect(() => {
    if (dice.phase !== 'result' || !dice.lastRoll) return;
    const rollKey = `${dice.lastRoll.values?.join(',')}:${dice.lastRoll.total}`;
    if (lastRollKeyRef.current === rollKey) return;
    lastRollKeyRef.current = rollKey;
    advanceAlongPath(dice.lastRoll.total);
  }, [dice.phase, dice.lastRoll, advanceAlongPath]);

  const openDiscoveryForZone = useCallback(
    (zone) => {
      const code = String(zone?.feuilletCode || '').trim();
      const feuillet = feuilletByCode.get(code) || null;
      setDiscoveryZone(zone);
      setDiscoveryFeuillet(feuillet);
    },
    [feuilletByCode],
  );

  const closeDiscovery = useCallback(() => {
    const zoneId = String(discoveryZone?.zoneId || '');
    setDiscoveryFeuillet(null);
    setDiscoveryZone(null);
    if (zoneId === LAST_DEMO_ZONE_ID) {
      setShowWall(true);
    }
  }, [discoveryZone]);

  const handleFeuilletPopoverClose = useCallback(() => {
    const zone = feuilletZonePopover?.zone;
    closeFeuilletZonePopover();
    if (zone) openDiscoveryForZone(zone);
  }, [feuilletZonePopover?.zone, closeFeuilletZonePopover, openDiscoveryForZone]);

  return (
    <article className="gl-panel gl-guest-demo-board fade-in">
      <header className="gl-guest-demo-board__head">
        <h2>{GL_DISCOVERY_TAB.label}</h2>
        <p className="gl-hint">
          Lance le dé, avance sur le plateau et découvre les premiers feuillets du carnet de Sélène.
          Ta progression est locale : elle repart à zéro si tu recharges la page.
        </p>
      </header>

      {loadError ? <p className="gl-error">{loadError}</p> : null}

      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt="Plateau 1 — tropiques africains (aperçu)"
        mapGestures={mapGestures}
        onFitLayout={({ height }) => setBoardHeightPx(height || 0)}
      >
        <GLFeuilletZoneOverlay
          zones={feuilletZones}
          presentedZoneIds={presentedZoneIds}
          watchPosition={watchPosition}
        />
        <GLBoardMascot
          team={DEMO_TEAM}
          position={watchPosition}
          motion={getMotionForTeam(DEMO_TEAM_ID)}
          prefersReducedMotion={prefersReducedMotion}
        />
      </GLPctMapCanvas>

      <div className="gl-dice-dock">
        <button
          ref={diceFabRef}
          type="button"
          className={`gl-dice-fab${diceOpen ? ' is-open' : ''}`}
          data-testid="gl-guest-demo-dice-fab"
          aria-expanded={diceOpen}
          aria-haspopup="dialog"
          aria-label={diceOpen ? 'Fermer le lanceur de dés' : 'Ouvrir le lanceur de dés'}
          title="Dés virtuels"
          onClick={() => {
            setDiceOpen((prev) => {
              const next = !prev;
              if (!next) dice.reset();
              return next;
            });
          }}
        >
          <span className="gl-dice-fab__icon" aria-hidden>
            🎲
          </span>
        </button>
      </div>
      {createPortal(
        <GLVirtualDicePopover
          open={diceOpen}
          anchorRef={diceFabRef}
          phase={dice.phase}
          diceCount={dice.diceCount}
          lastRoll={dice.lastRoll}
          onClose={() => {
            setDiceOpen(false);
            dice.reset();
          }}
          onAddDie={dice.addDie}
          onRemoveDie={dice.removeDie}
          onStartRoll={dice.startRoll}
          onReset={dice.reset}
          canAddDie={dice.canAddDie}
          canRemoveDie={dice.canRemoveDie}
          isRolling={dice.isRolling}
          themeStyle={brandThemeStyle}
        />,
        document.body,
      )}

      <GLFeuilletPopover
        open={Boolean(feuilletZonePopover)}
        titre={feuilletZonePopover?.titre}
        popover={feuilletZonePopover?.popover}
        coutGemme={feuilletZonePopover?.coutGemme}
        gainCoeur={feuilletZonePopover?.gainCoeur}
        loading={feuilletZonePopover?.loading}
        error={feuilletZonePopover?.error}
        onClose={handleFeuilletPopoverClose}
        themeStyle={brandThemeStyle}
      />

      <GLFeuilletDiscoveryPopover
        open={Boolean(discoveryFeuillet || discoveryZone)}
        feuillet={discoveryFeuillet}
        zone={discoveryZone ? { label: discoveryZone.titre } : null}
        loading={!discoveryFeuillet && Boolean(discoveryZone)}
        error={!discoveryFeuillet && discoveryZone ? 'Feuillet indisponible' : ''}
        onClose={closeDiscovery}
        onMarkRead={closeDiscovery}
        showMarkRead={false}
        themeStyle={brandThemeStyle}
      />

      {showWall ? (
        <section
          className="gl-feui-discovery gl-feui-boite gl-guest-demo-wall fade-in"
          role="status"
          aria-labelledby="gl-guest-demo-wall-title"
        >
          <header className="gl-feui-discovery__head">
            <p className="gl-feui-discovery__eyebrow">Carnet de Sélène</p>
            <h3 id="gl-guest-demo-wall-title">Le journal s’interrompt ici</h3>
          </header>
          <div className="gl-feui-discovery__body">
            <p>
              Tu as goûté au début de l’aventure. Crée ton compte pour franchir le seuil et poursuivre
              l’histoire avec ta classe.
            </p>
          </div>
          <footer className="gl-feui-discovery__foot">
            <GLButton type="button" variant="primary" onClick={() => onExitGuest?.()}>
              Se connecter
            </GLButton>
            <GLButton type="button" variant="ghost" onClick={() => onExitGuest?.()}>
              Créer un compte
            </GLButton>
          </footer>
        </section>
      ) : null}
    </article>
  );
}
