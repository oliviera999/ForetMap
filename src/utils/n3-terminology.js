const DEFAULT_TERMS = {
  studentSingular: 'élève',
  studentPlural: 'élèves',
  teacherSingular: 'professeur',
  teacherPlural: 'professeurs',
  teacherShort: 'prof',
  teacherShortPlural: 'profs',
};

const N3_TERMS = {
  studentSingular: 'n3beur',
  studentPlural: 'n3beurs',
  teacherSingular: 'n3boss',
  teacherPlural: 'n3boss',
  teacherShort: 'n3boss',
  teacherShortPlural: 'n3boss',
};

export function isN3OnlyAffiliation(affiliation) {
  return String(affiliation || '').toLowerCase() === 'n3';
}

export function getRoleTerms(isN3Affiliated) {
  return isN3Affiliated ? N3_TERMS : DEFAULT_TERMS;
}
