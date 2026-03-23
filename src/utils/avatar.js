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

function getStudentAvatarUrl(student) {
  if (student && student.avatar_path) return `/uploads/${student.avatar_path.replace(/^\/+/, '')}`;
  return getDicebearAvatarUrl(student);
}

export { getDicebearAvatarUrl, getStudentAvatarUrl };
