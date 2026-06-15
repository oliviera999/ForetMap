import { useEffect, useRef } from 'react';

/**
 * Référence vivante vers la session élève courante (extrait de App.jsx, O5).
 *
 * Encapsule le couple `useRef` + `useEffect` d'App.jsx qui maintient une
 * référence synchronisée sur l'état `student`, afin que les callbacks
 * asynchrones (passe `fetchAll`, fusion `/api/auth/me`, validation de session…)
 * lisent toujours la valeur la plus récente sans dépendre de la fermeture du
 * rendu où ils ont été créés.
 *
 * Concern autonome et faiblement couplé : aucun état n'est déplacé ni créé. La
 * référence reste possédée ici puis renvoyée telle quelle ; App.jsx continue d'y
 * écrire impérativement (`studentRef.current = …` lors des logout / prise de
 * contrôle / mise à jour de session) — ces écritures restent inchangées.
 * Iso-comportement : même valeur initiale (`initialStudent`), même effet de
 * synchronisation et même dépendance (`student`) que l'ancien couple inline.
 *
 * @param {object|null} initialStudent - session élève initiale (au montage).
 * @param {object|null} student - état `student` courant à refléter dans la référence.
 * @returns {import('react').MutableRefObject<object|null>} référence toujours à jour.
 */
export function useStudentSessionRef(initialStudent, student) {
  const studentRef = useRef(initialStudent);
  useEffect(() => {
    studentRef.current = student;
  }, [student]);
  return studentRef;
}
