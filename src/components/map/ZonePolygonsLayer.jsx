import React, { useMemo } from 'react';

import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis';
import { TASK_VISUAL_LABEL } from '../../utils/taskEnrollment.js';
import { fitOverlayLabelToWidth } from '../../utils/mapOverlayZoneLabels.js';
import {
  labelKey,
  polygonAreaPct,
  resolveLabelLayout,
  zoneEmojiLabelKey,
  zoneLabelAnchorPct,
  zoneLabelMaxWidthPx,
} from '../../shared/pct-map/pctMapLabels.js';
import { LABEL_LINE_HEIGHT_RATIO } from '../../shared/pct-map/mapOverlayLabelCollision.js';
import { polygonLabelAnchorsPct } from '../../shared/pct-map/pctPolylabel.js';

/** Pastilles d'état : diamètre et marge autour de l'étiquette (px écran, comme la consultation). */
const STATUS_DOT_RADIUS_PX = 5.5;
const STATUS_DOT_CLEARANCE_PX = 6.5;

/**
 * Pré-parse les zones pour le calque SVG : `JSON.parse(z.points)` + détection de l'emoji
 * d'étiquette une seule fois par changement de données (à mémoïser côté appelant avec
 * `useMemo` keyé sur `[zones, emojiParsingList, aspect]`) au lieu d'à chaque rendu de la carte.
 * Les zones sans contour exploitable (< 3 points) sont écartées, comme avant
 * (`renderZonePoly` retournait `null`).
 *
 * Chaque zone porte aussi sa **spec d'étiquette** (`labelSpec`), au format de
 * `buildZoneLabelSpecs` : le calque d'édition passe par le même moteur de collisions que la
 * consultation, pour que basculer d'un mode à l'autre ne fasse ni bouger ni changer les
 * étiquettes (`docs/AUDIT_ETIQUETTES_ZONES_2026-09-29.md` constat 5).
 *
 * @param {Array<object>} zones zones brutes (points JSON en %)
 * @param {string[]} emojiParsingList emojis reconnus en tête de nom
 * @param {{ aspect?: number }} [options] `aspect` : largeur ÷ hauteur de l'image (ancre isotrope).
 * @returns {Array<{ zone: object, pts: Array<{xp:number,yp:number}>, labelAnchor: object,
 *   zoneEmoji: string, zoneName: string, labelSpec: object }>}
 */
export function parseZonesForLayer(zones, emojiParsingList, { aspect = 1 } = {}) {
  return (zones || [])
    .map((z) => {
      let pts;
      try {
        pts = z.points ? JSON.parse(z.points) : null;
      } catch (_e) {
        pts = null;
      }
      if (!pts || pts.length < 3) return null;
      // Ancrage de l'étiquette : **pôle d'inaccessibilité** plutôt que centroïde (lot 5,
      // N4 de `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`), calculé en distances isotropes, puis
      // points de repli essayés quand la place est prise.
      const anchors = polygonLabelAnchorsPct(pts, aspect).map(({ xp, yp }) => ({ xp, yp }));
      const labelAnchor = anchors[0] || zoneLabelAnchorPct(pts, aspect);
      // Colonne dédiée `zones.emoji` (audit C4) en priorité ; repli sur le préfixe du nom.
      const zoneEmoji =
        String(z.emoji || '').trim() || detectLeadingMarkerEmoji(z.name || '', emojiParsingList);
      const zoneName = stripLeadingMarkerEmoji(z.name || '', emojiParsingList);
      const xs = pts.map((p) => p.xp);
      const ys = pts.map((p) => p.yp);
      return {
        zone: z,
        pts,
        labelAnchor,
        zoneEmoji,
        zoneName,
        labelSpec: {
          zone: z,
          id: String(z.id),
          key: labelKey('zone', z.id),
          emojiKey: zoneEmojiLabelKey(z.id),
          emoji: zoneEmoji,
          name: String(zoneName || z.name || '').trim(),
          anchor: labelAnchor,
          anchors: anchors.length ? anchors : [labelAnchor],
          areaPct: polygonAreaPct(pts),
          bounds: {
            minXPct: Math.min(...xs),
            maxXPct: Math.max(...xs),
            minYPct: Math.min(...ys),
            maxYPct: Math.max(...ys),
          },
        },
      };
    })
    .filter(Boolean);
}

/**
 * Polygone d'une zone sur la carte (présentation) — extrait de `renderZonePoly` (MapView).
 * DOM/classes/styles/textes strictement inchangés ; mémoïsé pour ne re-rendre la zone que
 * si ses props changent (zoom `inv`, typo, visuels tâche/tutoriel, mode…).
 */
const ZonePolygon = React.memo(function ZonePolygon({
  parsed,
  iw,
  ih,
  inv,
  mode,
  showZoneEmoji,
  showZoneName,
  isEditing,
  dimmed,
  selected,
  recessed,
  taskVisual,
  tutorialCount,
  emojiFontPx,
  labelFontPx,
  nameGapWorld,
  nameMaxWorldWidth,
  anchorXp = null,
  anchorYp = null,
  nameSide = 'below',
  onZoneOpen,
}) {
  const { zone: z, pts, zoneEmoji, zoneName, labelAnchor } = parsed;
  const wp = pts.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
  // Étiquette au point retenu par le placement (pôle d'inaccessibilité, ou point de repli si
  // la place y était prise) ; repli sur le centroïde pour une géométrie dégénérée.
  const anchor =
    Number.isFinite(anchorXp) && Number.isFinite(anchorYp)
      ? { xp: anchorXp, yp: anchorYp }
      : labelAnchor;
  const mx = anchor ? (anchor.xp / 100) * iw : wp.reduce((s, p) => s + p.cx, 0) / wp.length;
  const my = anchor ? (anchor.yp / 100) * ih : wp.reduce((s, p) => s + p.cy, 0) / wp.length;
  const isEd = isEditing;
  const isInteractive = mode === 'view' && !dimmed;
  const hitClass =
    mode === 'view'
      ? [
          'map-zone-hit',
          dimmed ? 'map-zone-hit--dimmed' : '',
          selected ? 'map-zone-hit--selected' : '',
          recessed ? 'map-zone-hit--recessed' : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';
  const zoneNameText = zoneName || z.name || '';
  // Ajustement sans déformation : réduction bornée puis « … » (fini textLength/spacingAndGlyphs).
  const nameFit = fitOverlayLabelToWidth({
    text: zoneNameText,
    fontSize: labelFontPx,
    maxWidth: nameMaxWorldWidth,
  });
  // Même géométrie qu'en consultation : emoji centré sur l'ancre, nom du côté retenu (dessous
  // par défaut ; à droite, à gauche ou au-dessus si la place y était prise).
  const nameHalfH = (nameFit.fontSize * LABEL_LINE_HEIGHT_RATIO) / 2;
  const nameOffset = emojiFontPx / 2 + nameGapWorld;
  let nameX = mx;
  let nameY = my;
  let nameAnchor = 'middle';
  if (zoneEmoji) {
    if (nameSide === 'right') {
      nameX = mx + nameOffset;
      nameAnchor = 'start';
    } else if (nameSide === 'left') {
      nameX = mx - nameOffset;
      nameAnchor = 'end';
    } else if (nameSide === 'above') {
      nameY = my - nameOffset - nameHalfH;
    } else {
      nameY = my + nameOffset + nameHalfH;
    }
  }
  // Pastilles aux coins hauts d'une boîte qui encadre l'emoji (ou, sans emoji, le nom) sans
  // le toucher — mêmes positions que `PctStatusDotsLayer`.
  const dotR = STATUS_DOT_RADIUS_PX * inv;
  const dotDx = emojiFontPx / 2 + STATUS_DOT_CLEARANCE_PX * inv;
  const dotDy = zoneEmoji
    ? dotDx
    : labelFontPx * LABEL_LINE_HEIGHT_RATIO + (STATUS_DOT_CLEARANCE_PX + 1) * inv;
  // Sélection fiche ouverte : fill plus affirmé + trait forêt (pas d'outline navigateur).
  let stroke = 'rgba(26,71,49,0.5)';
  let strokeW = 1.5;
  let fill = z.color || '#86efac90';
  if (isEd) {
    fill = 'rgba(82,183,136,0.35)';
    stroke = '#52b788';
    strokeW = 2.5;
  } else if (selected) {
    stroke = 'rgba(26,71,49,0.92)';
    strokeW = 2.75;
  }
  return (
    <g
      className={hitClass || undefined}
      style={{ cursor: isInteractive ? 'pointer' : 'default' }}
      onClick={isInteractive ? (e) => onZoneOpen(z, e) : undefined}
      // Accessibilité clavier : en consultation, une zone est un bouton — sinon un élève au
      // clavier ne pouvait pas l'ouvrir (les repères, eux, sont déjà des boutons).
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : dimmed ? -1 : undefined}
      aria-hidden={dimmed || undefined}
      aria-current={selected ? 'true' : undefined}
      aria-label={isInteractive ? zoneName || z.name : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onZoneOpen(z, e);
              }
            }
          : undefined
      }
    >
      <polygon points={str} fill={fill} stroke={stroke} strokeWidth={strokeW * inv} />
      {showZoneEmoji && (
        <text
          x={mx}
          y={my}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={emojiFontPx}
          className="map-overlay-emoji-label"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {zoneEmoji}
        </text>
      )}
      {showZoneName && (
        <text
          x={nameX}
          y={nameY}
          textAnchor={nameAnchor}
          dominantBaseline="middle"
          fontSize={nameFit.fontSize}
          className="map-overlay-name-label map-overlay-name-label--svg"
          strokeWidth={3 * inv}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {nameFit.truncated ? <title>{zoneNameText}</title> : null}
          {nameFit.text}
        </text>
      )}
      {taskVisual && (
        <circle
          className={`map-task-status map-task-status--${taskVisual}`}
          cx={mx + dotDx}
          cy={my - dotDy}
          r={dotR}
          style={{ pointerEvents: 'none' }}
        >
          <title>{TASK_VISUAL_LABEL[taskVisual]}</title>
        </circle>
      )}
      {tutorialCount > 0 && (
        <circle
          className="map-tutorial-zone-dot"
          cx={mx - dotDx}
          cy={my - dotDy}
          r={dotR}
          style={{ pointerEvents: 'none' }}
        >
          <title>
            {tutorialCount === 1 ? '1 tutoriel lié' : `${tutorialCount} tutoriels liés`}
          </title>
        </circle>
      )}
    </g>
  );
});

/**
 * Calque des polygones de zones (SVG) — extrait de `MapView`.
 * Mémoïsé : ne re-rend que si les zones pré-parsées, le zoom, la typo ou les visuels changent
 * (plus de re-parse JSON/centroïde/emoji par zone à chaque rendu de la carte).
 *
 * @param {object} props
 * @param {ReturnType<typeof parseZonesForLayer>} props.parsedZones zones pré-parsées (mémoïsées)
 * @param {number} props.iw largeur naturelle du plan (px monde)
 * @param {number} props.ih hauteur naturelle du plan (px monde)
 * @param {number} props.inv inverse de l'échelle commitée (traits constants à l'écran)
 * @param {string} props.mode mode carte (`view`, `draw-zone`, `edit-points`, …)
 * @param {boolean} props.showLabels affiche les noms des zones (sinon : emojis seuls, comme la
 *   consultation)
 * @param {string|number|null} props.editZoneId id de la zone en édition de contour (surbrillance)
 * @param {string|number|null} [props.selectedZoneId] zone dont la fiche est ouverte (mise en avant)
 * @param {Map<*, string>} props.zoneTaskVisualById visuel de tâche par id de zone
 * @param {Map<*, number>} props.zoneTutorialCountById nb de tutoriels liés par id de zone
 * @param {number} props.emojiFontPx taille de l'emoji d'étiquette (px monde)
 * @param {number} props.labelFontPx taille du nom de zone (px monde)
 * @param {number} props.emojiLabelCenterGap distance entre les centres de l'emoji et du nom
 *   (px monde, réglage admin)
 * @param {(zone: object, e: React.MouseEvent) => void} props.onZoneOpen clic zone (handler stable)
 */
export const ZonePolygonsLayer = React.memo(function ZonePolygonsLayer({
  parsedZones,
  iw,
  ih,
  inv,
  mode,
  showLabels,
  editZoneId,
  selectedZoneId = null,
  dimmedZoneIds = null,
  zoneTaskVisualById,
  zoneTutorialCountById,
  emojiFontPx,
  labelFontPx,
  emojiLabelCenterGap,
  onZoneOpen,
}) {
  const hasSelection = selectedZoneId != null && selectedZoneId !== '';
  const safeInv = inv > 0 ? inv : 1;
  const scale = 1 / safeInv;
  // Espace entre le bas de l'emoji et le haut du nom, comme `--map-overlay-label-margin-top`.
  const nameGapWorld = Math.max(0, emojiLabelCenterGap - emojiFontPx / 2 - labelFontPx / 2);
  const pinnedKey = hasSelection ? labelKey('zone', selectedZoneId) : '';
  /** Même moteur de placement que la consultation, mesuré en pixels écran. */
  const { visible: visibleLabelKeys, placements } = useMemo(
    () =>
      resolveLabelLayout({
        zoneSpecs: parsedZones.map((parsed) => parsed.labelSpec).filter(Boolean),
        markers: [],
        contentWidthPx: iw,
        contentHeightPx: ih,
        scale,
        pinnedKey,
        fontSizePx: labelFontPx * scale,
        emojiSizePx: emojiFontPx * scale,
        nameGapPx: nameGapWorld * scale,
        includeZoneNames: showLabels,
        // Le SVG ne replie pas le texte : un nom tient sur une ligne, tronqué au besoin.
        zoneNameMaxLines: 1,
      }),
    [parsedZones, iw, ih, scale, pinnedKey, labelFontPx, emojiFontPx, nameGapWorld, showLabels],
  );
  return (
    <>
      {parsedZones.map((parsed) => {
        const id = String(parsed.zone.id);
        const selected = hasSelection && id === String(selectedZoneId);
        const dimmed = dimmedZoneIds?.has(id);
        // Estompage des voisines seulement hors filtre déjà atténué / hors édition.
        const recessed = hasSelection && !selected && !dimmed && mode === 'view';
        const spec = parsed.labelSpec;
        const placement = placements.get(id);
        return (
          <ZonePolygon
            key={parsed.zone.id}
            parsed={parsed}
            iw={iw}
            ih={ih}
            inv={safeInv}
            mode={mode}
            showZoneEmoji={Boolean(spec?.emoji) && visibleLabelKeys.has(spec.emojiKey)}
            showZoneName={Boolean(spec?.name) && showLabels && visibleLabelKeys.has(spec.key)}
            isEditing={mode === 'edit-points' && editZoneId === parsed.zone.id}
            dimmed={dimmed}
            selected={selected}
            recessed={recessed}
            taskVisual={zoneTaskVisualById.get(parsed.zone.id)}
            tutorialCount={zoneTutorialCountById.get(parsed.zone.id) || 0}
            emojiFontPx={emojiFontPx}
            labelFontPx={labelFontPx}
            nameGapWorld={nameGapWorld}
            nameMaxWorldWidth={spec ? zoneLabelMaxWidthPx(spec, iw, scale) * safeInv : 0}
            anchorXp={placement ? placement.xp : null}
            anchorYp={placement ? placement.yp : null}
            nameSide={placement?.nameSide || 'below'}
            onZoneOpen={onZoneOpen}
          />
        );
      })}
    </>
  );
});
