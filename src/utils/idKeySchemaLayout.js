/**
 * Layout pur d’un schéma de clé dichotomique (haut → bas).
 * Indépendant du DOM — testable via node:test (import dynamique ESM).
 *
 * Disposition « orthogonale » : parent → barre horizontale → enfants. L’énoncé de
 * chaque proposition est posé dans la **colonne de son enfant**, juste au-dessus de
 * lui ; une colonne étant plus large que l’étiquette, deux énoncés ne peuvent pas se
 * recouvrir (ni leurs zones de toucher). Principe des sous-arbres juxtaposés :
 * Reingold & Tilford, « Tidier Drawings of Trees », IEEE TSE 7(2), 1981.
 *
 * La clé n’est pas forcément un arbre : deux propositions peuvent mener au même
 * couplet. Chaque couplet est placé **une seule fois** (première rencontre en
 * profondeur) ; les autres propositions qui y mènent deviennent un nœud de renvoi
 * « → Couplet N ». Les boucles (brouillons non validés) sont traitées de même.
 */

/** Largeur d’une étiquette d’énoncé (px). */
export const LABEL_W = 180;

/** Caractères par ligne d’étiquette (≈ 6,2 px/caractère en `600 11px`). */
export const LABEL_LINE_CHARS = 28;

/** Lignes d’étiquette au plus ; l’énoncé complet reste lisible ailleurs. */
export const LABEL_MAX_LINES = 2;

/** Hauteur d’une ligne d’étiquette (px). */
export const LABEL_LINE_H = 14;

/** Côté de la vignette d’une proposition (px). */
export const IMAGE_SIZE = 40;

/** Largeur d’une colonne de feuille : l’étiquette + une marge (px). */
export const H_GAP = LABEL_W + 24;

/** Espacement vertical entre niveaux (px). */
export const V_GAP = 170;

/** Marge autour du dessin. */
export const PAD = 48;

/** Distance entre le centre d’un parent et la barre horizontale de ses branches. */
const BUS_OFFSET = 30;

/** Dégagement entre le bas d’une étiquette et le centre de l’enfant. */
const CHILD_CLEAR = 36;

/**
 * Couplet de départ : n°1, sinon le premier de la liste.
 * @param {{ couplets?: Array<{ id: number, number?: number }> }} keyBundle
 */
export function resolveStartCouplet(keyBundle) {
  const couplets = keyBundle?.couplets || [];
  return couplets.find((c) => Number(c.number) === 1) || couplets[0] || null;
}

/** Identifiant stable d’un nœud feuille espèce (une occurrence par lead). */
export function plantNodeId(leadId) {
  return `plant-lead:${leadId}`;
}

/** Identifiant stable d’un nœud couplet. */
export function coupletNodeId(coupletId) {
  return `couplet:${coupletId}`;
}

/** Identifiant d’un nœud de renvoi vers un couplet déjà placé. */
export function refNodeId(leadId) {
  return `ref-lead:${leadId}`;
}

/** Identifiant d’un nœud « proposition incomplète ». */
export function missingNodeId(leadId) {
  return `missing-lead:${leadId}`;
}

/**
 * Tronque un libellé sur une seule ligne.
 * @param {string} text
 * @param {number} [max=42]
 */
export function truncateEdgeLabel(text, max = 42) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Découpe un énoncé en lignes (coupure aux espaces, mot trop long coupé net) ;
 * la dernière ligne se termine par « … » si le texte ne tient pas.
 * @param {string} text
 * @param {number} [maxChars]
 * @param {number} [maxLines]
 * @returns {string[]}
 */
export function wrapEdgeLabel(text, maxChars = LABEL_LINE_CHARS, maxLines = LABEL_MAX_LINES) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return ['—'];
  const lines = [];
  let current = '';
  let overflow = false;
  for (let i = 0; i < words.length; i += 1) {
    let word = words[i];
    while (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (word) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (lines.length >= maxLines) {
      overflow = Boolean(current) || i < words.length - 1;
      current = '';
      break;
    }
  }
  if (!overflow && current) lines.push(current);
  if (lines.length > maxLines) {
    overflow = true;
    lines.length = maxLines;
  }
  if (overflow) {
    const last = lines[maxLines - 1] || '';
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }
  return lines;
}

/**
 * Construit l’arbre logique (sans positions) à partir du bundle.
 * @param {object} keyBundle
 * @returns {{ rootId: string|null, nodes: Map<string, object>, children: Map<string, Array<{ childId: string, lead: object }>>, orphanNumbers: number[] }}
 */
export function buildIdKeyTree(keyBundle) {
  const couplets = keyBundle?.couplets || [];
  const byId = new Map(couplets.map((c) => [Number(c.id), c]));
  const start = resolveStartCouplet(keyBundle);
  const nodes = new Map();
  const children = new Map();

  if (!start) {
    return { rootId: null, nodes, children, orphanNumbers: [] };
  }

  const rootId = coupletNodeId(start.id);
  const visited = new Set();

  function walk(couplet) {
    const cid = Number(couplet.id);
    visited.add(cid);
    const nodeId = coupletNodeId(cid);
    nodes.set(nodeId, {
      id: nodeId,
      type: 'couplet',
      coupletId: cid,
      number: Number(couplet.number) || 0,
      label: `Couplet ${couplet.number ?? '?'}`,
    });
    const outs = [];
    children.set(nodeId, outs);
    for (const lead of couplet.leads || []) {
      const hasNext = lead.next_couplet_id != null && lead.next_couplet_id !== '';
      const hasPlant = lead.plant_id != null && lead.plant_id !== '';
      const next = hasNext ? byId.get(Number(lead.next_couplet_id)) : null;
      if (next && !visited.has(Number(next.id))) {
        outs.push({ childId: coupletNodeId(next.id), lead });
        walk(next);
      } else if (next) {
        const refId = refNodeId(lead.id);
        nodes.set(refId, {
          id: refId,
          type: 'ref',
          coupletId: Number(next.id),
          number: Number(next.number) || 0,
          label: `Couplet ${next.number ?? '?'}`,
          leadId: Number(lead.id),
        });
        outs.push({ childId: refId, lead });
      } else if (!hasNext && hasPlant) {
        const leafId = plantNodeId(lead.id);
        nodes.set(leafId, {
          id: leafId,
          type: 'plant',
          plantId: Number(lead.plant_id),
          name: lead.plant_name || `Fiche #${lead.plant_id}`,
          emoji: lead.plant_emoji || '',
          label: lead.plant_name || `Fiche #${lead.plant_id}`,
          leadId: Number(lead.id),
        });
        outs.push({ childId: leafId, lead });
      } else {
        // Ni suite ni espèce, ou couplet suivant supprimé : visible, mais inerte.
        const missId = missingNodeId(lead.id);
        nodes.set(missId, {
          id: missId,
          type: 'missing',
          label: 'À compléter',
          leadId: Number(lead.id),
        });
        outs.push({ childId: missId, lead });
      }
    }
  }

  walk(start);
  const orphanNumbers = couplets
    .filter((c) => !visited.has(Number(c.id)))
    .map((c) => Number(c.number) || 0)
    .sort((a, b) => a - b);
  return { rootId, nodes, children, orphanNumbers };
}

/** Une proposition est-elle praticable (mène à un couplet existant ou à une espèce) ? */
export function isLeadUsable(lead, coupletIds) {
  const hasNext = lead?.next_couplet_id != null && lead.next_couplet_id !== '';
  if (hasNext) return coupletIds ? coupletIds.has(Number(lead.next_couplet_id)) : true;
  return lead?.plant_id != null && lead.plant_id !== '';
}

/**
 * Calcule largeurs de sous-arbres puis positions x/y (haut → bas).
 * @param {object} keyBundle
 * @returns {{ nodes: object[], edges: object[], width: number, height: number, rootId: string|null, orphanNumbers: number[] }}
 */
export function layoutIdKeySchema(keyBundle) {
  const { rootId, nodes, children, orphanNumbers } = buildIdKeyTree(keyBundle);
  if (!rootId || nodes.size === 0) {
    return {
      nodes: [],
      edges: [],
      width: PAD * 2,
      height: PAD * 2,
      rootId: null,
      orphanNumbers: [],
    };
  }

  const subtreeWidth = new Map();

  function measure(nodeId) {
    const kids = children.get(nodeId) || [];
    let sum = 0;
    for (const { childId } of kids) sum += measure(childId);
    const w = Math.max(H_GAP, sum);
    subtreeWidth.set(nodeId, w);
    return w;
  }

  measure(rootId);

  const placed = new Map();
  const edges = [];

  function place(nodeId, left, depth) {
    const w = subtreeWidth.get(nodeId);
    const y = PAD + depth * V_GAP;
    const kids = children.get(nodeId) || [];
    let cursor = left;
    const kidXs = [];
    for (const { childId } of kids) {
      kidXs.push(place(childId, cursor, depth + 1));
      cursor += subtreeWidth.get(childId);
    }
    // Parent centré sur ses branches (et non sur sa bande) : la barre reste symétrique.
    const x = kidXs.length ? (kidXs[0] + kidXs[kidXs.length - 1]) / 2 : left + w / 2;
    const base = nodes.get(nodeId);
    placed.set(nodeId, { ...base, x, y, depth });

    kids.forEach(({ childId, lead }) => {
      const child = placed.get(childId);
      const busY = y + BUS_OFFSET;
      const lines = wrapEdgeLabel(lead.statement);
      const labelH = lines.length * LABEL_LINE_H + 10;
      const labelBottom = child.y - CHILD_CLEAR;
      const labelTop = labelBottom - labelH;
      const image = lead.image_url
        ? {
            x: child.x - IMAGE_SIZE / 2,
            y: labelTop - 4 - IMAGE_SIZE,
            width: IMAGE_SIZE,
            height: IMAGE_SIZE,
          }
        : null;
      const hasNext = lead.next_couplet_id != null && lead.next_couplet_id !== '';
      edges.push({
        id: `lead:${lead.id}`,
        leadId: Number(lead.id),
        fromId: nodeId,
        toId: childId,
        toType: child.type,
        fromCoupletId: base.coupletId,
        statement: String(lead.statement || ''),
        label: truncateEdgeLabel(lead.statement),
        labelLines: lines,
        labelBox: { x: child.x - LABEL_W / 2, y: labelTop, width: LABEL_W, height: labelH },
        imageBox: image,
        image_url: lead.image_url || null,
        plant_id: lead.plant_id != null && lead.plant_id !== '' ? Number(lead.plant_id) : null,
        next_couplet_id: hasNext ? Number(lead.next_couplet_id) : null,
        plant_name: lead.plant_name || null,
        plant_emoji: lead.plant_emoji || null,
        usable: child.type !== 'missing',
        path: `M ${x} ${y} V ${busY} H ${child.x} V ${child.y}`,
        x1: x,
        y1: y,
        x2: child.x,
        y2: child.y,
        midX: child.x,
        midY: labelTop + labelH / 2,
      });
    });
    return x;
  }

  place(rootId, PAD, 0);

  const nodeList = [...placed.values()];
  let maxX = PAD;
  let maxY = PAD;
  for (const n of nodeList) {
    maxX = Math.max(maxX, n.x + LABEL_W / 2);
    maxY = Math.max(maxY, n.y);
  }

  return {
    nodes: nodeList,
    edges,
    width: Math.ceil(maxX + PAD),
    height: Math.ceil(maxY + PAD + 40),
    rootId,
    orphanNumbers,
  };
}
