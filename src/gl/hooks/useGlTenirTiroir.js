import { useCallback, useEffect, useState } from 'react';

/** Sections du tiroir « L'équipe » que l'écran peut ouvrir directement. */
export const SECTIONS_DU_TIROIR = Object.freeze(['equipe', 'carnet']);

/**
 * « Tenir à deux » — le tiroir « L'équipe » de l'écran d'équipe : fermé par défaut, ouvert par
 * son bouton (☰) ou par le geste « Lire », qui l'ouvre sur le carnet de la classe.
 *
 * `nouveau` : le contenu du tiroir a changé depuis la dernière fois qu'on l'a vu (empreinte de
 * `empreinteDuTiroir`, `src/gl/utils/glTenirMoment.js`). Ce qui est là à l'ouverture de l'écran
 * est tenu pour vu ; ouvrir le tiroir éteint la pastille.
 *
 * @param {object} p
 * @param {string} [p.empreinte] empreinte du contenu du tiroir
 * @returns {{ ouvert: boolean, section: string, nouveau: boolean,
 *   ouvrir: (section?: string) => void, fermer: () => void, basculer: () => void }}
 */
export function useGlTenirTiroir({ empreinte = '' } = {}) {
  const [ouvert, setOuvert] = useState(false);
  const [section, setSection] = useState('equipe');
  const [vue, setVue] = useState(empreinte);

  // Tiroir ouvert : tout ce qui change est vu au fur et à mesure.
  useEffect(() => {
    if (ouvert) setVue(empreinte);
  }, [ouvert, empreinte]);

  const ouvrir = useCallback((cible = 'equipe') => {
    setSection(SECTIONS_DU_TIROIR.includes(cible) ? cible : 'equipe');
    setOuvert(true);
  }, []);
  const fermer = useCallback(() => setOuvert(false), []);
  const basculer = useCallback(() => {
    setSection('equipe');
    setOuvert((v) => !v);
  }, []);

  return { ouvert, section, nouveau: !ouvert && empreinte !== vue, ouvrir, fermer, basculer };
}
