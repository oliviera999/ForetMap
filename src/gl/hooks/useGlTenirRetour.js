import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { retourDuMoment } from '../utils/glTenirMoment.js';

/** Numéro d'ordre des retours de case : deux retours ne partagent jamais leur clé. */
let ordre = 0;
const dater = (texte) => {
  if (!texte) return null;
  ordre += 1;
  return { texte, at: Date.now(), id: ordre };
};

/**
 * « Tenir à deux » — le retour de la carte du moment (état `retour`) : ce que l'écran dit après
 * une fouille ou une question de case, jusqu'à ce que l'équipe touche « Continuer ».
 *
 * Un retour est **récent** ou il n'est rien : il s'efface seul quand le tour ou la phase change
 * (`tourCle`), et un retour déjà là quand l'écran s'ouvre n'est pas rejoué. Aucune attente sans
 * sortie : « Continuer », le geste suivant ou le changement de phase le ferment.
 *
 * @param {object} p
 * @param {object|null} [p.verdict] dernier verdict de chasse (`useGlChasse.dernierVerdict`)
 * @param {string} [p.caseFeedback] retour d'une question de case (`useGlQuestionDeCase.feedback`)
 * @param {string} [p.tourCle] « numéro du tour : phase » ; son changement acquitte le retour
 * @returns {{ retour: object|null, acquitter: () => void }}
 */
export function useGlTenirRetour({ verdict = null, caseFeedback = '', tourCle = '' } = {}) {
  // Le retour d'une question de case n'a pas d'heure : on la pose quand il arrive.
  const [caseRetour, setCaseRetour] = useState(() => dater(caseFeedback));
  const dernierFeedback = useRef(caseFeedback);
  useEffect(() => {
    if (dernierFeedback.current === caseFeedback) return;
    dernierFeedback.current = caseFeedback;
    setCaseRetour(dater(caseFeedback));
  }, [caseFeedback]);

  const brut = useMemo(() => retourDuMoment({ verdict, caseRetour }), [verdict, caseRetour]);
  const cle = brut?.cle || null;
  const cleRef = useRef(cle);
  cleRef.current = cle;

  // À l'ouverture de l'écran comme à chaque changement de tour ou de phase : ce qui est déjà
  // là est tenu pour vu.
  const [acquitte, setAcquitte] = useState(cle);
  useEffect(() => {
    setAcquitte(cleRef.current);
  }, [tourCle]);

  const acquitter = useCallback(() => setAcquitte(cleRef.current), []);
  return { retour: brut && cle !== acquitte ? brut : null, acquitter };
}
