/**
 * Intercalage des scènes de récit dans le markdown de l'Histoire.
 *
 * Syntaxe : `![légende](scene:N)` où N est le rang (1-based) de la scène dans
 * la liste conventionnelle du chapitre (`chapterIllustrations`). La référence
 * est remplacée par l'URL résolue ; les scènes utilisées en ligne sont
 * exclues de la galerie de fin pour éviter les doublons. Une référence
 * non résoluble (rang hors liste, médiathèque vide) est retirée du texte.
 */

const SCENE_REF_RE = /!\[([^\]]*)\]\(\s*scene:(\d+)\s*\)/gi;

/**
 * @param {string} markdown texte de l'histoire
 * @param {Array<{key: string, url: string, caption?: string|null}>} scenes
 * @returns {{ markdown: string, usedKeys: string[] }}
 */
export function applyStorySceneRefs(markdown, scenes = []) {
  const raw = String(markdown ?? '');
  const list = Array.isArray(scenes) ? scenes : [];
  const usedKeys = [];
  const replaced = raw.replace(SCENE_REF_RE, (_match, alt, rank) => {
    const scene = list[Number(rank) - 1];
    if (!scene?.url) return '';
    if (!usedKeys.includes(scene.key)) usedKeys.push(scene.key);
    const label = String(alt || '').trim() || scene.caption || '';
    return `![${label}](${scene.url})`;
  });
  return { markdown: replaced, usedKeys };
}

/** Le markdown contient-il au moins une référence `scene:N` ? */
export function hasStorySceneRefs(markdown) {
  SCENE_REF_RE.lastIndex = 0;
  return SCENE_REF_RE.test(String(markdown ?? ''));
}
