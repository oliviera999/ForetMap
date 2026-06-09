import { describe, test, expect } from 'vitest';
import {
  taskLivingBeingEmoji,
  formatAssigneeName,
  teacherCollectiveAssigneeLoadKey,
  toQuickAssignStudentId,
} from '../../src/utils/taskDisplayHelpers.js';

describe('taskLivingBeingEmoji', () => {
  test('emoji de la plante trouvée, repli 🌱', () => {
    const plants = [{ name: 'Pommier', emoji: '🍎' }];
    expect(taskLivingBeingEmoji(plants, 'Pommier')).toBe('🍎');
    expect(taskLivingBeingEmoji(plants, 'Inconnu')).toBe('🌱');
    expect(taskLivingBeingEmoji(null, 'x')).toBe('🌱');
  });
});

describe('formatAssigneeName', () => {
  const student = { id: '7', first_name: 'Léa', last_name: 'Martin' };
  test('identité visible : prénom + nom', () => {
    expect(formatAssigneeName({ student_first_name: 'Tom', student_last_name: 'Roy' }, student))
      .toEqual({ fullName: 'Tom Roy', isCurrentStudent: false });
  });
  test('repli n3beur si pas de nom', () => {
    expect(formatAssigneeName({}, null).fullName).toBe('n3beur');
  });
  test('détecte l’élève courant (par id)', () => {
    const r = formatAssigneeName({ student_id: '7', student_first_name: 'Léa', student_last_name: 'Martin' }, student);
    expect(r.isCurrentStudent).toBe(true);
  });
  test('anonymisé : "Toi" pour soi, "Participant" sinon', () => {
    expect(formatAssigneeName({ student_id: '7' }, student, false))
      .toEqual({ fullName: 'Toi', isCurrentStudent: true });
    expect(formatAssigneeName({ student_first_name: 'Tom', student_last_name: 'Roy' }, student, false))
      .toEqual({ fullName: 'Participant', isCurrentStudent: false });
  });
});

describe('teacherCollectiveAssigneeLoadKey', () => {
  test('priorité id, puis student_id, puis nom, puis legacy', () => {
    expect(teacherCollectiveAssigneeLoadKey('5', { id: 9 })).toBe('5_teacher_collective_done_9');
    expect(teacherCollectiveAssigneeLoadKey('5', { student_id: '3' })).toBe('5_teacher_collective_done_sid:3');
    expect(teacherCollectiveAssigneeLoadKey('5', { student_first_name: 'Léa', student_last_name: 'Martin' }))
      .toBe('5_teacher_collective_done_Léa|Martin');
    expect(teacherCollectiveAssigneeLoadKey('5', {})).toBe('5_teacher_collective_done_legacy');
  });
});

describe('toQuickAssignStudentId', () => {
  test('coerce en chaîne, null/undefined → ""', () => {
    expect(toQuickAssignStudentId(42)).toBe('42');
    expect(toQuickAssignStudentId(null)).toBe('');
    expect(toQuickAssignStudentId(undefined)).toBe('');
  });
});
