/** Libellés visibles pour les rôles (terminologie unifiée n3beur / n3boss). */
const ROLE_UI_TERMS = {
  studentSingular: 'n3beur',
  studentPlural: 'n3beurs',
  teacherSingular: 'n3boss',
  teacherPlural: 'n3boss',
  teacherShort: 'n3boss',
  teacherShortPlural: 'n3boss',
};

/**
 * @param {boolean} [_isN3Affiliated] conservé pour compatibilité des appels ; ignoré. La
 * terminologie est unifiée depuis la suppression de l'affiliation par compte : les
 * consommateurs peuvent appeler `getRoleTerms()` sans argument.
 */
export function getRoleTerms(_isN3Affiliated) {
  return ROLE_UI_TERMS;
}
