import {
  buildDicebearAvatarUrl,
  buildUploadedAvatarUrl,
  normalizeAvatarPath,
} from '../shared/profile/avatarUrl.js';
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
  return buildDicebearAvatarUrl(studentSeed(student));
}

function resolveAvatarPath(student) {
  if (!student) return null;
  const raw = student.avatar_path ?? student.avatarPath ?? null;
  return normalizeAvatarPath(raw);
}

function getStudentAvatarUrl(student) {
  const uploadedRel = buildUploadedAvatarUrl(resolveAvatarPath(student));
  const uploadedUrl = uploadedRel ? withAppBase(uploadedRel) : null;
  if (uploadedUrl) return uploadedUrl;
  return getDicebearAvatarUrl(student);
}

export { getDicebearAvatarUrl, getStudentAvatarUrl, resolveAvatarPath };
