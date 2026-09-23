/**
 * Layout pur d’un schéma de clé dichotomique (haut → bas).
 * Indépendant du DOM — testable via node:test (import dynamique ESM).
 */

/** Espacement horizontal minimal entre centres de sous-arbres frères (px). */
export const H_GAP = 140;

/** Espacement vertical entre niveaux (px). */
export const V_GAP = 110;

/** Marge autour du dessin. */
export const PAD = 48;

/**
 * Couplet de départ : n°1, sinon le premier de la liste.
 * @param {{ couplets?: Array<{ id: number, number?: number }> }} keyBundle
 */
export function resolveStartCouplet(keyBundle) {
  const couplets = keyBundle?.couplets || [];
  return couplets.find((c) => Number(c.number) === 1) || couplets[0] || null;
}

/**
 * Identifiant stable d’un nœud feuille espèce (une occurrence par lead).
 * @param {number|string} leadId
 */
export function plantNodeId(leadId) {
  return `plant-lead:${leadId}`;
}

/**
 * Identifiant stable d’un nœud couplet.
 * @param {number|string} coupletId
 */
export function coupletNodeId(coupletId) {
  return `couplet:${coupletId}`;
}

/**
 * Tronque un libellé pour l’affichage sur l’arête.
 * @param {string} text
 * @param {number} [max=42]
 */
export function truncateEdgeLabel(text, max = 42) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Construit l’arbre logique (sans positions) à partir du bundle.
 * @param {object} keyBundle
 * @returns {{ rootId: string|null, nodes: Map<string, object>, children: Map<string, Array<{ childId: string, lead: object }>> }}
 */
export function buildIdKeyTree(keyBundle) {
  const couplets = keyBundle?.couplets || [];
  const byId = new Map(couplets.map((c) => [Number(c.id), c]));
  const start = resolveStartCouplet(keyBundle);
  const nodes = new Map();
  const children = new Map();

  if (!start) {
    return { rootId: null, nodes, children };
  }

  const rootId = coupletNodeId(start.id);
  const visited = new Set();

  function ensureCoupletNode(couplet) {
    const id = coupletNodeId(couplet.id);
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        type: 'couplet',
        coupletId: Number(couplet.id),
        number: Number(couplet.number) || 0,
        label: `Couplet ${couplet.number ?? '?'}`,
      });
    }
    return id;
  }

  function walk(couplet) {
    const cid = Number(couplet.id);
    if (!Number.isFinite(cid) || visited.has(cid)) return;
    visited.add(cid);
    const nodeId = ensureCoupletNode(couplet);
    const outs = [];
    for (const lead of couplet.leads || []) {
      if (lead.next_couplet_id != null && lead.next_couplet_id !== '') {
        const next = byId.get(Number(lead.next_couplet_id));
        if (!next) continue;
        const childId = ensureCoupletNode(next);
        outs.push({ childId, lead });
        walk(next);
      } else if (lead.plant_id != null && lead.plant_id !== '') {
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
      }
    }
    children.set(nodeId, outs);
  }

  walk(start);
  return { rootId, nodes, children };
}

/**
 * Calcule largeurs de sous-arbres puis positions x/y (haut → bas).
 * @param {object} keyBundle
 * @returns {{ nodes: object[], edges: object[], width: number, height: number, rootId: string|null }}
 */
export function layoutIdKeySchema(keyBundle) {
  const { rootId, nodes, children } = buildIdKeyTree(keyBundle);
  if (!rootId || nodes.size === 0) {
    return { nodes: [], edges: [], width: PAD * 2, height: PAD * 2, rootId: null };
  }

  const subtreeWidth = new Map();

  function measure(nodeId) {
    const kids = children.get(nodeId) || [];
    if (kids.length === 0) {
      subtreeWidth.set(nodeId, H_GAP);
      return H_GAP;
    }
    let sum = 0;
    for (const { childId } of kids) {
      sum += measure(childId);
    }
    const w = Math.max(H_GAP, sum);
    subtreeWidth.set(nodeId, w);
    return w;
  }

  measure(rootId);

  const placed = new Map();
  const edges = [];

  function place(nodeId, left, depth) {
    const w = subtreeWidth.get(nodeId) || H_GAP;
    const x = left + w / 2;
    const y = PAD + depth * V_GAP;
    const base = nodes.get(nodeId);
    placed.set(nodeId, { ...base, x, y, depth });

    const kids = children.get(nodeId) || [];
    let cursor = left;
    for (const { childId, lead } of kids) {
      const cw = subtreeWidth.get(childId) || H_GAP;
      place(childId, cursor, depth + 1);
      const child = placed.get(childId);
      const midX = (x + child.x) / 2;
      const midY = (y + child.y) / 2;
      edges.push({
        id: `lead:${lead.id}`,
        leadId: Number(lead.id),
        fromId: nodeId,
        toId: childId,
        fromCoupletId: base.coupletId,
        statement: String(lead.statement || ''),
        label: truncateEdgeLabel(lead.statement),
        image_url: lead.image_url || null,
        plant_id: lead.plant_id != null ? Number(lead.plant_id) : null,
        next_couplet_id: lead.next_couplet_id != null ? Number(lead.next_couplet_id) : null,
        plant_name: lead.plant_name || null,
        plant_emoji: lead.plant_emoji || null,
        x1: x,
        y1: y,
        x2: child.x,
        y2: child.y,
        midX,
        midY,
      });
      cursor += cw;
    }
  }

  place(rootId, PAD, 0);

  const nodeList = [...placed.values()];
  let maxX = PAD;
  let maxY = PAD;
  for (const n of nodeList) {
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }

  return {
    nodes: nodeList,
    edges,
    width: Math.ceil(maxX + PAD + H_GAP / 2),
    height: Math.ceil(maxY + PAD + 40),
    rootId,
  };
}
