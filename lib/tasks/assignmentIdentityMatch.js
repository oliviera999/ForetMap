'use strict';

/**
 * Reconnaître les lignes d'un élève dans `task_assignments` / `task_logs`.
 *
 * Ces tables portent à la fois `student_id` et le couple `student_first_name` /
 * `student_last_name` : l'identifiant est venu plus tard, et les lignes créées avant lui
 * n'ont que le nom. D'où la condition historique, écrite à l'identique en six endroits :
 *
 *     student_id = ? OR (student_first_name = ? AND student_last_name = ?)
 *
 * Elle a un défaut : le `OR` s'applique **aussi** aux lignes qui possèdent un
 * `student_id`. Deux élèves qui portent le même prénom et le même nom — deux frères, deux
 * homonymes d'une même promotion — se reconnaissent donc mutuellement. Les conséquences
 * allaient bien au-delà d'un compteur faussé :
 *
 *   - le plafond d'inscriptions était partagé : l'un bloquait l'autre ;
 *   - marquer une tâche « faite » pouvait cocher la ligne du camarade ;
 *   - se désinscrire supprimait potentiellement l'inscription de l'autre ;
 *   - **supprimer un compte effaçait les inscriptions et journaux de son homonyme.**
 *
 * La règle retenue distingue les deux populations de lignes plutôt que de les mélanger :
 *
 *   - une ligne qui **porte** un `student_id` n'est reconnue que par cet identifiant ;
 *   - une ligne qui n'en a pas — donc héritée — reste reconnue par le nom.
 *
 * Aucune reprise de données n'est nécessaire, et rien n'est perdu pour les lignes
 * anciennes. Un élève sans identifiant (flux invité par nom) retombe naturellement sur la
 * seule branche « nom ».
 */

/**
 * Fragment SQL et paramètres pour reconnaître les lignes d'un élève.
 *
 * @param {string} alias préfixe de colonnes (`'ta'`, `''` pour une table sans alias)
 * @returns {{ clause: string, params: (studentId: string|null, firstName: string, lastName: string) => Array }}
 */
function assignmentIdentityMatch(alias = '') {
  const col = alias ? `${alias}.` : '';
  const clause =
    `((? IS NOT NULL AND ${col}student_id = ?) ` +
    `OR (${col}student_id IS NULL AND ${col}student_first_name = ? AND ${col}student_last_name = ?))`;
  return {
    clause,
    params(studentId, firstName, lastName) {
      const sid = studentId != null && String(studentId).trim() !== '' ? String(studentId) : null;
      return [sid, sid, String(firstName || '').trim(), String(lastName || '').trim()];
    },
  };
}

module.exports = { assignmentIdentityMatch };
