import { useCallback, useEffect, useState } from 'react';

/** Sections du tiroir « L'équipe » que l'écran peut ouvrir directement. */
export const SECTIONS_DU_TIROIR = Object.freeze(['equipe', 'carnet']);

/**
 * « Tenir à deux » — le tiroir « L'équipe » de l'écran d'équipe : fermé par défaut, ouvert par
 * son bouton (☰) ou par le geste « Lire », qui l'ouvre sur le carnet de la classe.
 *
 * `nouveau` : le contenu du tiroir a changé depuis la dernière fois qu'on l'a vu (empreinte de
 * `empreinteDuTiroir`, `src/gl/utils/glTenirMoment.js`). Ce qui est là à l'ouverture de l'écran
 * est tenu pour vu ; ouvrir le tiroir éteint la pastille. Tant que le contenu n'est pas lu
 * (`empreinte` à `null` : le carnet charge encore), rien n'est nouveau, et la première empreinte
 * connue est tenue pour vue elle aussi.
 *
 * @param {object} p
 * @param {string|null} [p.empreinte] empreinte du contenu du tiroir (`null` : pas encore lu)
 * @returns {{ ouvert: boolean, section: string, nouveau: boolean,
 *   ouvrir: (section?: string) => void, fermer: () => void, basculer: () => void }}
 */
export function useGlTenirTiroir({ empreinte = '' } = {}) {
  const [ouvert, setOuvert] = useState(false);
  const [section, setSection] = useState('equipe');
  const [vue, setVue] = useState(empreinte);

  // Tiroir ouvert : tout ce qui change est vu au fur et à mesure. Première empreinte connue :
  // c'est l'état à l'ouverture de l'écran, déjà vu.
  useEffect(() => {
    if (empreinte == null) return;
    if (ouvert || vue == null) setVue(empreinte);
  }, [ouvert, empreinte, vue]);

  const ouvrir = useCallback((cible = 'equipe') => {
    setSection(SECTIONS_DU_TIROIR.includes(cible) ? cible : 'equipe');
    setOuvert(true);
  }, []);
  const fermer = useCallback(() => setOuvert(false), []);
  const basculer = useCallback(() => {
    setSection('equipe');
    setOuvert((v) => !v);
  }, []);

  const nouveau = !ouvert && empreinte != null && vue != null && empreinte !== vue;
  return { ouvert, section, nouveau, ouvrir, fermer, basculer };
}
