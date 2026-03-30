import { withAppBase } from '../services/api';

function studentSeed(student) {
  if (!student) return 'foretmap';
  return (
    student.pseudo ||
    [student.first_name, student.last_name].filter(Boolean).join('-') ||
    student.id ||
    'foretmap'
  );
}

function getDicebearAvatarUrl(student) {
  const seed = encodeURIComponent(studentSeed(student));
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${seed}&radius=50`;
}

function resolveAvatarPath(student) {
  if (!student) return null;
  const raw = student.avatar_path ?? student.avatarPath ?? null;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().replace(/^\/+/, '');
}

function getStudentAvatarUrl(student) {
  const rel = resolveAvatarPath(student);
  if (rel) return withAppBase(`/uploads/${rel}`);
  return getDicebearAvatarUrl(student);
}

export { getDicebearAvatarUrl, getStudentAvatarUrl, resolveAvatarPath };
