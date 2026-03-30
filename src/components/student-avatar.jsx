import React, { useEffect, useMemo, useState } from 'react';
import { getDicebearAvatarUrl, getStudentAvatarUrl, resolveAvatarPath } from '../utils/avatar';

function StudentAvatar({ student, size = 28, style = {}, className = '' }) {
  const fallback = useMemo(() => getDicebearAvatarUrl(student), [
    student?.id,
    student?.pseudo,
    student?.first_name,
    student?.last_name,
    student?.displayName,
    student?.email,
  ]);
  const [src, setSrc] = useState(() => getStudentAvatarUrl(student));

  const pathKey = resolveAvatarPath(student) || '';
  useEffect(() => {
    setSrc(getStudentAvatarUrl(student));
  }, [
    pathKey,
    student?.id,
    student?.pseudo,
    student?.first_name,
    student?.last_name,
    student?.displayName,
    student?.email,
  ]);

  const imgKey = `${pathKey}|${student?.id || ''}`;

  return (
    <img
      key={imgKey}
      src={src}
      alt="Avatar"
      className={`student-avatar ${className}`.trim()}
      onError={() => setSrc(fallback)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        border: '1px solid rgba(255,255,255,.4)',
        ...style,
      }}
    />
  );
}

export { StudentAvatar };
